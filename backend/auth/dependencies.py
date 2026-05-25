import logging
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Header, Request
from services.supabase import get_supabase
from services import jwt_service

logger = logging.getLogger(__name__)


async def get_current_user(
    request: Request,
    authorization: str = Header(default=None),
):
    """
    Auth priority:
    1. Bearer service token (Electron main process) → electron_service_tokens table
    2. access_token HttpOnly cookie                 → RS256 JWT issued by FastAPI
    """
    sb = get_supabase()

    # 1. Bearer service token (Electron)
    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization.removeprefix("Bearer ").strip()
        if not raw_token:
            raise HTTPException(status_code=401, detail="Empty Bearer token")

        from services.crypto import sha256_hex
        token_hash = sha256_hex(raw_token)
        result = (
            sb.table("electron_service_tokens")
            .select("*, users(id, email, full_name, status)")
            .eq("token_hash", token_hash)
            .eq("revoked", False)
            .maybe_single()
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=401, detail="Invalid or revoked service token")

        record = result.data
        expires_at = record.get("expires_at")
        if expires_at:
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if expires_at < datetime.now(timezone.utc):
                raise HTTPException(status_code=401, detail="Service token expired")

        user = record.get("users")
        if not user or user.get("status") != "active":
            raise HTTPException(status_code=401, detail="Account inactive")

        role_result = sb.table("user_roles").select("role").eq("user_id", user["id"]).maybe_single().execute()
        role = role_result.data.get("role", "user") if role_result.data else "user"
        return {**user, "role": role, "mfa_verified": True, "_auth_type": "service_token"}

    # 2. RS256 JWT from HttpOnly cookie
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = jwt_service.decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    # NB: avoid .maybe_single() — self-hosted PostgREST returns HTTP 204 for a
    # 0-row object request, which postgrest-py 0.17.2 mishandles (raises a bogus
    # "Missing response" 204 → 500 instead of a clean not-found). limit(1) + list
    # is robust.
    result = sb.table("users").select("*").eq("id", user_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="User not found")
    user = result.data[0]
    if user.get("status") != "active":
        raise HTTPException(status_code=401, detail="Account inactive")

    return {
        **user,
        "role": payload.get("role", "user"),
        "mfa_verified": payload.get("mfa_verified", False),
        "_auth_type": "jwt",
    }


async def get_current_user_id(user=Depends(get_current_user)) -> str:
    uid = user.get("id")
    if not uid:
        raise HTTPException(status_code=401, detail="No user ID in token")
    return str(uid)


async def require_mfa(user=Depends(get_current_user)):
    """Require MFA-verified JWT claim. Used for any elevated operation."""
    if not user.get("mfa_verified"):
        _log_unauthorized(user, "mfa_required")
        raise HTTPException(status_code=403, detail="MFA verification required")
    return user


async def require_admin(request: Request, user=Depends(get_current_user)):
    """Require role=admin AND mfa_verified=true. Logs every rejection."""
    if not user.get("mfa_verified"):
        _log_unauthorized(user, "mfa_required", request)
        raise HTTPException(status_code=403, detail="MFA required for admin access")
    if user.get("role") != "admin":
        _log_unauthorized(user, "admin_role_required", request)
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


def _log_unauthorized(user: dict, reason: str, request: Request | None = None):
    """Write UNAUTHORIZED_ACCESS to audit_logs on every 403."""
    try:
        sb = get_supabase()
        sb.table("audit_logs").insert({
            "user_id": str(user.get("id")) if user.get("id") else None,
            "action": "UNAUTHORIZED_ACCESS",
            "resource_type": "endpoint",
            "resource_id": str(request.url.path) if request else None,
            "ip_address": request.client.host if request and request.client else None,
            "details": {"reason": reason, "role": user.get("role")},
        }).execute()
    except Exception:
        logger.exception("Failed to write UNAUTHORIZED_ACCESS audit log")


async def get_device(x_device_token: str = Header(...)):
    sb = get_supabase()
    result = (
        sb.table("devices")
        .select("*")
        .eq("device_token", x_device_token)
        .eq("status", "active")
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid or inactive device token")
    return result.data
