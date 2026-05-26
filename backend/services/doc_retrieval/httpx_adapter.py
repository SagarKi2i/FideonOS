"""Legacy httpx-based carrier adapter (kept for reference, not loaded).

This was the v0 implementation used while we ironed out Windows ProactorEventLoop
issues with Playwright. As of FNF-569, the active adapter is
`playwright_adapter.py` (real browser via `playwright.async_api`). This file
is preserved in-tree as a fallback / reference for anyone re-creating the
plain-HTTP path against a deterministic mock.

To re-enable: alias `playwright_adapter` to this module via a feature flag in
config.py — but note that this path cannot drive a JS-heavy real carrier.

Public entry: `run_adapter(carrier, user_inputs, download_dir, on_mfa_required)`
returns the list of downloaded docs as `DownloadedDoc`s.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable
from urllib.parse import urljoin, urlparse

# pyrefly: ignore [missing-import]
import httpx

from services.observability.errors import (
    AuthFailedError,
    SelectorDriftError,
    TransientError,
)
from services.observability.retry import retry_doc_retrieval_step

from .mfa_http import HilPending, solve_http, complete_hil_http
from .models import Carrier, DownloadedDoc


@dataclass
class AdapterCredentials:
    username: str
    password: str


@dataclass
class UserInputs:
    doc_type: str
    policy_number: str
    insured_name: str


DEFAULT_MOCK_CREDS = AdapterCredentials(username="fideon_demo", password="fideon_demo_pw_2026")


HilCallback = Callable[[HilPending, httpx.AsyncClient], Awaitable[str]]


async def run_adapter(
    *,
    carrier: Carrier,
    user_inputs: UserInputs,
    download_dir: Path,
    credentials: AdapterCredentials | None = None,
    on_mfa_required: HilCallback | None = None,
) -> list[DownloadedDoc]:
    creds = credentials or DEFAULT_MOCK_CREDS
    spec = carrier.listing_selector_spec
    download_dir.mkdir(parents=True, exist_ok=True)
    base_url = _base_url(carrier.login_url)

    async with httpx.AsyncClient(
        base_url=base_url, follow_redirects=False, timeout=15.0,
    ) as client:
        await _authenticate(client, creds)

        mfa = await solve_http(client, carrier)
        if isinstance(mfa, HilPending):
            if not on_mfa_required:
                from services.observability.errors import FatalAdapterError
                raise FatalAdapterError("HIL MFA required but no callback provided.")
            response = await on_mfa_required(mfa, client)
            await complete_hil_http(client, carrier, mfa.handler, response)

        rows = await _list_and_filter(client, carrier, spec, user_inputs)

        docs: list[DownloadedDoc] = []
        for row in rows:
            doc = await _download_row(client, base_url, row, download_dir, carrier)
            if doc:
                docs.append(doc)
        return docs


@retry_doc_retrieval_step()
async def _authenticate(client: httpx.AsyncClient, creds: AdapterCredentials) -> None:
    try:
        resp = await client.post(
            "/login",
            data={"username": creds.username, "password": creds.password},
        )
    except httpx.HTTPError as exc:
        raise TransientError(f"login request failed: {exc}") from exc
    if resp.status_code == 401:
        raise AuthFailedError("Carrier rejected the credentials.")
    if resp.status_code not in (200, 303):
        raise SelectorDriftError(f"unexpected login response: {resp.status_code}")


def _base_url(login_url: str) -> str:
    u = urlparse(login_url)
    return f"{u.scheme}://{u.netloc}"


@dataclass
class _RowHandle:
    href: str
    policy: str
    insured: str
    doc_type_raw: str


@retry_doc_retrieval_step()
async def _list_and_filter(
    client: httpx.AsyncClient, carrier: Carrier, spec: dict[str, Any], user_inputs: UserInputs,
) -> list[_RowHandle]:
    paths_to_try: list[str] = []
    max_pages = int(spec.get("max_pages", 1)) if "next_page" in spec else 1
    if "iframe_selector" in spec:
        paths_to_try.append("/documents/inner")
    else:
        paths_to_try.append("/documents")

    all_rows: list[_RowHandle] = []
    for page_idx in range(max_pages):
        path = paths_to_try[0]
        if "next_page" in spec and page_idx > 0:
            path = f"/documents?page={page_idx + 1}"
        try:
            resp = await client.get(path)
        except httpx.HTTPError as exc:
            raise TransientError(f"documents fetch failed: {exc}") from exc
        if resp.status_code in (302, 303):
            raise AuthFailedError(
                f"documents page redirected to {resp.headers.get('location')}; session not established."
            )
        if resp.status_code != 200:
            raise SelectorDriftError(f"documents page returned {resp.status_code}")

        rows = _parse_rows(resp.text, spec)
        if not rows:
            raise SelectorDriftError("No rows parsed from documents page; spec may not match the DOM.")
        all_rows.extend(rows)

        if "next_page" not in spec:
            break
        if 'data-testid="docs-next-page"' not in resp.text and "next_page" not in resp.text:
            break

    return [
        r for r in all_rows
        if r.doc_type_raw.lower() == user_inputs.doc_type.lower()
        and (not user_inputs.policy_number or user_inputs.policy_number.lower() in r.policy.lower())
    ]


def _parse_rows(html: str, spec: dict[str, Any]) -> list[_RowHandle]:
    if "doc_policy_col" in spec:
        return _parse_rows_column(html, spec)
    if "aria-label" in spec.get("doc_row", ""):
        return _parse_rows_aria(html)
    return _parse_rows_testid(html)


_ROW_TESTID = re.compile(r'<tr[^>]*data-testid="doc-row"[^>]*>(.*?)</tr>', re.IGNORECASE | re.DOTALL)
_ROW_ARIA = re.compile(r'<tr[^>]*aria-label="document-row"[^>]*>(.*?)</tr>', re.IGNORECASE | re.DOTALL)
_TBODY_TR = re.compile(r"<tbody[^>]*>(.*?)</tbody>", re.IGNORECASE | re.DOTALL)
_TR = re.compile(r"<tr[^>]*>(.*?)</tr>", re.IGNORECASE | re.DOTALL)
_TD = re.compile(r"<td[^>]*>(.*?)</td>", re.IGNORECASE | re.DOTALL)


def _cell_testid(row_html: str, key: str) -> str:
    m = re.search(rf'data-testid="{key}"[^>]*>(.*?)</td>', row_html, re.IGNORECASE | re.DOTALL)
    return m.group(1).strip() if m else ""


def _cell_aria(row_html: str, key: str) -> str:
    m = re.search(rf'aria-label="{key}"[^>]*>(.*?)</td>', row_html, re.IGNORECASE | re.DOTALL)
    return m.group(1).strip() if m else ""


def _href_from_row(row_html: str, attr_marker: str) -> str:
    m = re.search(rf'<a[^>]*{attr_marker}[^>]*href="([^"]+)"', row_html, re.IGNORECASE)
    if m:
        return m.group(1)
    m = re.search(r'<a[^>]*href="([^"]+)"', row_html, re.IGNORECASE)
    return m.group(1) if m else ""


def _parse_rows_testid(html: str) -> list[_RowHandle]:
    return [
        _RowHandle(
            href=_href_from_row(row_html, 'data-testid="doc-download"'),
            policy=_cell_testid(row_html, "doc-policy"),
            insured=_cell_testid(row_html, "doc-insured"),
            doc_type_raw=_cell_testid(row_html, "doc-type"),
        )
        for row_html in _ROW_TESTID.findall(html)
    ]


def _parse_rows_aria(html: str) -> list[_RowHandle]:
    return [
        _RowHandle(
            href=_href_from_row(row_html, 'aria-label="download"'),
            policy=_cell_aria(row_html, "policy"),
            insured=_cell_aria(row_html, "insured"),
            doc_type_raw=_cell_aria(row_html, "doc-type"),
        )
        for row_html in _ROW_ARIA.findall(html)
    ]


def _parse_rows_column(html: str, spec: dict[str, Any]) -> list[_RowHandle]:
    tbody = _TBODY_TR.search(html)
    body_html = tbody.group(1) if tbody else html
    out: list[_RowHandle] = []
    for tr_html in _TR.findall(body_html):
        cells = _TD.findall(tr_html)
        max_idx = max(spec["doc_policy_col"], spec["doc_insured_col"], spec["doc_type_col"], spec["doc_download_col"])
        if len(cells) <= max_idx:
            continue
        anchor_cell = cells[spec["doc_download_col"]]
        m = re.search(r'href="([^"]+)"', anchor_cell, re.IGNORECASE)
        href = m.group(1) if m else ""
        if not href:
            continue
        out.append(_RowHandle(
            href=href,
            policy=re.sub(r"<[^>]+>", "", cells[spec["doc_policy_col"]]).strip(),
            insured=re.sub(r"<[^>]+>", "", cells[spec["doc_insured_col"]]).strip(),
            doc_type_raw=re.sub(r"<[^>]+>", "", cells[spec["doc_type_col"]]).strip(),
        ))
    return out


@retry_doc_retrieval_step()
async def _download_row(
    client: httpx.AsyncClient, base_url: str, row: _RowHandle,
    download_dir: Path, carrier: Carrier,
) -> DownloadedDoc | None:
    abs_url = row.href if row.href.startswith("http") else urljoin(base_url + "/", row.href.lstrip("/"))
    try:
        resp = await client.get(abs_url)
    except httpx.HTTPError as exc:
        raise TransientError(f"download failed: {exc}") from exc
    if resp.status_code != 200:
        raise TransientError(f"download HTTP {resp.status_code} for {abs_url}")
    body = resp.content
    suggested = _filename_from_response(resp, fallback=f"{row.policy}_{row.doc_type_raw}.pdf")
    target = download_dir / suggested
    target.write_bytes(body)

    classified, confidence = _classify(row.doc_type_raw, suggested)

    return DownloadedDoc(
        doc_id=f"{carrier.carrier_id}-{row.policy}-{row.doc_type_raw}",
        filename=suggested,
        doc_type=row.doc_type_raw,
        policy_number=row.policy,
        insured_name=row.insured,
        issued_on="",
        size_bytes=len(body),
        local_path=str(target),
        classified_doc_type=classified,
        classification_confidence=confidence,
    )


def _filename_from_response(resp: httpx.Response, fallback: str) -> str:
    cd = resp.headers.get("content-disposition", "")
    m = re.search(r'filename="?([^";]+)"?', cd)
    return m.group(1) if m else fallback


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
