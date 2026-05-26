"""MFA flow over plain HTTP (httpx) — companion to playwright_adapter.py.

Same shape as the original mfa.py (TOTP auto-solve, HIL pending for the rest)
but uses an `httpx.AsyncClient` session instead of a Playwright Page. Public
entries:

    solve_http(client, carrier) -> None | HilPending
    complete_hil_http(client, carrier, handler, response) -> None

The orchestrator's HIL callback in orchestrator.py is given the AsyncClient
(not a Page) so it can poke `__test__/last-email-otp` / `last-email-link`
endpoints if it wants to auto-resolve a mock HIL flow.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import httpx
import pyotp

from .models import Carrier, MfaPrompt


@dataclass
class HilPending:
    prompt: MfaPrompt
    handler: Literal["email_otp", "email_link", "captcha_hil"]


async def solve_http(client: httpx.AsyncClient, carrier: Carrier) -> HilPending | None:
    kind = carrier.mfa_kind

    if kind == "none":
        return None

    if kind == "totp_rfc6238":
        if not carrier.totp_secret_b32:
            raise RuntimeError(f"Carrier {carrier.carrier_id} marked totp_rfc6238 but no totp_secret_b32 set")
        # Touch the MFA page first to establish that we're on the right flow,
        # though the mock doesn't require it. Real carriers usually do.
        await client.get("/mfa")
        code = pyotp.TOTP(carrier.totp_secret_b32).now()
        resp = await client.post("/mfa", data={"code": code})
        if resp.status_code not in (200, 303):
            raise RuntimeError(f"TOTP submit returned HTTP {resp.status_code}")
        return None

    if kind == "email_otp":
        # Prime the form (carrier issues the OTP at this step).
        await client.get("/mfa")
        # Mock-only shortcut: read the OTP from the carrier's test endpoint.
        r = await client.get("/__test__/last-email-otp")
        if r.status_code == 200 and r.text.strip():
            await client.post("/mfa", data={"code": r.text.strip()})
            return None
        return HilPending(
            prompt=MfaPrompt(kind="email_otp", instruction="Enter the 6-digit code from your email."),
            handler="email_otp",
        )

    if kind == "email_link":
        await client.get("/mfa")
        r = await client.get("/__test__/last-email-link")
        if r.status_code == 200 and r.text.strip():
            await client.get(r.text.strip())
            return None
        return HilPending(
            prompt=MfaPrompt(kind="email_link", instruction="Open the sign-in link we emailed you."),
            handler="email_link",
        )

    if kind == "captcha_hil":
        # Fetch the MFA page so the carrier generates a captcha bound to our session.
        await client.get("/mfa")
        return HilPending(
            prompt=MfaPrompt(
                kind="captcha_hil",
                instruction="Type the characters shown in the image.",
                captcha_image_url=str(client.base_url) + "captcha.png",
            ),
            handler="captcha_hil",
        )

    raise RuntimeError(f"Unsupported mfa_kind: {kind}")


async def complete_hil_http(client: httpx.AsyncClient, carrier: Carrier, handler: str, response: str) -> None:
    if handler == "email_otp":
        await client.post("/mfa", data={"code": response.strip()})
        return
    if handler == "email_link":
        if response.strip():
            await client.get(response.strip())
        return
    if handler == "captcha_hil":
        # We need the CSRF token the carrier issued. Re-fetch /mfa to read it.
        page = await client.get("/mfa")
        import re
        m = re.search(r'name="csrf"\s+value="([^"]+)"', page.text)
        if not m:
            raise RuntimeError("Couldn't find csrf token on captcha page.")
        csrf = m.group(1)
        await client.post("/mfa", data={"code": response.strip().upper(), "csrf": csrf})
        return
    raise RuntimeError(f"Unknown HIL handler: {handler}")
