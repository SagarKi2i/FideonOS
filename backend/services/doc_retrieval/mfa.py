"""MFA solvers + HIL pending result.

The orchestrator calls `solve(carrier, page, context)` after a successful
login submission. The returned value is either:
    - None             → no MFA required; carry on to documents
    - HilPending(...)  → orchestrator parks the session, sets status=awaiting_mfa,
                         emits prompt event, returns. UI submits via
                         POST /runs/{run_id}/mfa-response which routes back
                         here via `complete_hil(...)`.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

import httpx
import pyotp

from .models import Carrier, MfaPrompt

if TYPE_CHECKING:  # pragma: no cover
    from playwright.async_api import Page


@dataclass
class HilPending:
    """Returned by `solve` when human input is required. The orchestrator parks
    the Playwright session keyed by run_id and waits for the user's response."""
    prompt: MfaPrompt
    handler: Literal["email_otp", "email_link", "captcha_hil"]


async def solve(carrier: Carrier, page: "Page") -> HilPending | None:
    """Top-level MFA dispatch. Returns None if MFA completed inline, or a
    `HilPending` if the orchestrator needs to wait for human input.

    Mocks expose `__test__/last-email-otp` and `__test__/last-email-link`
    helpers so the auto-solve tier can drive HIL flows without a real human
    when the carrier is a mock. Real carriers obviously don't have those, so
    the path falls through to `HilPending` in production."""

    kind = carrier.mfa_kind

    if kind == "none":
        return None

    if kind == "totp_rfc6238":
        if not carrier.totp_secret_b32:
            raise RuntimeError(f"Carrier {carrier.carrier_id} marked totp_rfc6238 but no totp_secret_b32 set")
        code = pyotp.TOTP(carrier.totp_secret_b32).now()
        sel = carrier.listing_selector_spec
        await page.fill(sel["mfa_totp_code"], code)
        await page.click(sel["mfa_submit"])
        return None

    if kind == "email_otp":
        # Mock helper: read the OTP straight from the carrier's test endpoint.
        # On a real carrier this branch wouldn't fire — production routes
        # email_otp through HIL.
        sel = carrier.listing_selector_spec
        base = _carrier_base_url(carrier)
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{base}/__test__/last-email-otp")
            if r.status_code == 200 and r.text.strip():
                await page.fill(sel["mfa_email_code"], r.text.strip())
                await page.click(sel["mfa_submit"])
                return None
        return HilPending(
            prompt=MfaPrompt(kind="email_otp", instruction="Check your email for a 6-digit code and enter it below."),
            handler="email_otp",
        )

    if kind == "email_link":
        # Mock helper: navigate to the magic link directly (same browser
        # context = cookies preserved). Real carriers route this through HIL.
        base = _carrier_base_url(carrier)
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{base}/__test__/last-email-link")
            if r.status_code == 200 and r.text.strip():
                await page.goto(r.text.strip(), wait_until="domcontentloaded")
                return None
        return HilPending(
            prompt=MfaPrompt(kind="email_link", instruction="Open the sign-in link we emailed you. We'll resume automatically."),
            handler="email_link",
        )

    if kind == "captcha_hil":
        sel = carrier.listing_selector_spec
        img = await page.query_selector(sel["captcha_image"])
        if img is None:
            raise RuntimeError("Captcha image element missing on the MFA page.")
        base = _carrier_base_url(carrier)
        return HilPending(
            prompt=MfaPrompt(
                kind="captcha_hil",
                instruction="Type the characters shown in the image.",
                captcha_image_url=f"{base}/captcha.png",
            ),
            handler="captcha_hil",
        )

    raise RuntimeError(f"Unsupported mfa_kind: {kind}")


async def complete_hil(carrier: Carrier, page: "Page", handler: str, response: str) -> None:
    """Resume the parked Playwright session with the user-supplied HIL response."""
    sel = carrier.listing_selector_spec
    if handler == "email_otp":
        await page.fill(sel["mfa_email_code"], response.strip())
        await page.click(sel["mfa_submit"])
        return
    if handler == "captcha_hil":
        csrf_el = await page.query_selector(sel["mfa_captcha_csrf"])
        # The form already has the CSRF in a hidden input; nothing to do
        # except fill the text + submit.
        _ = csrf_el
        await page.fill(sel["mfa_captcha_code"], response.strip().upper())
        await page.click(sel["mfa_submit"])
        return
    if handler == "email_link":
        # response is the URL the user clicked from their email. Mocks already
        # auto-navigate; this branch handles the production HIL case.
        if response.strip():
            await page.goto(response.strip(), wait_until="domcontentloaded")
        return
    raise RuntimeError(f"Unknown HIL handler: {handler}")


def _carrier_base_url(carrier: Carrier) -> str:
    """Strip the trailing /login from login_url to get the base."""
    url = carrier.login_url
    if url.endswith("/login"):
        return url[: -len("/login")]
    return url.rstrip("/")
