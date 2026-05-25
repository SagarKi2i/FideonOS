"""Custom auth router — RS256/Argon2id, HttpOnly cookies, no Supabase Auth."""
import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from auth.dependencies import get_current_user, require_admin
from config import settings
from services import jwt_service
from services.argon2_service import hash_password, verify_password, DUMMY_HASH
from services.crypto import sha256_hex, constant_time_compare
from services import email_service, geo_service, ratelimit_service
from services.common_passwords import is_common_password
from services.supabase import get_supabase

router = APIRouter(prefix="/auth", tags=["auth"])


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _audit(sb, action: str, user_id, resource_type: str, resource_id=None,
           ip=None, user_agent=None, details=None):
    try:
        sb.table("audit_logs").insert({
            "user_id": str(user_id) if user_id else None,
            "action": action,
            "resource_type": resource_type,
            "resource_id": str(resource_id) if resource_id else None,
            "ip_address": ip,
            "user_agent": user_agent,
            "details": details or {},
        }).execute()
    except Exception:
        pass


def _is_secure() -> bool:
    return settings.environment == "production"


def _set_tokens(response: Response, access_token: str, refresh_token: str | None = None):
    secure = _is_secure()
    access_max = settings.jwt_access_expiry_minutes * 60
    response.set_cookie("access_token", access_token, httponly=True, secure=secure,
                        samesite="strict",
                        path="/", max_age=access_max)
    if refresh_token:
        refresh_max = settings.jwt_refresh_expiry_days * 86400
        response.set_cookie("refresh_token", refresh_token, httponly=True, secure=secure,
                            samesite="strict",
                            path="/api/auth/token/refresh", max_age=refresh_max)


def _clear_tokens(response: Response):
    secure = _is_secure()
    response.set_cookie("access_token", "", httponly=True, secure=secure,
                        samesite="strict", path="/", max_age=0)
    response.set_cookie("refresh_token", "", httponly=True, secure=secure,
                        samesite="strict",
                        path="/api/auth/token/refresh", max_age=0)


def _issue_session(sb, user: dict, user_role: str, request: Request, response: Response, ip: str):
    """Create access + refresh tokens and set HttpOnly cookies."""
    jti = str(uuid4())
    access_token = jwt_service.create_access_token({
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user_role,
        "mfa_verified": True,
        "jti": jti,
    })
    raw_refresh = secrets.token_urlsafe(32)
    refresh_hash = sha256_hex(raw_refresh)
    refresh_expiry = (datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_expiry_days)).isoformat()
    ua = request.headers.get("user-agent", "")
    sb.table("refresh_tokens").insert({
        "user_id": str(user["id"]),
        "token_hash": refresh_hash,
        "jti": jti,
        "expires_at": refresh_expiry,
        "device_info": {"user_agent": ua},
        "ip_address": ip,
    }).execute()
    _set_tokens(response, access_token, raw_refresh)


def _rate_check(allowed: bool):
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")


def _password_policy(password: str):
    import re
    if len(password) < 12:
        raise HTTPException(status_code=422, detail="Password must be at least 12 characters.")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=422, detail="Password must contain an uppercase letter.")
    if not re.search(r"[a-z]", password):
        raise HTTPException(status_code=422, detail="Password must contain a lowercase letter.")
    if not re.search(r"\d", password):
        raise HTTPException(status_code=422, detail="Password must contain a digit.")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise HTTPException(status_code=422, detail="Password must contain a special character.")
    if is_common_password(password):
        raise HTTPException(status_code=422, detail="Password is too common. Choose a stronger password.")


# ─── Group A: Invite Flow ─────────────────────────────────────────────────────

class InviteBody(BaseModel):
    email: str


@router.post("/invite", status_code=201)
async def send_invite(body: InviteBody, request: Request, current_user=Depends(require_admin)):
    sb = get_supabase()
    email = body.email.strip().lower()

    # NB: avoid .maybe_single() — self-hosted PostgREST returns HTTP 204 for a
    # 0-row request, which postgrest-py 0.17.2 mishandles (execute() returns None,
    # so .data raises AttributeError → bogus 500). limit(1) + list is robust.
    existing = sb.table("invites").select("id").eq("email", email).eq("status", "PENDING").limit(1).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="A pending invite already exists for this email.")

    raw = secrets.token_urlsafe(32)
    token_hash = sha256_hex(raw)
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=settings.invite_expiry_hours)).isoformat()

    sb.table("invites").insert({
        "token_hash": token_hash,
        "email": email,
        "status": "PENDING",
        "expires_at": expires_at,
        "invited_by": str(current_user["id"]),
    }).execute()

    link = f"{settings.frontend_url}/signup?token={raw}"
    email_service.send_invite_email(to=email, link=link)
    _audit(sb, "INVITE_SENT", current_user["id"], "invite",
           ip=request.client.host if request.client else None)
    return {"message": "Invite sent."}


class ValidateInviteBody(BaseModel):
    token: str


@router.post("/invite/validate")
async def validate_invite(body: ValidateInviteBody, request: Request):
    ip = request.client.host if request.client else "unknown"
    _rate_check(ratelimit_service.check_rate_limit(ratelimit_service.ip_key(ip, "validate"), 5, 3600))
    _rate_check(ratelimit_service.check_rate_limit(ratelimit_service.token_key(body.token, "validate"), 5, 3600))

    sb = get_supabase()
    token_hash = sha256_hex(body.token)
    result = sb.table("invites").select("email, status, expires_at").eq("token_hash", token_hash).maybe_single().execute()

    if not result.data:
        raise HTTPException(status_code=403, detail="This invite link is invalid or has expired.")

    row = result.data
    expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    if row["status"] != "PENDING" or expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=403, detail="This invite link is invalid or has expired.")

    return {"email": row["email"]}


class SignupBody(BaseModel):
    token: str
    password: str


@router.post("/signup", status_code=201)
async def signup(body: SignupBody, request: Request):
    ip = request.client.host if request.client else "unknown"
    _password_policy(body.password)

    sb = get_supabase()
    token_hash = sha256_hex(body.token)

    # Pre-flight rate checks (non-locking peek)
    invite_peek = sb.table("invites").select("email").eq("token_hash", token_hash).eq("status", "PENDING").maybe_single().execute()
    if invite_peek.data:
        email = invite_peek.data["email"]
        _rate_check(ratelimit_service.check_rate_limit(ratelimit_service.ip_key(ip, "signup"), 5, 3600))
        _rate_check(ratelimit_service.check_rate_limit(ratelimit_service.token_key(body.token, "signup"), 5, 3600))
        _rate_check(ratelimit_service.check_rate_limit(ratelimit_service.email_key(email, "signup"), 3, 3600))

    password_hash = hash_password(body.password)

    # Single atomic transaction: lock invite + create user + assign role
    result = sb.rpc("signup_atomic", {
        "p_token_hash": token_hash,
        "p_password_hash": password_hash,
    }).execute()

    data = result.data
    row = data[0] if isinstance(data, list) else data
    if not row or (isinstance(row, dict) and row.get("error") == "invalid_invite"):
        raise HTTPException(status_code=403, detail="This invite link is invalid or has expired.")

    new_user_id = str(row["user_id"])
    _audit(sb, "SIGNUP", new_user_id, "auth", ip=ip)

    return {"message": "Account created. Please log in."}


# ─── Group B & C: Login + OTP ─────────────────────────────────────────────────

class LoginBody(BaseModel):
    email: str
    password: str


@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    ip = request.client.host if request.client else "unknown"
    email = body.email.strip().lower()  # normalize BEFORE rate-limit key derivation
    _rate_check(ratelimit_service.check_rate_limit(ratelimit_service.ip_key(ip, "login"), 10, 60))
    _rate_check(ratelimit_service.check_rate_limit(ratelimit_service.ip_key(ip, "login_hr"), 5, 3600))
    _rate_check(ratelimit_service.check_rate_limit(ratelimit_service.email_key(email, "login"), 5, 3600))

    sb = get_supabase()

    user_result = sb.table("users").select("*").eq("email", email).maybe_single().execute()
    user = user_result.data

    hash_to_verify = user["password_hash"] if user else DUMMY_HASH
    password_ok = verify_password(body.password, hash_to_verify)

    if user:
        locked_until = user.get("locked_until")
        if locked_until:
            if isinstance(locked_until, str):
                locked_until = datetime.fromisoformat(locked_until.replace("Z", "+00:00"))
            if locked_until > datetime.now(timezone.utc):
                raise HTTPException(status_code=403, detail="Account is locked. Try again later.")

    if not user or not password_ok:
        if user:
            new_attempts = (user.get("failed_attempts") or 0) + 1
            update = {"failed_attempts": new_attempts}
            if new_attempts >= 5:
                update["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
                update["status"] = "locked"
                _audit(sb, "ACCOUNT_LOCKED", user["id"], "auth", ip=ip)
            sb.table("users").update(update).eq("id", user["id"]).execute()
        _audit(sb, "LOGIN_FAIL", user["id"] if user else None, "auth", ip=ip,
               details={"reason": "invalid_credentials"})
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    sb.table("users").update({"failed_attempts": 0, "locked_until": None}).eq("id", user["id"]).execute()

    # ── OTP bypass (TESTING ONLY) ────────────────────────────────────────────
    # Configured emails (e.g. the seeded test admin on a fake address) skip the
    # OTP step and get a session immediately. Every other user falls through to
    # the normal OTP flow below. Controlled by OTP_BYPASS_EMAILS in the env.
    if email in settings.otp_bypass_email_set:
        now_ts = datetime.now(timezone.utc).isoformat()
        sb.table("users").update({
            "status": "active",
            "email_verified_at": user.get("email_verified_at") or now_ts,
            "last_sign_in_at": now_ts,
        }).eq("id", user["id"]).execute()

        role_result = sb.table("user_roles").select("role").eq("user_id", user["id"]).maybe_single().execute()
        user_role = role_result.data.get("role", "user") if role_result.data else "user"

        _issue_session(sb, user, user_role, request, response, ip)
        _audit(sb, "LOGIN_SUCCESS", user["id"], "auth", ip=ip, details={"otp_bypass": True})

        return {
            "message": "Login successful.",
            "logged_in": True,
            "user": {
                "id": str(user["id"]),
                "email": user["email"],
                "role": user_role,
                "full_name": user.get("full_name"),
            },
        }

    otp_plain = str(secrets.randbelow(1000000)).zfill(6)
    otp_hash = sha256_hex(otp_plain)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=settings.otp_expiry_minutes)).isoformat()

    sb.table("otp_codes").delete().eq("user_id", user["id"]).execute()
    sb.table("otp_codes").insert({
        "user_id": user["id"],
        "otp_code_hash": otp_hash,
        "expires_at": expires_at,
        "attempt_count": 0,
        "resend_count": 0,
    }).execute()

    email_service.send_otp_email(to=user["email"], code=otp_plain)
    _audit(sb, "OTP_SENT", user["id"], "auth", ip=ip)

    return {"message": "A verification code has been sent to your email."}


class OtpVerifyBody(BaseModel):
    email: str
    otp: str


@router.post("/otp/verify")
async def verify_otp(body: OtpVerifyBody, request: Request, response: Response):
    sb = get_supabase()
    email = body.email.strip().lower()
    ip = request.client.host if request.client else "unknown"

    user_result = sb.table("users").select("*").eq("email", email).maybe_single().execute()
    if not user_result.data:
        raise HTTPException(status_code=401, detail="Invalid code.")
    user = user_result.data

    otp_result = sb.table("otp_codes").select("*").eq("user_id", user["id"]).maybe_single().execute()
    if not otp_result.data:
        raise HTTPException(status_code=401, detail="Code expired. Please log in again.")

    otp = otp_result.data
    expires_at = datetime.fromisoformat(otp["expires_at"].replace("Z", "+00:00"))
    if expires_at < datetime.now(timezone.utc):
        sb.table("otp_codes").delete().eq("user_id", user["id"]).execute()
        _audit(sb, "OTP_FAIL", user["id"], "auth", ip=ip, details={"reason": "expired"})
        raise HTTPException(status_code=401, detail="Code expired. Please log in again.")

    if (otp.get("attempt_count") or 0) >= 3:
        sb.table("otp_codes").delete().eq("user_id", user["id"]).execute()
        _audit(sb, "OTP_FAIL", user["id"], "auth", ip=ip, details={"reason": "max_attempts"})
        raise HTTPException(status_code=401, detail="Too many attempts. Please log in again.")

    submitted_hash = sha256_hex(body.otp.strip())
    match = constant_time_compare(submitted_hash, otp["otp_code_hash"])

    if not match:
        new_count = (otp.get("attempt_count") or 0) + 1
        if new_count >= 3:
            sb.table("otp_codes").delete().eq("user_id", user["id"]).execute()
        else:
            sb.table("otp_codes").update({"attempt_count": new_count}).eq("user_id", user["id"]).execute()
        _audit(sb, "OTP_FAIL", user["id"], "auth", ip=ip)
        raise HTTPException(status_code=401, detail="Invalid code.")

    # OTP is valid — consume it
    sb.table("otp_codes").delete().eq("user_id", user["id"]).execute()
    now_ts = datetime.now(timezone.utc).isoformat()
    sb.table("users").update({
        "status": "active",
        "email_verified_at": user.get("email_verified_at") or now_ts,
        "last_sign_in_at": now_ts,
    }).eq("id", user["id"]).execute()

    # Check device/geo BEFORE issuing tokens — geo anomaly blocks login
    try:
        step_up_required = await _device_check(sb, str(user["id"]), request)
    except Exception:
        logger.exception("Device check failed for user %s — allowing login", user["id"])
        step_up_required = False

    if step_up_required:
        # Step-up OTP already sent inside _device_check; do not issue session cookies
        return {
            "step_up_required": True,
            "email": email,
            "message": "Suspicious login detected. A verification code has been sent to your email.",
        }

    role_result = sb.table("user_roles").select("role").eq("user_id", user["id"]).maybe_single().execute()
    user_role = role_result.data.get("role", "user") if role_result.data else "user"

    _issue_session(sb, user, user_role, request, response, ip)
    _audit(sb, "LOGIN_SUCCESS", user["id"], "auth", ip=ip)

    return {"message": "Login successful.", "user": {
        "id": str(user["id"]),
        "email": user["email"],
        "role": user_role,
        "full_name": user.get("full_name"),
    }}


class StepUpVerifyBody(BaseModel):
    email: str
    otp: str


@router.post("/otp/step-up/verify")
async def step_up_verify(body: StepUpVerifyBody, request: Request, response: Response):
    """Verify the geo-anomaly step-up OTP and issue session cookies on success."""
    sb = get_supabase()
    email = body.email.strip().lower()
    ip = request.client.host if request.client else "unknown"

    user_result = sb.table("users").select("*").eq("email", email).maybe_single().execute()
    if not user_result.data:
        raise HTTPException(status_code=401, detail="Invalid code.")
    user = user_result.data

    otp_result = sb.table("otp_codes").select("*").eq("user_id", user["id"]).maybe_single().execute()
    if not otp_result.data:
        raise HTTPException(status_code=401, detail="Code expired. Please log in again.")

    otp = otp_result.data
    expires_at = datetime.fromisoformat(otp["expires_at"].replace("Z", "+00:00"))
    if expires_at < datetime.now(timezone.utc):
        sb.table("otp_codes").delete().eq("user_id", user["id"]).execute()
        _audit(sb, "STEP_UP_OTP_FAIL", user["id"], "auth", ip=ip, details={"reason": "expired"})
        raise HTTPException(status_code=401, detail="Code expired. Please log in again.")

    if (otp.get("attempt_count") or 0) >= 3:
        sb.table("otp_codes").delete().eq("user_id", user["id"]).execute()
        _audit(sb, "STEP_UP_OTP_FAIL", user["id"], "auth", ip=ip, details={"reason": "max_attempts"})
        raise HTTPException(status_code=401, detail="Too many attempts. Please log in again.")

    submitted_hash = sha256_hex(body.otp.strip())
    match = constant_time_compare(submitted_hash, otp["otp_code_hash"])

    if not match:
        new_count = (otp.get("attempt_count") or 0) + 1
        if new_count >= 3:
            sb.table("otp_codes").delete().eq("user_id", user["id"]).execute()
        else:
            sb.table("otp_codes").update({"attempt_count": new_count}).eq("user_id", user["id"]).execute()
        _audit(sb, "STEP_UP_OTP_FAIL", user["id"], "auth", ip=ip)
        raise HTTPException(status_code=401, detail="Invalid code.")

    sb.table("otp_codes").delete().eq("user_id", user["id"]).execute()

    role_result = sb.table("user_roles").select("role").eq("user_id", user["id"]).maybe_single().execute()
    user_role = role_result.data.get("role", "user") if role_result.data else "user"

    _issue_session(sb, user, user_role, request, response, ip)
    _audit(sb, "STEP_UP_SUCCESS", user["id"], "auth", ip=ip)

    return {"message": "Login successful.", "user": {
        "id": str(user["id"]),
        "email": user["email"],
        "role": user_role,
        "full_name": user.get("full_name"),
    }}


class OtpResendBody(BaseModel):
    email: str


@router.post("/otp/resend")
async def resend_otp(body: OtpResendBody, request: Request):
    ip = request.client.host if request.client else "unknown"
    sb = get_supabase()
    email = body.email.strip().lower()

    user_result = sb.table("users").select("id, email").eq("email", email).maybe_single().execute()
    if not user_result.data:
        raise HTTPException(status_code=400, detail="No active OTP session.")
    user = user_result.data

    otp_result = sb.table("otp_codes").select("*").eq("user_id", user["id"]).maybe_single().execute()
    if not otp_result.data:
        raise HTTPException(status_code=400, detail="No active OTP session. Please log in again.")
    otp = otp_result.data

    expires_at = datetime.fromisoformat(otp["expires_at"].replace("Z", "+00:00"))
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OTP session expired. Please log in again.")

    if (otp.get("resend_count") or 0) >= settings.otp_resend_limit:
        raise HTTPException(status_code=429, detail="Too many resends. Please log in again.")

    _rate_check(ratelimit_service.check_rate_limit(
        ratelimit_service.ip_key(ip, "otp_resend"),
        settings.otp_rate_window_requests,
        settings.otp_rate_window_minutes * 60,
    ))

    otp_plain = str(secrets.randbelow(1000000)).zfill(6)
    new_hash = sha256_hex(otp_plain)
    new_expiry = (datetime.now(timezone.utc) + timedelta(minutes=settings.otp_expiry_minutes)).isoformat()

    # attempt_count intentionally NOT reset — prevents unlimited guessing via resend
    sb.table("otp_codes").update({
        "otp_code_hash": new_hash,
        "expires_at": new_expiry,
        "resend_count": (otp.get("resend_count") or 0) + 1,
    }).eq("user_id", user["id"]).execute()

    email_service.send_otp_email(to=user["email"], code=otp_plain)
    _audit(sb, "OTP_SENT", user["id"], "auth", ip=ip)
    return {"message": "A new code has been sent."}


# ─── Group D & E: Token Refresh + Logout ─────────────────────────────────────

@router.post("/token/refresh")
async def refresh_token(request: Request, response: Response):
    raw_refresh = request.cookies.get("refresh_token")
    if not raw_refresh:
        raise HTTPException(status_code=401, detail="Session expired. Please log in.")

    sb = get_supabase()
    token_hash = sha256_hex(raw_refresh)
    ip = request.client.host if request.client else "unknown"
    ua = request.headers.get("user-agent", "")

    record_result = sb.table("refresh_tokens").select("*").eq("token_hash", token_hash).maybe_single().execute()
    if not record_result.data:
        raise HTTPException(status_code=401, detail="Session expired. Please log in.")

    record = record_result.data

    if record.get("revoked"):
        sb.table("refresh_tokens").update({"revoked": True}).eq("user_id", record["user_id"]).execute()
        _audit(sb, "REPLAY_ATTACK_DETECTED", record["user_id"], "session",
               ip=ip, user_agent=ua, details={"ip": ip, "user_agent": ua})
        user_result = sb.table("users").select("email").eq("id", record["user_id"]).maybe_single().execute()
        if user_result.data:
            email_service.send_security_alert(user_result.data["email"])
        _clear_tokens(response)
        raise HTTPException(status_code=401, detail="Session invalidated for security. Please log in again.")

    expires_at = datetime.fromisoformat(record["expires_at"].replace("Z", "+00:00"))
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired.")

    user_result = sb.table("users").select("*").eq("id", record["user_id"]).maybe_single().execute()
    user = user_result.data
    role_result = sb.table("user_roles").select("role").eq("user_id", record["user_id"]).maybe_single().execute()
    user_role = role_result.data.get("role", "user") if role_result.data else "user"

    sb.table("refresh_tokens").update({"revoked": True}).eq("id", record["id"]).execute()

    new_jti = str(uuid4())
    new_access = jwt_service.create_access_token({
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user_role,
        "mfa_verified": True,
        "jti": new_jti,
    })
    new_raw_refresh = secrets.token_urlsafe(32)
    new_hash = sha256_hex(new_raw_refresh)
    new_expiry = (datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_expiry_days)).isoformat()

    sb.table("refresh_tokens").insert({
        "user_id": str(user["id"]),
        "token_hash": new_hash,
        "jti": new_jti,
        "expires_at": new_expiry,
        "device_info": {"user_agent": ua},
        "ip_address": ip,
    }).execute()

    _set_tokens(response, new_access, new_raw_refresh)
    _audit(sb, "TOKEN_REFRESHED", user["id"], "session")
    return {}


@router.post("/logout")
async def logout(request: Request, response: Response, current_user=Depends(get_current_user)):
    sb = get_supabase()
    token = request.cookies.get("access_token")
    if token:
        try:
            payload = jwt_service.decode_token(token)
            jti = payload.get("jti")
            if jti:
                sb.table("refresh_tokens").update({"revoked": True}).eq("jti", jti).execute()
        except Exception:
            pass
    _clear_tokens(response)
    _audit(sb, "LOGOUT", str(current_user["id"]), "session")
    return {"message": "Logged out."}


# ─── Me ───────────────────────────────────────────────────────────────────────

@router.get("/me")
async def me(current_user=Depends(get_current_user)):
    return {
        "id": str(current_user["id"]),
        "email": current_user["email"],
        "full_name": current_user.get("full_name"),
        "role": current_user.get("role", "user"),
        "mfa_verified": current_user.get("mfa_verified", False),
        "status": current_user.get("status"),
    }


@router.get("/role")
async def role(current_user=Depends(get_current_user)):
    return {"role": current_user.get("role", "user")}


# ─── Group F: Forgot/Reset Password ──────────────────────────────────────────

class ForgotPasswordBody(BaseModel):
    email: str


@router.post("/password/forgot")
async def forgot_password(body: ForgotPasswordBody, request: Request):
    ip = request.client.host if request.client else "unknown"
    _rate_check(ratelimit_service.check_rate_limit(ratelimit_service.ip_key(ip, "password_forgot"), 3, 3600))
    _rate_check(ratelimit_service.check_rate_limit(ratelimit_service.email_key(body.email, "password_forgot"), 3, 3600))

    sb = get_supabase()
    email = body.email.strip().lower()
    user_result = sb.table("users").select("id, email").eq("email", email).maybe_single().execute()

    if user_result.data:
        user = user_result.data
        sb.table("password_reset_tokens").update({"used": True}).eq("user_id", user["id"]).execute()

        raw = secrets.token_urlsafe(32)
        token_hash = sha256_hex(raw)
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=settings.password_reset_expiry_minutes)).isoformat()

        sb.table("password_reset_tokens").insert({
            "user_id": user["id"],
            "reset_token_hash": token_hash,
            "expires_at": expires_at,
        }).execute()

        link = f"{settings.frontend_url}/reset-password?token={raw}"
        email_service.send_reset_email(to=user["email"], link=link)
        _audit(sb, "PASSWORD_RESET_REQUEST", user["id"], "password", ip=ip)

    return {"message": "If an account exists for this email, a reset link has been sent."}


class ResetPasswordBody(BaseModel):
    token: str
    new_password: str


@router.post("/password/reset")
async def reset_password(body: ResetPasswordBody, request: Request):
    _password_policy(body.new_password)
    sb = get_supabase()
    ip = request.client.host if request.client else "unknown"

    token_hash = sha256_hex(body.token)
    record_result = sb.table("password_reset_tokens").select("*").eq("reset_token_hash", token_hash).eq("used", False).maybe_single().execute()

    if not record_result.data:
        raise HTTPException(status_code=403, detail="This reset link is invalid or has expired.")

    record = record_result.data
    expires_at = datetime.fromisoformat(record["expires_at"].replace("Z", "+00:00"))
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=403, detail="This reset link is invalid or has expired.")

    history_result = sb.table("password_history").select("password_hash").eq("user_id", record["user_id"]).order("created_at", desc=True).limit(3).execute()
    for h in (history_result.data or []):
        if verify_password(body.new_password, h["password_hash"]):
            raise HTTPException(status_code=422, detail="Cannot reuse a recent password.")

    new_hash = hash_password(body.new_password)

    sb.table("users").update({"password_hash": new_hash}).eq("id", record["user_id"]).execute()
    sb.table("password_history").insert({"user_id": record["user_id"], "password_hash": new_hash}).execute()
    sb.table("password_reset_tokens").update({"used": True}).eq("id", record["id"]).execute()
    sb.table("refresh_tokens").update({"revoked": True}).eq("user_id", record["user_id"]).execute()

    _audit(sb, "PASSWORD_RESET_SUCCESS", record["user_id"], "password", ip=ip)
    return {"message": "Password updated. Please log in."}


# ─── Group H: Electron Auth ───────────────────────────────────────────────────

@router.post("/electron/otc")
async def electron_otc(current_user=Depends(get_current_user)):
    raw_otc = secrets.token_urlsafe(32)
    otc_hash = sha256_hex(raw_otc)

    try:
        import valkey
        r = valkey.from_url(settings.valkey_url, decode_responses=True, socket_connect_timeout=1)
        r.setex(otc_hash, 90, str(current_user["id"]))
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Session store unavailable. Cannot issue desktop token. Try again shortly.",
        )

    return {"otc": raw_otc}


class ElectronTokenBody(BaseModel):
    otc: str


@router.post("/electron/token")
async def electron_token(body: ElectronTokenBody):
    otc_hash = sha256_hex(body.otc)

    user_id = None
    try:
        import valkey
        r = valkey.from_url(settings.valkey_url, decode_responses=True, socket_connect_timeout=1)
        user_id = r.get(otc_hash)
        if user_id:
            r.delete(otc_hash)
    except Exception:
        pass

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired OTC.")

    raw_service = secrets.token_urlsafe(32)
    service_hash = sha256_hex(raw_service)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    sb = get_supabase()
    sb.table("electron_service_tokens").insert({
        "user_id": user_id,
        "token_hash": service_hash,
        "expires_at": expires_at,
    }).execute()

    return {"service_token": raw_service}


@router.post("/electron/token/refresh")
async def electron_token_refresh(request: Request, response: Response, current_user=Depends(get_current_user)):
    sb = get_supabase()
    user_id = str(current_user["id"])
    is_bearer = current_user.get("_auth_type") == "service_token"

    if is_bearer:
        auth_header = request.headers.get("authorization", "")
        raw_token = auth_header.removeprefix("Bearer ").strip() if auth_header.startswith("Bearer ") else ""
        if raw_token:
            token_hash = sha256_hex(raw_token)
            rec = sb.table("electron_service_tokens").select("expires_at").eq("token_hash", token_hash).maybe_single().execute()
            if rec.data:
                exp = datetime.fromisoformat(rec.data["expires_at"].replace("Z", "+00:00"))
                hours_remaining = (exp - datetime.now(timezone.utc)).total_seconds() / 3600
                if hours_remaining >= 48:
                    return Response(status_code=204)
            sb.table("electron_service_tokens").update({"revoked": True}).eq("token_hash", token_hash).execute()
    else:
        old = sb.table("electron_service_tokens").select("id").eq("user_id", user_id).eq("revoked", False).order("created_at", desc=True).limit(1).execute()
        if not old.data:
            raise HTTPException(status_code=401, detail="No active service token found.")
        sb.table("electron_service_tokens").update({"revoked": True}).eq("id", old.data[0]["id"]).execute()

    new_token = secrets.token_urlsafe(32)
    new_hash = sha256_hex(new_token)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    sb.table("electron_service_tokens").insert({
        "user_id": user_id,
        "token_hash": new_hash,
        "expires_at": expires_at,
    }).execute()

    return {"service_token": new_token}


# ─── Device fingerprint check (internal) ─────────────────────────────────────

async def _device_check(sb, user_id: str, request: Request) -> bool:
    """
    Register/update the device fingerprint and check for geo anomaly.
    Returns True if a step-up OTP was issued and login must be blocked.
    """
    ua = request.headers.get("user-agent", "")
    screen_res = request.headers.get("x-screen-res", "")
    timezone_str = request.headers.get("x-timezone", "")
    ip = request.client.host if request.client else ""
    country = geo_service.ip_to_country(ip)
    fingerprint = sha256_hex(ua + screen_res + timezone_str)

    existing = sb.table("user_devices").select("*").eq("user_id", user_id).eq("fingerprint_hash", fingerprint).maybe_single().execute()

    if not existing.data:
        device_result = sb.table("user_devices").insert({
            "user_id": user_id,
            "fingerprint_hash": fingerprint,
            "ip_address": ip,
            "country_code": country,
            "user_agent": ua,
            "is_trusted": False,
            "last_seen_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        device_id = device_result.data[0]["id"] if device_result.data else None
        user_result = sb.table("users").select("email").eq("id", user_id).maybe_single().execute()
        if user_result.data:
            city = geo_service.ip_to_city(ip)
            email_service.send_new_device_alert(user_result.data["email"], city=city, country=country)
        _audit(sb, "NEW_DEVICE", user_id, "device",
               resource_id=str(device_id) if device_id else None, ip=ip)
        return False

    device = existing.data
    prev_country = device.get("country_code")
    prev_seen_str = device.get("last_seen_at")
    prev_seen = None
    if prev_seen_str:
        prev_seen = datetime.fromisoformat(prev_seen_str.replace("Z", "+00:00"))

    sb.table("user_devices").update({
        "last_seen_at": datetime.now(timezone.utc).isoformat(),
        "ip_address": ip,
        "country_code": country,
    }).eq("id", device["id"]).execute()

    if geo_service.is_impossible_travel(prev_country, prev_seen, country, settings.geo_anomaly_threshold_minutes):
        _audit(sb, "GEO_ANOMALY", user_id, "device", ip=ip,
               details={"prev_country": prev_country, "curr_country": country})
        return await _trigger_step_up_otp(sb, user_id, ip)

    return False


async def _trigger_step_up_otp(sb, user_id: str, ip: str) -> bool:
    """Issue a step-up OTP for geo-anomaly and email the user. Returns True on success."""
    user_result = sb.table("users").select("email").eq("id", user_id).maybe_single().execute()
    if not user_result.data:
        return False
    email = user_result.data["email"]

    otp_plain = str(secrets.randbelow(1000000)).zfill(6)
    otp_hash = sha256_hex(otp_plain)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=settings.otp_expiry_minutes)).isoformat()

    sb.table("otp_codes").delete().eq("user_id", user_id).execute()
    sb.table("otp_codes").insert({
        "user_id": user_id,
        "otp_code_hash": otp_hash,
        "expires_at": expires_at,
        "attempt_count": 0,
        "resend_count": 0,
    }).execute()

    email_service.send_otp_email(to=email, code=otp_plain)
    _audit(sb, "STEP_UP_OTP_SENT", user_id, "auth", ip=ip,
           details={"reason": "geo_anomaly"})
    return True


# ─── Password change (authenticated self-service) ────────────────────────────

class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


@router.post("/password/change")
async def change_password(body: ChangePasswordBody, request: Request, current_user=Depends(get_current_user)):
    _password_policy(body.new_password)
    sb = get_supabase()
    ip = request.client.host if request.client else "unknown"
    user_id = str(current_user["id"])

    user_result = sb.table("users").select("password_hash").eq("id", user_id).maybe_single().execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found.")

    if not verify_password(body.current_password, user_result.data["password_hash"]):
        _audit(sb, "PASSWORD_CHANGE_FAIL", user_id, "password", ip=ip,
               details={"reason": "wrong_current_password"})
        raise HTTPException(status_code=401, detail="Current password is incorrect.")

    history_result = sb.table("password_history").select("password_hash").eq("user_id", user_id).order("created_at", desc=True).limit(3).execute()
    for h in (history_result.data or []):
        if verify_password(body.new_password, h["password_hash"]):
            raise HTTPException(status_code=422, detail="Cannot reuse a recent password.")

    new_hash = hash_password(body.new_password)
    sb.table("users").update({"password_hash": new_hash}).eq("id", user_id).execute()
    sb.table("password_history").insert({"user_id": user_id, "password_hash": new_hash}).execute()
    sb.table("refresh_tokens").update({"revoked": True}).eq("user_id", user_id).execute()

    _audit(sb, "PASSWORD_CHANGED", user_id, "password", ip=ip)
    return {"message": "Password updated. Please log in again."}
