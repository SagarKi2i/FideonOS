"""Per-process in-memory session store. Each mock carrier app instantiates one
of these — no cross-carrier sharing. Threadsafe (asyncio uses a single thread
in default uvicorn, but the lock is cheap and future-proofs against workers>1)."""
from __future__ import annotations

import secrets
import threading
import time
from dataclasses import dataclass, field
from typing import Any


SESSION_COOKIE = "mock_session"


@dataclass
class Session:
    session_id: str
    created_at: float
    data: dict[str, Any] = field(default_factory=dict)


class SessionStore:
    def __init__(self, ttl_seconds: int = 3600) -> None:
        self._ttl = ttl_seconds
        self._sessions: dict[str, Session] = {}
        self._lock = threading.Lock()

    def create(self, **data: Any) -> Session:
        sid = secrets.token_urlsafe(24)
        session = Session(session_id=sid, created_at=time.time(), data=dict(data))
        with self._lock:
            self._sessions[sid] = session
        return session

    def get(self, sid: str | None) -> Session | None:
        if not sid:
            return None
        with self._lock:
            session = self._sessions.get(sid)
            if session and (time.time() - session.created_at) > self._ttl:
                self._sessions.pop(sid, None)
                return None
            return session

    def update(self, sid: str, **data: Any) -> Session | None:
        with self._lock:
            session = self._sessions.get(sid)
            if not session:
                return None
            session.data.update(data)
            return session

    def delete(self, sid: str) -> None:
        with self._lock:
            self._sessions.pop(sid, None)
