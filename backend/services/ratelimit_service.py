"""Rate limiter backed by Valkey (Redis-compatible).
Falls back to in-memory counter when Valkey is unavailable (dev mode).
"""
from __future__ import annotations

import time
from collections import defaultdict

from services.crypto import sha256_hex

_memory_store: dict[str, list[float]] = defaultdict(list)


def _get_redis():
    try:
        import redis
        from config import settings
        r = redis.from_url(settings.valkey_url, decode_responses=True, socket_connect_timeout=1)
        r.ping()
        return r
    except Exception:
        return None


def _check_in_memory(key: str, limit: int, window_seconds: int) -> bool:
    now = time.time()
    cutoff = now - window_seconds
    _memory_store[key] = [t for t in _memory_store[key] if t > cutoff]
    if len(_memory_store[key]) >= limit:
        return False
    _memory_store[key].append(now)
    return True


def check_rate_limit(key: str, limit: int, window_seconds: int) -> bool:
    """Return True if request is allowed, False if rate-limited."""
    r = _get_redis()
    if r is None:
        return _check_in_memory(key, limit, window_seconds)
    pipe = r.pipeline()
    pipe.incr(key)
    pipe.expire(key, window_seconds)
    results = pipe.execute()
    count = results[0]
    return count <= limit


def ip_key(ip: str, endpoint: str) -> str:
    return f"ip:{ip}:{endpoint}"


def email_key(email: str, endpoint: str) -> str:
    return f"email:{sha256_hex(email.lower())}:{endpoint}"


def token_key(raw_token: str, endpoint: str) -> str:
    return f"token:{sha256_hex(raw_token)}:{endpoint}"
