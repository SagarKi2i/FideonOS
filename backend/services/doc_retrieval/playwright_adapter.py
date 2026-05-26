"""Generic carrier adapter — drives one carrier end-to-end via Playwright.

FNF-569 swapped this back from the v0 httpx + regex stopgap (preserved in
`httpx_adapter.py` for reference) to a real browser. Rationale: real carrier
portals run JS and React; httpx-and-regex can't follow that. The mocks are
deterministic FastAPI servers, so Playwright drives them the same way it
will drive a real Travelers / Hartford portal in prod.

Selector-spec contract is unchanged — same CSS-style selectors the v0 path
read, now consumed via `page.locator()`.

Public entry: `run_adapter(carrier, user_inputs, download_dir, on_mfa_required)`
returns the list of downloaded docs as `DownloadedDoc`s.

Windows note: requires `WindowsProactorEventLoopPolicy` (set in
backend/run_server.py) so chromium subprocess spawn works. uvicorn's default
SelectorEventLoop would crash on `asyncio.create_subprocess_exec`.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable

import structlog
# pyrefly: ignore [missing-import]
from playwright.async_api import (
    BrowserContext,
    Download,
    Page,
    async_playwright,
)

from services.observability.errors import (
    AuthFailedError,
    SelectorDriftError,
    TransientError,
)
from services.observability.retry import retry_doc_retrieval_step
from services.storage import azure_blob

from .mfa_playwright import HilPending, complete_hil_playwright, solve_playwright
from .models import Carrier, DownloadedDoc


log = structlog.get_logger("doc_retrieval.playwright_adapter")


@dataclass
class AdapterCredentials:
    username: str
    password: str


@dataclass
class UserInputs:
    doc_type: str
    policy_number: str
    insured_name: str


@dataclass
class _RowHandle:
    """One scraped doc row. `download_locator` is a Playwright Locator
    pointing at the anchor/button that triggers the download — we click it
    rather than reading the href, because some carriers issue one-time
    signed URLs only after the click."""
    download_locator: Any
    policy: str
    insured: str
    doc_type_raw: str


# Mock username / password (must match mock_carriers/shared/data.py).
DEFAULT_MOCK_CREDS = AdapterCredentials(username="fideon_demo", password="fideon_demo_pw_2026")


# Callback signature: receives the prompt and the live BrowserContext so the
# parked session can keep cookies/state alive across HIL resume. Returns the
# user's response string.
HilCallback = Callable[[HilPending, BrowserContext], Awaitable[str]]


async def run_adapter(
    *,
    carrier: Carrier,
    user_inputs: UserInputs,
    download_dir: Path,
    run_id: str = "",
    credentials: AdapterCredentials | None = None,
    on_mfa_required: HilCallback | None = None,
) -> list[DownloadedDoc]:
    """Drive a single carrier end-to-end via Chromium. The BrowserContext is
    torn down on return — callers who need to keep it alive across HIL must
    hold a reference via `on_mfa_required`."""
    creds = credentials or DEFAULT_MOCK_CREDS
    spec = carrier.listing_selector_spec
    download_dir.mkdir(parents=True, exist_ok=True)
    base_url = _base_url(carrier.login_url)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(accept_downloads=True, base_url=base_url)
        page = await context.new_page()
        try:
            await _authenticate(page, carrier, creds, spec)

            mfa = await solve_playwright(page, carrier, spec)
            if isinstance(mfa, HilPending):
                if not on_mfa_required:
                    from services.observability.errors import FatalAdapterError
                    raise FatalAdapterError("HIL MFA required but no callback provided.")
                response = await on_mfa_required(mfa, context)
                await complete_hil_playwright(page, carrier, mfa.handler, response, spec)

            rows = await _list_and_filter(page, carrier, spec, user_inputs)

            docs: list[DownloadedDoc] = []
            for row in rows:
                doc = await _download_row(page, row, download_dir, carrier, run_id)
                if doc:
                    docs.append(doc)
            return docs
        finally:
            await context.close()
            await browser.close()


# ── Authenticate ─────────────────────────────────────────────────────────────

@retry_doc_retrieval_step()
async def _authenticate(page: Page, carrier: Carrier, creds: AdapterCredentials, spec: dict[str, Any]) -> None:
    """Navigate to /login, fill the form, submit. Tolerant of carriers that
    redirect to /mfa vs land back on /login on failure."""
    try:
        resp = await page.goto("/login", wait_until="domcontentloaded")
    except Exception as exc:  # network / launch errors
        raise TransientError(f"login navigation failed: {exc}") from exc

    if resp is None:
        raise TransientError("login navigation returned no response")

    if resp.status >= 500:
        raise TransientError(f"login page returned HTTP {resp.status}")
    if resp.status >= 400:
        raise SelectorDriftError(f"login page returned HTTP {resp.status}")

    username_sel = spec.get("login_username") or '[name="username"]'
    password_sel = spec.get("login_password") or '[name="password"]'
    submit_sel = spec.get("login_submit") or '[type="submit"]'

    try:
        await page.locator(username_sel).fill(creds.username)
        await page.locator(password_sel).fill(creds.password)
        async with page.expect_navigation(wait_until="domcontentloaded"):
            await page.locator(submit_sel).click()
    except Exception as exc:
        raise SelectorDriftError(f"login form interaction failed: {exc}") from exc

    # The mocks issue 303 to /mfa on success, or render /login with an error on bad creds.
    if "/login" in page.url and await _looks_like_failed_login(page):
        raise AuthFailedError("Carrier rejected the credentials.")


async def _looks_like_failed_login(page: Page) -> bool:
    """Tolerant signal that we're still on /login because creds were rejected.
    Matches any visible "invalid" / "incorrect" copy the mocks render."""
    try:
        body = await page.locator("body").inner_text(timeout=500)
    except Exception:
        return False
    lower = body.lower()
    return "invalid" in lower or "incorrect" in lower or "wrong" in lower


def _base_url(login_url: str) -> str:
    from urllib.parse import urlparse
    u = urlparse(login_url)
    return f"{u.scheme}://{u.netloc}"


# ── List + filter ────────────────────────────────────────────────────────────

@retry_doc_retrieval_step()
async def _list_and_filter(
    page: Page, carrier: Carrier, spec: dict[str, Any], user_inputs: UserInputs,
) -> list[_RowHandle]:
    """Navigate to /documents, descend into iframes / paginate as the spec
    dictates, and return matching rows."""
    try:
        resp = await page.goto("/documents", wait_until="domcontentloaded")
    except Exception as exc:
        raise TransientError(f"documents fetch failed: {exc}") from exc
    if resp is None or resp.status >= 500:
        raise TransientError(f"documents page returned HTTP {resp.status if resp else 'none'}")
    if resp.status in (302, 303):
        raise AuthFailedError("documents page redirected; session not established.")
    if resp.status >= 400:
        raise SelectorDriftError(f"documents page returned HTTP {resp.status}")

    scope = await _enter_iframe_if_any(page, spec)
    all_rows = await _scrape_rows(scope, spec)

    # Pagination loop. The mock exposes data-testid="docs-next-page" when more
    # pages exist; we click it and re-scrape. Hard cap by spec.max_pages.
    if "next_page" in spec:
        max_pages = int(spec.get("max_pages", 5))
        next_sel = spec["next_page"]
        for _ in range(max_pages - 1):
            next_btn = page.locator(next_sel)
            if await next_btn.count() == 0 or not await next_btn.first.is_visible():
                break
            try:
                async with page.expect_navigation(wait_until="domcontentloaded"):
                    await next_btn.first.click()
            except Exception:
                # Some implementations swap content in place — fall back to click + wait_for_load_state.
                await next_btn.first.click()
                await page.wait_for_load_state("domcontentloaded")
            scope = await _enter_iframe_if_any(page, spec)
            page_rows = await _scrape_rows(scope, spec)
            if not page_rows:
                break
            all_rows.extend(page_rows)

    if not all_rows:
        raise SelectorDriftError("No rows parsed from documents page; spec may not match the DOM.")

    target_type = user_inputs.doc_type.lower()
    policy_q = user_inputs.policy_number.lower()
    return [
        r for r in all_rows
        if r.doc_type_raw.lower() == target_type
        and (not policy_q or policy_q in r.policy.lower())
    ]


async def _enter_iframe_if_any(page: Page, spec: dict[str, Any]):
    """Return a `page`-like locator scope. If the spec declares an
    `iframe_selector`, drop into the frame; otherwise return the page itself."""
    iframe_sel = spec.get("iframe_selector")
    if not iframe_sel:
        return page
    try:
        return page.frame_locator(iframe_sel)
    except Exception as exc:
        raise SelectorDriftError(f"iframe '{iframe_sel}' not found: {exc}") from exc


async def _scrape_rows(scope, spec: dict[str, Any]) -> list[_RowHandle]:
    """Dispatch to the right scrape strategy based on spec keys."""
    if "doc_policy_col" in spec:
        return await _scrape_rows_column(scope, spec)
    return await _scrape_rows_locator(scope, spec)


async def _scrape_rows_locator(scope, spec: dict[str, Any]) -> list[_RowHandle]:
    """Attribute-style scrape: read each row by selector, then extract child
    cells by selector. Works for `data-testid`, `aria-label`, and any
    arbitrary attribute-based DOM."""
    row_sel = spec.get("doc_row")
    if not row_sel:
        raise SelectorDriftError("spec is missing 'doc_row' selector")
    policy_sel = spec.get("doc_policy")
    insured_sel = spec.get("doc_insured")
    type_sel = spec.get("doc_type")
    download_sel = spec.get("doc_download")
    if not all([policy_sel, insured_sel, type_sel, download_sel]):
        raise SelectorDriftError("spec missing one of doc_policy/doc_insured/doc_type/doc_download")

    rows = scope.locator(row_sel)
    count = await rows.count()
    out: list[_RowHandle] = []
    for i in range(count):
        row = rows.nth(i)
        try:
            policy = (await row.locator(policy_sel).first.inner_text(timeout=2000)).strip()
            insured = (await row.locator(insured_sel).first.inner_text(timeout=2000)).strip()
            doc_type_raw = (await row.locator(type_sel).first.inner_text(timeout=2000)).strip()
            dl = row.locator(download_sel).first
        except Exception:
            continue
        out.append(_RowHandle(
            download_locator=dl,
            policy=policy,
            insured=insured,
            doc_type_raw=doc_type_raw,
        ))
    return out


async def _scrape_rows_column(scope, spec: dict[str, Any]) -> list[_RowHandle]:
    """Column-index style (Hartford legacy table). No per-cell selectors —
    walk <td>s by ordinal position."""
    table_sel = spec.get("doc_table") or "table"
    rows = scope.locator(f"{table_sel} tbody tr")
    count = await rows.count()
    out: list[_RowHandle] = []
    policy_col = spec["doc_policy_col"]
    insured_col = spec["doc_insured_col"]
    type_col = spec["doc_type_col"]
    download_col = spec["doc_download_col"]
    for i in range(count):
        row = rows.nth(i)
        cells = row.locator("td")
        cell_count = await cells.count()
        if cell_count <= max(policy_col, insured_col, type_col, download_col):
            continue
        try:
            policy = (await cells.nth(policy_col).inner_text(timeout=2000)).strip()
            insured = (await cells.nth(insured_col).inner_text(timeout=2000)).strip()
            doc_type_raw = (await cells.nth(type_col).inner_text(timeout=2000)).strip()
            dl = cells.nth(download_col).locator("a, button").first
        except Exception:
            continue
        if await dl.count() == 0:
            continue
        out.append(_RowHandle(
            download_locator=dl,
            policy=policy,
            insured=insured,
            doc_type_raw=doc_type_raw,
        ))
    return out


# ── Download ─────────────────────────────────────────────────────────────────

@retry_doc_retrieval_step()
async def _download_row(
    page: Page, row: _RowHandle, download_dir: Path, carrier: Carrier,
    run_id: str,
) -> DownloadedDoc | None:
    """Click the row's download anchor/button, persist the resulting file,
    and (if Azure is configured) upload to blob storage.

    The local staging file is always written first so the upload can read
    the bytes and the local copy survives an upload failure for debugging.
    `DownloadedDoc.local_path` is the blob URL when Azure is enabled,
    otherwise the local FS path."""
    try:
        async with page.expect_download(timeout=15_000) as dl_info:
            await row.download_locator.click()
        download: Download = await dl_info.value
    except Exception as exc:
        raise TransientError(f"download click failed: {exc}") from exc

    suggested = download.suggested_filename or f"{row.policy}_{row.doc_type_raw}.pdf"
    target = download_dir / suggested
    await download.save_as(target)
    body = target.read_bytes()

    storage_path = str(target)
    if azure_blob.is_enabled():
        try:
            storage_path = await azure_blob.upload_run_blob(run_id, suggested, body)
        except Exception as exc:
            # Non-fatal: keep the local path so the run still completes. The
            # warning log is enough to investigate the failure later.
            log.warning("blob_upload_failed", run_id=run_id, filename=suggested, error=str(exc))

    classified, confidence = _classify(row.doc_type_raw, suggested)

    return DownloadedDoc(
        doc_id=f"{carrier.carrier_id}-{row.policy}-{row.doc_type_raw}",
        filename=suggested,
        doc_type=row.doc_type_raw,
        policy_number=row.policy,
        insured_name=row.insured,
        issued_on="",
        size_bytes=len(body),
        local_path=storage_path,
        classified_doc_type=classified,
        classification_confidence=confidence,
    )


_CANONICAL = {
    "policy_renewal", "cancellation", "endorsement", "memo",
    "invoice", "certificate", "deck_page", "loss_run",
}


def _classify(label: str, filename: str) -> tuple[str, float]:
    norm = label.lower().replace(" ", "_")
    if norm in _CANONICAL:
        return norm, 0.99
    for canon in _CANONICAL:
        if canon in filename.lower():
            return canon, 0.85
    return "memo", 0.30
