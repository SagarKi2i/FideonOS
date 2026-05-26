"""Factory that builds a FastAPI app for one mock carrier.

Each carrier subdir's main.py calls `build_app(carrier_id)` and `uvicorn.run`s
the result on its assigned port. All carrier-specific behaviour (templates, MFA
flow, paging, iframe, CSRF) is driven by the carrier's `MockCarrierProfile`
plus a small per-carrier `style` block defined inline below.

Doc-listing DOM personalities (see sprint plan Task 6):

    attr        : data-testid attributes, modern SPA-style
    aria        : aria-label / role-based selectors (Chubb)
    column      : legacy table, scrape by column index (Hartford)
    iframe      : doc table rendered inside an iframe (Liberty)
    csrf        : form posts require a hidden CSRF input (Nationwide)
    paginated   : 2-page listing with a "Next" link (Progressive)
"""
from __future__ import annotations

import secrets
from pathlib import Path
from typing import Any

import pyotp
from fastapi import FastAPI, Form, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.responses import PlainTextResponse, Response as StarletteResponse

from .captcha import make_captcha
from .data import MOCK_PASSWORD, MOCK_USERNAME, MockCarrierProfile, docs_for, get_profile
from .pdf import make_pdf
from .session import SESSION_COOKIE, SessionStore


_TEMPLATE_DIR = Path(__file__).parent / "templates"


# DOM styles per carrier — keeps adapter selector specs honest. Carriers
# without an override use "attr" (data-testid).
DOM_STYLE: dict[str, str] = {
    "mock_hartford":   "column",
    "mock_chubb":      "aria",
    "mock_liberty":    "iframe",
    "mock_nationwide": "csrf",
    "mock_progressive": "paginated",
}


def _doc_row_template(style: str) -> str:
    """Returns a Jinja `{% for %}` row fragment matching the carrier's DOM style.
    Kept inline so a future engineer can grep one file to see every DOM shape."""
    if style == "column":
        return (
            "<tr>"
            "<td>{{ doc.policy_number }}</td>"
            "<td>{{ doc.insured_name }}</td>"
            "<td>{{ doc.doc_type }}</td>"
            "<td>{{ doc.issued_on }}</td>"
            "<td><a href=\"/download/{{ doc.doc_id }}\">Download</a></td>"
            "</tr>"
        )
    if style == "aria":
        return (
            "<tr aria-label=\"document-row\">"
            "<td aria-label=\"policy\">{{ doc.policy_number }}</td>"
            "<td aria-label=\"insured\">{{ doc.insured_name }}</td>"
            "<td aria-label=\"doc-type\">{{ doc.doc_type }}</td>"
            "<td aria-label=\"issued\">{{ doc.issued_on }}</td>"
            "<td><a aria-label=\"download\" href=\"/download/{{ doc.doc_id }}\">PDF</a></td>"
            "</tr>"
        )
    return (
        "<tr data-testid=\"doc-row\">"
        "<td data-testid=\"doc-policy\">{{ doc.policy_number }}</td>"
        "<td data-testid=\"doc-insured\">{{ doc.insured_name }}</td>"
        "<td data-testid=\"doc-type\">{{ doc.doc_type }}</td>"
        "<td data-testid=\"doc-issued\">{{ doc.issued_on }}</td>"
        "<td><a data-testid=\"doc-download\" href=\"/download/{{ doc.doc_id }}\">Download</a></td>"
        "</tr>"
        )


def build_app(carrier_id: str) -> FastAPI:
    profile = get_profile(carrier_id)
    style = DOM_STYLE.get(carrier_id, "attr")

    app = FastAPI(title=f"Mock Carrier — {profile.display_name}")
    sessions = SessionStore()
    templates = Jinja2Templates(directory=str(_TEMPLATE_DIR))

    # Per-process state shared between handlers:
    #   email_otp: last OTP issued (so the worker can read it from `/__test__`)
    #   email_link: last magic-link token
    #   captcha: text the user must type (per-session in the session store)
    last_email_otp: dict[str, str] = {}
    last_email_link: dict[str, str] = {}

    @app.get("/login", response_class=HTMLResponse)
    async def login_page(request: Request) -> Response:
        return templates.TemplateResponse(
            request,
            "login.html",
            {
                "carrier": profile.display_name,
                "carrier_id": profile.carrier_id,
                "error": None,
            },
        )

    @app.post("/login", response_class=HTMLResponse)
    async def login_submit(
        request: Request,
        username: str = Form(...),
        password: str = Form(...),
    ) -> Response:
        if username != MOCK_USERNAME or password != MOCK_PASSWORD:
            return templates.TemplateResponse(
                request,
                "login.html",
                {
                    "carrier": profile.display_name,
                    "carrier_id": profile.carrier_id,
                    "error": "Invalid username or password.",
                },
                status_code=401,
            )
        session = sessions.create(username=username, mfa_passed=False)
        next_url = _mfa_entry_url(profile)
        response = RedirectResponse(url=next_url, status_code=303)
        response.set_cookie(SESSION_COOKIE, session.session_id, httponly=True)
        return response

    # ── MFA: TOTP ────────────────────────────────────────────────────────────
    @app.get("/mfa", response_class=HTMLResponse)
    async def mfa_page(request: Request) -> Response:
        session = sessions.get(request.cookies.get(SESSION_COOKIE))
        if not session:
            return RedirectResponse(url="/login", status_code=303)

        if profile.mfa_kind == "totp_rfc6238":
            return templates.TemplateResponse(
                request,
                "mfa_totp.html",
                {"carrier": profile.display_name, "error": None},
            )
        if profile.mfa_kind == "email_otp":
            code = f"{secrets.randbelow(1_000_000):06d}"
            last_email_otp["code"] = code
            sessions.update(session.session_id, expected_otp=code)
            return templates.TemplateResponse(
                request,
                "mfa_email_otp.html",
                {"carrier": profile.display_name, "error": None},
            )
        if profile.mfa_kind == "captcha_hil":
            text, png = make_captcha()
            sessions.update(session.session_id, captcha_text=text, captcha_png=png, csrf=secrets.token_urlsafe(16))
            return templates.TemplateResponse(
                request,
                "mfa_captcha.html",
                {
                    "carrier": profile.display_name,
                    "csrf": sessions.get(session.session_id).data["csrf"],
                    "error": None,
                },
            )
        if profile.mfa_kind == "email_link":
            token = secrets.token_urlsafe(20)
            last_email_link["token"] = token
            sessions.update(session.session_id, expected_link_token=token)
            return templates.TemplateResponse(
                request,
                "mfa_email_link.html",
                {"carrier": profile.display_name, "error": None},
            )
        raise HTTPException(status_code=500, detail=f"Unknown mfa_kind: {profile.mfa_kind}")

    @app.post("/mfa", response_class=HTMLResponse)
    async def mfa_submit(
        request: Request,
        code: str | None = Form(None),
        csrf: str | None = Form(None),
    ) -> Response:
        session = sessions.get(request.cookies.get(SESSION_COOKIE))
        if not session:
            return RedirectResponse(url="/login", status_code=303)

        if profile.mfa_kind == "totp_rfc6238":
            if not code or not profile.totp_seed:
                raise HTTPException(status_code=400, detail="Missing TOTP code or seed.")
            totp = pyotp.TOTP(profile.totp_seed)
            if not totp.verify(code, valid_window=1):
                return templates.TemplateResponse(
                    request,
                    "mfa_totp.html",
                    {"carrier": profile.display_name, "error": "Invalid TOTP code."},
                    status_code=401,
                )
        elif profile.mfa_kind == "email_otp":
            expected = session.data.get("expected_otp")
            if not code or code.strip() != expected:
                return templates.TemplateResponse(
                    request,
                    "mfa_email_otp.html",
                    {"carrier": profile.display_name, "error": "Invalid OTP."},
                    status_code=401,
                )
        elif profile.mfa_kind == "captcha_hil":
            expected = session.data.get("captcha_text")
            expected_csrf = session.data.get("csrf")
            if csrf != expected_csrf:
                raise HTTPException(status_code=403, detail="CSRF mismatch.")
            if not code or code.strip().upper() != (expected or ""):
                # Re-issue a fresh captcha so retries get a new image
                text, png = make_captcha()
                sessions.update(session.session_id, captcha_text=text, captcha_png=png)
                return templates.TemplateResponse(
                    request,
                    "mfa_captcha.html",
                    {
                        "carrier": profile.display_name,
                        "csrf": expected_csrf,
                        "error": "Captcha incorrect — try the new image below.",
                    },
                    status_code=401,
                )
        else:
            raise HTTPException(status_code=400, detail="POST /mfa not used by this mfa_kind.")

        sessions.update(session.session_id, mfa_passed=True)
        return RedirectResponse(url="/documents", status_code=303)

    @app.get("/mfa/confirm")
    async def mfa_email_link_confirm(request: Request, token: str) -> Response:
        if profile.mfa_kind != "email_link":
            raise HTTPException(status_code=404, detail="Not found.")
        session = sessions.get(request.cookies.get(SESSION_COOKIE))
        if not session:
            return RedirectResponse(url="/login", status_code=303)
        expected = session.data.get("expected_link_token")
        if token != expected:
            raise HTTPException(status_code=401, detail="Invalid magic link.")
        sessions.update(session.session_id, mfa_passed=True)
        return RedirectResponse(url="/documents", status_code=303)

    @app.get("/captcha.png")
    async def captcha_png(request: Request) -> Response:
        session = sessions.get(request.cookies.get(SESSION_COOKIE))
        if not session:
            raise HTTPException(status_code=401, detail="No session.")
        png: bytes | None = session.data.get("captcha_png")
        if not png:
            raise HTTPException(status_code=404, detail="No captcha pending.")
        return StarletteResponse(content=png, media_type="image/png")

    # ── Documents listing ────────────────────────────────────────────────────
    @app.get("/documents", response_class=HTMLResponse)
    async def documents_page(request: Request, page: int = 1, policy: str = "") -> Response:
        session = sessions.get(request.cookies.get(SESSION_COOKIE))
        if not session or not session.data.get("mfa_passed"):
            return RedirectResponse(url="/login", status_code=303)

        all_docs = docs_for(profile.carrier_id)
        if policy:
            all_docs = [d for d in all_docs if policy.lower() in d.policy_number.lower()]

        per_page = 10
        if style == "paginated":
            total_pages = max(1, (len(all_docs) + per_page - 1) // per_page)
            page = max(1, min(page, total_pages))
            sliced = all_docs[(page - 1) * per_page : page * per_page]
        else:
            total_pages, page, sliced = 1, 1, all_docs

        ctx: dict[str, Any] = {
            "carrier": profile.display_name,
            "docs": sliced,
            "row_template": _doc_row_template(style),
            "policy": policy,
            "page": page,
            "total_pages": total_pages,
        }
        template_name = {
            "attr": "documents_attr.html",
            "aria": "documents_aria.html",
            "column": "documents_column.html",
            "iframe": "documents_iframe.html",
            "csrf": "documents_attr.html",
            "paginated": "documents_paginated.html",
        }[style]
        return templates.TemplateResponse(request, template_name, ctx)

    @app.get("/documents/inner", response_class=HTMLResponse)
    async def documents_inner(request: Request) -> Response:
        """iframe target for the Liberty Mutual mock."""
        if style != "iframe":
            raise HTTPException(status_code=404, detail="Not found.")
        session = sessions.get(request.cookies.get(SESSION_COOKIE))
        if not session or not session.data.get("mfa_passed"):
            raise HTTPException(status_code=401, detail="Unauthorized.")
        return templates.TemplateResponse(
            request,
            "documents_inner.html",
            {"docs": docs_for(profile.carrier_id), "row_template": _doc_row_template("attr")},
        )

    @app.get("/download/{doc_id}")
    async def download(request: Request, doc_id: str) -> Response:
        session = sessions.get(request.cookies.get(SESSION_COOKIE))
        if not session or not session.data.get("mfa_passed"):
            raise HTTPException(status_code=401, detail="Unauthorized.")
        doc = next((d for d in docs_for(profile.carrier_id) if d.doc_id == doc_id), None)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found.")
        pdf_bytes = make_pdf(
            carrier=profile.display_name,
            doc_type=doc.doc_type,
            policy_number=doc.policy_number,
            insured_name=doc.insured_name,
            issued_on=doc.issued_on,
        )
        return StarletteResponse(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{doc.filename}"'},
        )

    # ── Health + test-only endpoints (used by the worker for HIL automation) ──
    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "carrier_id": profile.carrier_id,
            "mfa_kind": profile.mfa_kind,
            "doc_count": len(docs_for(profile.carrier_id)),
        }

    @app.get("/__test__/last-email-otp", response_class=PlainTextResponse)
    async def test_last_email_otp() -> str:
        if profile.mfa_kind != "email_otp":
            raise HTTPException(status_code=404, detail="Not found.")
        return last_email_otp.get("code", "")

    @app.get("/__test__/last-email-link", response_class=PlainTextResponse)
    async def test_last_email_link(request: Request) -> str:
        if profile.mfa_kind != "email_link":
            raise HTTPException(status_code=404, detail="Not found.")
        token = last_email_link.get("token", "")
        if not token:
            return ""
        # Use the same host the caller used so the session cookie (which is
        # host-scoped) is sent on the follow-up GET. Otherwise localhost vs
        # 127.0.0.1 cookie scoping drops the session and the confirm bounces
        # to /login.
        host = request.url.hostname or "127.0.0.1"
        return f"http://{host}:{profile.port}/mfa/confirm?token={token}"

    @app.get("/__test__/last-captcha-text", response_class=PlainTextResponse)
    async def test_last_captcha_text(request: Request) -> str:
        """For e2e tests against the captcha carrier without a real human."""
        if profile.mfa_kind != "captcha_hil":
            raise HTTPException(status_code=404, detail="Not found.")
        session = sessions.get(request.cookies.get(SESSION_COOKIE))
        if not session:
            return ""
        return session.data.get("captcha_text", "")

    return app


def _mfa_entry_url(profile: MockCarrierProfile) -> str:
    # email_link is the only flow that has a separate confirm URL — the form
    # page still renders at /mfa to tell the human what to do.
    return "/mfa"
