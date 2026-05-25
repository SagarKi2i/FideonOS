import base64
import binascii
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from jose import jwt, JWTError

from config import settings

ALGORITHM = "RS256"

_private_key: str | None = None
_public_key: str | None = None


def _resolve_key_path(path_str: str) -> Path:
    p = Path(path_str)
    if p.is_absolute():
        return p
    # Try relative to this file's directory (backend/services/ → backend/)
    relative_to_backend = Path(__file__).parent.parent / path_str
    if relative_to_backend.exists():
        return relative_to_backend
    # Fall back to CWD
    return p


def _decode_b64_key(value: str) -> str:
    """Decode a base64-encoded PEM. Raises on malformed input so a bad secret
    fails loudly at startup rather than producing cryptic signing errors."""
    try:
        return base64.b64decode(value, validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError) as exc:
        raise RuntimeError(
            "JWT key base64 env var is set but could not be decoded; "
            "ensure it is valid base64 of a PEM file."
        ) from exc


def _load_private_key() -> str:
    global _private_key
    if _private_key is None:
        if settings.jwt_private_key_b64:
            _private_key = _decode_b64_key(settings.jwt_private_key_b64)
        else:
            _private_key = _resolve_key_path(settings.jwt_private_key_path).read_text()
    return _private_key


def _load_public_key() -> str:
    global _public_key
    if _public_key is None:
        if settings.jwt_public_key_b64:
            _public_key = _decode_b64_key(settings.jwt_public_key_b64)
        else:
            _public_key = _resolve_key_path(settings.jwt_public_key_path).read_text()
    return _public_key


def create_access_token(data: dict, expires_minutes: int | None = None) -> str:
    minutes = expires_minutes or settings.jwt_access_expiry_minutes
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    payload = {
        **data,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": data.get("jti") or str(uuid4()),
    }
    return jwt.encode(payload, _load_private_key(), algorithm=ALGORITHM)


def create_refresh_token(data: dict, expires_days: int | None = None) -> str:
    days = expires_days or settings.jwt_refresh_expiry_days
    expire = datetime.now(timezone.utc) + timedelta(days=days)
    payload = {
        **data,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, _load_private_key(), algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, _load_public_key(), algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
