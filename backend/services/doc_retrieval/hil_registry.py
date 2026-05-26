"""In-process registry of HIL-paused doc-retrieval runs.

Holds the live carrier session (BrowserContext for Playwright; an
httpx.AsyncClient on the legacy path), the handler kind, and a
`threading.Event` the worker thread blocks on. When the HTTP route receives
the user's response, it sets the event so the worker resumes.

`client` is `Any` because the type differs by active adapter — the worker
thread that put it there knows what to do with it; the HTTP route never
inspects it (it just sets `response` + fires `resume`).

NOT crash-safe — a backend restart drops all parked sessions. Acceptable for
v1 single-instance dev/QA.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # pragma: no cover
    from .models import Carrier


@dataclass
class ParkedSession:
    run_id: str
    carrier: "Carrier"
    client: Any             # BrowserContext (Playwright) or httpx.AsyncClient (legacy)
    handler: str            # email_otp | email_link | captcha_hil
    resume: threading.Event = field(default_factory=threading.Event)
    response: str = ""      # filled by submit_mfa_response, read by the worker


_registry: dict[str, ParkedSession] = {}
_lock = threading.Lock()


def park(session: ParkedSession) -> None:
    with _lock:
        _registry[session.run_id] = session


def pop(run_id: str) -> ParkedSession | None:
    with _lock:
        return _registry.pop(run_id, None)


def peek(run_id: str) -> ParkedSession | None:
    with _lock:
        return _registry.get(run_id)


def submit_mfa_response(run_id: str, response: str) -> bool:
    """Called by the HTTP route. Sets the response + fires the resume event.
    Returns True if a session was waiting, False if there was nothing parked."""
    with _lock:
        session = _registry.get(run_id)
        if not session:
            return False
        session.response = response
        session.resume.set()
        return True
