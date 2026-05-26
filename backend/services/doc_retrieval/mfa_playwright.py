"""Playwright-driven MFA solvers — companion to `playwright_adapter.py`.

Same surface as the legacy `mfa_http.py` (TOTP auto-solve, HIL pending for
the rest) but drives a `playwright.async_api.Page` instead of an httpx
session. The Page already carries the carrier's session cookie via the
BrowserContext, so subsequent navigations and form posts ride the same
authenticated session.

Public entries:
    solve_playwright(page, carrier, spec) -> None | HilPending
    complete_hil_playwright(page, carrier, handler, response, spec) -> None
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

# pyrefly: ignore [missing-import]
import pyotp
# pyrefly: ignore [missing-import]
from playwright.async_api import Page

from .models import Carrier, MfaPrompt


# Re-exported by orchestrator via `from .mfa_playwright import HilPending`.
# Same shape as `mfa_http.HilPending`; kept separate so the two adapters can
# evolve independently if needed.
@dataclass
class HilPending:
    prompt: MfaPrompt
    handler: Literal["email_otp", "email_link", "captcha_hil"]


async def solve_playwright(page: Page, carrier: Carrier, spec: dict) -> HilPending | None:
    """Returns None if the MFA step is auto-resolved (TOTP or auto-poll),
    otherwise a HilPending the adapter forwards to the HIL callback."""
    kind = carrier.mfa_kind

    if kind == "none":
        return None

    if kind == "totp_rfc6238":
        if not carrier.totp_secret_b32:
            raise RuntimeError(f"Carrier {carrier.carrier_id} marked totp_rfc6238 but no totp_secret_b32 set")
        await page.goto("/mfa", wait_until="domcontentloaded")
        code = pyotp.TOTP(carrier.totp_secret_b32).now()
        await _fill_and_submit(page, spec.get("mfa_totp_code"), code, spec.get("mfa_submit"))
        return None

    if kind == "captcha_bypass":
        # Carrier presents a "I'm not a robot" checkbox or click-through page
        # but doesn't actually challenge with image text. Just click the
        # submit and continue.
        await page.goto("/mfa", wait_until="domcontentloaded")
        submit_sel = spec.get("mfa_submit")
        if submit_sel:
            try:
                await page.locator(submit_sel).click()
            except Exception:
                # Some carriers auto-redirect from /mfa when there's nothing
                # to do. Safe to ignore a missing button.
                pass
        return None

    if kind == "email_otp":
        await page.goto("/mfa", wait_until="domcontentloaded")
        # Mock-only shortcut: read the OTP from the carrier's test endpoint.
        otp = await _fetch_test_endpoint(page, "/__test__/last-email-otp")
        if otp:
            await _fill_and_submit(page, spec.get("mfa_email_code"), otp, spec.get("mfa_submit"))
            return None
        return HilPending(
            prompt=MfaPrompt(kind="email_otp", instruction="Enter the 6-digit code from your email."),
            handler="email_otp",
        )

    if kind == "email_link":
        await page.goto("/mfa", wait_until="domcontentloaded")
        link = await _fetch_test_endpoint(page, "/__test__/last-email-link")
        if link:
            await page.goto(link, wait_until="domcontentloaded")
            return None
        return HilPending(
            prompt=MfaPrompt(kind="email_link", instruction="Open the sign-in link we emailed you."),
            handler="email_link",
        )

    if kind == "captcha_hil":
        await page.goto("/mfa", wait_until="domcontentloaded")
        # Fully-qualified URL so the broker UI can fetch the image cross-origin.
        captcha_url = page.url.rsplit("/mfa", 1)[0] + "/captcha.png"
        return HilPending(
            prompt=MfaPrompt(
                kind="captcha_hil",
                instruction="Type the characters shown in the image.",
                captcha_image_url=captcha_url,
            ),
            handler="captcha_hil",
        )

    raise RuntimeError(f"Unsupported mfa_kind: {kind}")


async def complete_hil_playwright(
    page: Page, carrier: Carrier, handler: str, response: str, spec: dict,
) -> None:
    """Apply the broker-supplied response and finish the MFA exchange."""
    if handler == "email_otp":
        await _fill_and_submit(page, spec.get("mfa_email_code"), response.strip(), spec.get("mfa_submit"))
        return
    if handler == "email_link":
        if response.strip():
            await page.goto(response.strip(), wait_until="domcontentloaded")
        # else: the worker should have already navigated to the magic link
        # (see solve_playwright auto-resume), nothing more to do.
        return
    if handler == "captcha_hil":
        # The carrier issued a CSRF token bound to this session — fill it
        # automatically (the form already carries it) and submit the answer.
        await _fill_and_submit(
            page, spec.get("mfa_captcha_code"), response.strip().upper(), spec.get("mfa_submit"),
        )
        return
    raise RuntimeError(f"Unknown HIL handler: {handler}")


async def _fill_and_submit(page: Page, code_selector: str | None, code: str, submit_selector: str | None) -> None:
    """Fill the MFA code field and click submit. Tolerant of missing selectors
    (some specs only define one of them)."""
    if code_selector:
        await page.locator(code_selector).fill(code)
    if submit_selector:
        await page.locator(submit_selector).click()
    else:
        # Fallback: many forms submit on Enter.
        if code_selector:
            await page.locator(code_selector).press("Enter")


async def _fetch_test_endpoint(page: Page, path: str) -> str:
    """Use Playwright's APIRequestContext (rides the BrowserContext cookies)
    to fetch a test-only endpoint. Returns the stripped body or "" on miss.
    """
    resp = await page.request.get(path)
    if resp.status != 200:
        return ""
    text = await resp.text()
    return text.strip()
