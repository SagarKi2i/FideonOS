# Fideon OS — Module 1: Auth Implementation Plan (Custom Architecture)

**Version:** 2.0  
**Created:** 2026-05-21  
**QA Owner:** 
**BA / PO:** 
**Dev Lead:**  
**Source ACs:**  
**Architecture Reference:** `final_auth_free_only.svg`  
**Stack:** Next.js 15 → FastAPI (Python) → Self-Hosted Supabase PostgreSQL (DB only — no Supabase Auth)

> **Architecture decision:** Self-Hosted Supabase is used **only as a PostgreSQL database**.  
> No `auth.*` tables. No Supabase Auth SDK on the frontend. No Supabase JWTs.  
> FastAPI owns the entire auth layer: password hashing, OTP, JWT issuance, token rotation.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema — All Custom (`public.*`)](#2-database-schema--all-custom-public)
3. [FastAPI Services & Endpoints](#3-fastapi-services--endpoints)
4. [Frontend Pages & Components](#4-frontend-pages--components)
5. [Electron Integration](#5-electron-integration)
6. [Implementation Phases](#6-implementation-phases)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     BROWSER / ELECTRON                       │
│         HTTPS only · HttpOnly cookies (JWT access +          │
│         refresh)  · No Supabase JS client for auth           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│               NEXT.JS 15 FRONTEND  (port 3000)               │
│  • Calls FastAPI auth endpoints only — zero Supabase calls   │
│  • middleware.ts  verifies RS256 JWT (jose) to guard routes   │
│  • AuthContext   calls GET /api/auth/me on mount              │
└───────────────────────┬─────────────────────────────────────┘
                        │  fetch() · HttpOnly cookie: access_token (JWT)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                FASTAPI BACKEND  (port 8000)                  │
│                                                              │
│  services/jwt.py      RS256 JWT issue + validate             │
│  services/argon2.py   Argon2id hash + constant-time verify   │
│  services/email.py    Resend SDK (TLS · DKIM/SPF)            │
│  services/geo.py      IP → country · impossible-travel       │
│  services/ratelimit.py  rate limiter + Valkey                 │
│  auth/dependencies.py   get_current_user · require_admin     │
└───────────────────────┬─────────────────────────────────────┘
                        │  supabase-py (service role key)
                        │  Plain SQL/PostgREST — DB only
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  SELF-HOSTED SUPABASE POSTGRESQL (DB only — no auth.* tables) │
│                                                              │
│  public.users                  ← central identity table      │
│  public.invites                ← invite-only signup gate     │
│  public.user_roles             ← RBAC                        │
│  public.user_devices           ← device fingerprint          │
│  public.refresh_tokens         ← token rotation              │
│  public.password_reset_tokens  ← forgot-password flow        │
│  public.password_history       ← last-3 password check       │
│  public.audit_logs             ← INSERT-only event log       │
│  public.electron_service_tokens ← Electron independent auth  │
└─────────────────────────────────────────────────────────────┘
```

### Auth Flow (maps to SVG sections ①–④)

```
① Invite flow
   Admin Dashboard (MFA-gated role=admin)
   → secrets.token_urlsafe(32) → SHA-256 → DB stores hash only
   → Resend sends raw token in link  /signup?token=<raw>  (HTTPS)
   → invites: token_hash · email · status=PENDING · expires_at=now+INVITE_EXPIRY_HOURS

② Signup flow
   /signup?token=xyz → rate limit (5/hr/IP · 5/hr/email · 5/hr/token)
   → SHA-256 match · PENDING · not expired · email lock → 403 if fail
   → Signup form (email read-only · password entry)
   → BEGIN → atomic UPDATE invites SET status='ACCEPTED' WHERE status='PENDING' RETURNING
             (1 row = this request wins; 0 rows = already taken → ROLLBACK → 403)
             → Argon2id hash → INSERT users → INSERT user_roles → COMMIT

③ Sign-in + Email OTP (MFA)
   POST /login → generic error (prevents enumeration)
   → Argon2id constant-time verify → lockout after 5 fails
   → 6-digit OTP generated · SHA-256 stored in otp_codes.otp_code_hash
   → Resend dispatches OTP email (10 min expiry · max 3 attempts)
   → POST /otp/verify → constant-time hash match
   → JWT issued RS256: access (15 min · jti) + refresh (7 days)
   → Both set as HttpOnly + Secure + SameSite=Strict cookies
   → Device fingerprint check → new device email alert
   → Geo anomaly check → impossible travel → step-up OTP

④ JWT session · Refresh rotation · Logout
   Access expires → POST /token/refresh
   → Atomic: revoke old refresh token → issue new access + refresh
   → Replay (revoked token reused) → revoke ALL user tokens + alert
   POST /logout → revoke refresh token · clear cookies · log event
```

---

## 2. Database Schema — All Custom (`public.*`)

> All FKs point to `public.users(id)`.  
> No `auth.*` tables referenced anywhere.  
> All tables have RLS enabled; app accesses via FastAPI service-role connection.

---

### 2.1 `public.users` — Central identity table

Replaces `auth.users` entirely. Holds credentials and lockout state. OTP state lives in `public.otp_codes`.

```sql
CREATE TABLE public.users (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  email             TEXT        NOT NULL UNIQUE,          -- lowercase-normalised on INSERT/UPDATE
  password_hash     TEXT        NOT NULL,                  -- Argon2id hash; never store plaintext

  -- Account state
  status            TEXT        NOT NULL DEFAULT 'pending' -- active | pending | locked | suspended
                    CHECK (status IN ('active','pending','locked','suspended')),
  email_verified_at TIMESTAMPTZ,                          -- NULL = unverified

  -- Brute-force lockout
  failed_attempts   INT         NOT NULL DEFAULT 0,
  locked_until      TIMESTAMPTZ,                          -- NULL = not locked

  -- Profile
  full_name         TEXT,

  -- Timestamps
  last_sign_in_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX users_email_idx ON public.users (email);
CREATE INDEX users_status_idx ON public.users (status);

-- RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- All access via FastAPI service-role — no direct user policies needed
-- FastAPI enforces all logic in Python before touching the DB
```

**Field reference for ACs:**

| Field | AC | Purpose |
|-------|----|---------|
| `password_hash` | AC-004, AC-007, AC-018 | Argon2id; verified with constant-time compare |
| `status` | AC-004, AC-007, AC-009 | `pending` → `active` on signup; `locked` on 5 fails |
| `email_verified_at` | AC-004 | Set after OTP verify completes signup |
| `failed_attempts` | AC-008, AC-009 | Increments on wrong password; resets on success |
| `locked_until` | AC-009 | Set to `now() + lockout_duration` on 5th fail |

---

### 2.2 `public.otp_codes` — OTP state

Separated from `public.users` to keep credential records clean and allow atomic OTP operations without touching the core user row.

```sql
CREATE TABLE public.otp_codes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  otp_code_hash TEXT        NOT NULL,           -- SHA-256(6-digit code)
  expires_at    TIMESTAMPTZ NOT NULL,           -- now() + OTP_EXPIRY_MINUTES
  attempt_count INT         NOT NULL DEFAULT 0,
  resend_count  INT         NOT NULL DEFAULT 0, -- reset on each new /login call
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX otp_codes_user_id_idx ON public.otp_codes (user_id);

ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
-- FastAPI service-role handles all INSERT/SELECT/UPDATE/DELETE
```

**One row per user** (UNIQUE on `user_id`). Row is **deleted** on successful verify, expiry, or max attempts — never nulled in-place. A new `/login` call deletes any existing row and inserts a fresh one.

**AC coverage:** AC-010 · AC-011 · AC-012

---

### 2.3 `public.invites` — Invite-only signup gate

```sql
CREATE TABLE public.invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  TEXT        NOT NULL UNIQUE,          -- SHA-256(raw token); raw token only in email link
  email       TEXT        NOT NULL,                  -- lowercase-normalised; signup email must match
  status      TEXT        NOT NULL DEFAULT 'PENDING'
              CHECK (status IN ('PENDING','ACCEPTED','EXPIRED','REVOKED')),
  invited_by  UUID        REFERENCES public.users(id), -- NULLABLE = system-generated
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '48 hours', -- default; actual expiry set by FastAPI from INVITE_EXPIRY_HOURS env var
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX invites_token_hash_idx ON public.invites (token_hash);
CREATE INDEX invites_email_idx      ON public.invites (email);
CREATE INDEX invites_status_idx     ON public.invites (status);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
-- FastAPI service-role handles all INSERT/SELECT/UPDATE
```

**AC coverage:** AC-001 · AC-002 · AC-003 · AC-004 · AC-005 · AC-006

---

### 2.4 `public.user_roles` — RBAC

> **Implemented reality (matches migration `20260522010300`):** `role` is a
> `TEXT` column with a `CHECK` constraint — NOT a Postgres `app_role` ENUM. The
> `has_role()` SECURITY DEFINER function is **not** created: FastAPI connects as
> `service_role` and reads the role directly (`select("role")`), so there is no
> calling-session row-leak to guard against. The ENUM + `has_role()` design below
> was the original plan and is retained only as historical context.

```sql
CREATE TABLE public.user_roles (
  id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID      NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  role       TEXT      NOT NULL DEFAULT 'user'
                       CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Role checks are done in FastAPI via a direct `select("role")` as service_role.
-- No public.app_role ENUM and no has_role() function are created.
```

**AC coverage:** AC-020 · AC-021 · AC-022

---

### 2.5 `public.user_devices` — Device fingerprinting & geo

```sql
CREATE TABLE public.user_devices (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  fingerprint_hash TEXT    NOT NULL,    -- SHA-256(user_agent || screen_res || timezone)
  ip_address       TEXT,
  country_code     CHAR(2),             -- ISO 3166-1 alpha-2; used for impossible-travel check
  user_agent       TEXT,
  is_trusted       BOOLEAN NOT NULL DEFAULT false,
  last_seen_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, fingerprint_hash)
);

CREATE INDEX user_devices_user_id_idx ON public.user_devices (user_id);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
```

**AC coverage:** AC-015 (geo anomaly) · AC-023 (Electron device tracking)

---

### 2.6 `public.refresh_tokens` — JWT refresh token rotation

```sql
CREATE TABLE public.refresh_tokens (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash  TEXT    NOT NULL UNIQUE, -- SHA-256(raw refresh token); raw only in HttpOnly cookie
  jti         TEXT    NOT NULL UNIQUE, -- matches jti claim in the paired access token
  revoked     BOOLEAN NOT NULL DEFAULT false,
  expires_at  TIMESTAMPTZ NOT NULL,
  device_info JSONB,                   -- snapshot: fingerprint_hash, user_agent
  ip_address  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX refresh_tokens_user_id_idx ON public.refresh_tokens (user_id);
-- jti UNIQUE constraint already creates a btree index — no separate index needed
-- revoked is boolean (low cardinality) — index would not be used by the planner

ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;
```

**AC coverage:** AC-013 · AC-014 · AC-016

---

### 2.7 `public.password_reset_tokens` — Forgot password flow

```sql
CREATE TABLE public.password_reset_tokens (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reset_token_hash TEXT    NOT NULL UNIQUE, -- SHA-256(raw token)
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '15 minutes', -- default; FastAPI sets from PASSWORD_RESET_EXPIRY_MINUTES
  used             BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
```

**AC coverage:** AC-017 · AC-018 · AC-019

---

### 2.8 `public.password_history` — Last-3 password check

```sql
CREATE TABLE public.password_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,              -- Argon2id hash of a previous password
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Only keep the 3 most recent per user; prune on insert via trigger
CREATE OR REPLACE FUNCTION public.prune_password_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.password_history
  WHERE user_id = NEW.user_id
    AND id NOT IN (
      SELECT id FROM public.password_history
      WHERE user_id = NEW.user_id
      ORDER BY created_at DESC
      LIMIT 3
    );
  RETURN NEW;
END;
$$;
CREATE TRIGGER prune_password_history_trigger
  AFTER INSERT ON public.password_history
  FOR EACH ROW EXECUTE FUNCTION public.prune_password_history();

ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;
```

**AC coverage:** AC-018 (password must not match previous 3)

---

### 2.9 `public.audit_logs` — Append-only event log

```sql
CREATE TABLE public.audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES public.users(id),  -- NULLABLE: NULL on pre-auth failures
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,  -- 'auth' | 'invite' | 'device' | 'session' | 'password'
  resource_id   TEXT,           -- relevant entity UUID (invite_id, device_id, token jti)
  ip_address    TEXT,
  user_agent    TEXT,
  details       JSONB,          -- event-specific payload; NEVER store tokens / passwords / OTP
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Action enum (enforced in FastAPI, documented here):
-- LOGIN_SUCCESS | LOGIN_FAIL | SIGNUP | LOGOUT
-- OTP_SENT | OTP_VERIFIED | OTP_FAIL
-- TOKEN_REFRESHED | REPLAY_ATTACK_DETECTED
-- NEW_DEVICE | GEO_ANOMALY
-- ACCOUNT_LOCKED
-- PASSWORD_RESET_REQUEST | PASSWORD_RESET_SUCCESS | PASSWORD_RESET_FAIL
-- UNAUTHORIZED_ACCESS | INVITE_SENT | INVITE_REJECTED

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
CREATE INDEX audit_logs_user_id_idx    ON public.audit_logs (user_id);
CREATE INDEX audit_logs_action_idx     ON public.audit_logs (action);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Intended INSERT-only enforcement at the DB role level:
-- REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticator;
```

> **⚠️ Enforcement caveat (implemented reality):** migration
> `20260523000000_audit_logs_revoke_mutate.sql` issues this REVOKE against the
> `authenticator` role, but **FastAPI connects as `service_role`, not
> `authenticator`** — so the REVOKE does NOT actually prevent the app from
> updating/deleting audit rows. Append-only is therefore a code-level convention
> (FastAPI only ever INSERTs), not a DB-enforced guarantee. To make it real,
> REVOKE UPDATE/DELETE from `service_role` (or use a dedicated, restricted DB role
> for audit writes).

**AC coverage:** AC-025 · All groups (every auth event must log)

---

### 2.10 `public.electron_service_tokens` — Electron independent auth

```sql
CREATE TABLE public.electron_service_tokens (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  device_id  UUID    REFERENCES public.user_devices(id),
  expires_at TIMESTAMPTZ NOT NULL,            -- long-lived: 30 days
  revoked    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.electron_service_tokens ENABLE ROW LEVEL SECURITY;
```

**AC coverage:** AC-023 · AC-024

---

### 2.11 Schema Relationship Map

```
public.users  (id)
  │
  ├──< public.invites.invited_by              (NULLABLE FK · 1:N)
  ├──  public.user_roles.user_id              (1:1 UNIQUE FK)
  ├──  public.otp_codes.user_id               (1:1 UNIQUE FK · transient)
  ├──< public.user_devices.user_id            (1:N FK)
  ├──< public.refresh_tokens.user_id          (1:N FK)
  ├──< public.password_reset_tokens.user_id   (1:N FK)
  ├──< public.password_history.user_id        (1:N FK · max 3 kept)
  ├──< public.audit_logs.user_id              (NULLABLE FK · INSERT-only)
  └──< public.electron_service_tokens.user_id (1:N FK)

public.user_devices.id
  └──< public.electron_service_tokens.device_id (NULLABLE FK)
```

---

## 3. FastAPI Services & Endpoints

### 3.1 New Service Files

| File | Responsibility |
|------|---------------|
| `backend/services/jwt.py` | RS256 JWT issue (`create_access_token`, `create_refresh_token`) and decode (`decode_token`). Reads private key from `backend/keys/private.pem`, public key from `backend/keys/public.pem`. |
| `backend/services/argon2.py` | `hash_password(plain)` and `verify_password(plain, hash)` using `argon2-cffi`. Constant-time. |
| `backend/services/email.py` | `send_invite_email()`, `send_otp_email()`, `send_reset_email()`, `send_new_device_alert()` via Resend SDK. |
| `backend/services/geo.py` | `ip_to_country(ip)` via IP geolocation lookup. `is_impossible_travel(prev_country, prev_time, curr_country, curr_time)`. |
| `backend/services/ratelimit.py` | Rate limiter with Valkey backend. Three key types: **per-IP** (`ip:{ip}:{endpoint}`), **per-email** (`email:{sha256(email)}:{endpoint}`), **per-token** (`token:{sha256(token)}:{endpoint}`). Email and token values are SHA-256-hashed before use as Valkey keys to avoid storing PII. |
| `backend/services/crypto.py` | `sha256_hex(raw: str \| bytes) → str`. Constant-time compare via `hmac.compare_digest`. Token generation uses `secrets.token_urlsafe(32)` directly at each call site — no wrapper needed. |

### 3.2 Updated `auth/dependencies.py`

```python
async def get_current_user(access_token: str = Cookie(None)):
    """Decode RS256 JWT issued by FastAPI. Raise 401 if invalid/expired."""
    payload = jwt_service.decode_token(access_token)  # raises 401 on failure
    user = await db.fetch_user_by_id(payload["sub"])
    if not user or user["status"] != "active":
        raise HTTPException(401)
    # Merge JWT claims so all callers have role + mfa_verified without re-decoding
    return {
        **user,
        "role":         payload["role"],
        "mfa_verified": payload["mfa_verified"],
    }

async def require_admin(user = Depends(get_current_user)):
    """Check user_roles.role = admin AND JWT contains mfa_verified=true."""
    if not user.get("mfa_verified"):
        raise HTTPException(403, "MFA required for admin access")
    if user["role"] != "admin":
        raise HTTPException(403, "Admin role required")
    return user
```

---

### 3.3 Invite Flow — Group A

**`POST /api/auth/invite`** — `Depends(require_admin)`

```
Body: { email: str }

# AC-006 (out-of-domain email restriction) is OUT OF SCOPE for this release — no domain allowlist check.

1.  Check no PENDING invite exists for this email
    → 409 Conflict if duplicate
2.  raw = secrets.token_urlsafe(32)        # URL-safe base64, ~43 chars, 256-bit entropy
3.  token_hash = crypto.sha256_hex(raw)
4.  expires_at = now() + timedelta(hours=settings.INVITE_EXPIRY_HOURS)   # default: 48
5.  INSERT invites (token_hash, email, status='PENDING',
                    expires_at=expires_at, invited_by=current_user.id)
6.  email.send_invite_email(to=email, link=f"{DOMAIN}/signup?token={raw}")
7.  audit_log(action='INVITE_SENT', user_id=current_user.id, resource_type='invite')

→ 201 { message: "Invite sent." }
→ 403  not admin / MFA not completed
→ 409  duplicate PENDING invite
```

**`POST /api/auth/invite/validate`** — public, rate-limited

```
Body: { token: str }
# Token sent in POST body, not query string — avoids leaking via server logs / referer / history

Rate limit (all three must pass):
  · 5 req/hr per IP            — blocks proxy sweeps across many tokens
  · 5 req/hr per token hash    — blocks hammering a single token from rotating IPs
    (Valkey key: token:{sha256(raw_token)}:validate)
→ 429 on any breach

1.  hash = crypto.sha256_hex(token)
2.  SELECT from invites WHERE token_hash = hash (constant-time via hmac.compare_digest)
3.  If not found OR status != 'PENDING' OR expires_at <= now():
    → 403  generic: "This invite link is invalid or has expired."
    (do NOT distinguish expired vs tampered vs used)

→ 200 { email: "user@domain.com" }
```

---

### 3.4 Signup — Group A continued

**`POST /api/auth/signup`** — public, rate-limited

```
Body: { token: str, password: str }
Rate limit (all three must pass):
  · 5 req/hr per IP                    — baseline IP limit
  · 5 req/hr per token hash            — blocks proxy-rotating attackers replaying one token
    (Valkey key: token:{sha256(token)}:signup)
  · 3 req/hr per email (from invite record post-lookup) — blocks target-specific spam
    (Valkey key: email:{sha256(email)}:signup)
→ 429 on any breach

1.  Validate password policy up-front (before any DB write):
    - min 12 chars · 1 uppercase · 1 lowercase · 1 digit · 1 special char
    - not in common-passwords list
    → 422 with policy violation details if fails
2.  hash = crypto.sha256_hex(token)
3.  password_hash = argon2.hash_password(password)   # hash before the transaction
4.  BEGIN transaction
5.  invite = UPDATE invites
             SET    status = 'ACCEPTED'
             WHERE  token_hash = hash
               AND  status     = 'PENDING'
               AND  expires_at > now()
             RETURNING id, email
    ↑ Atomic conditional UPDATE — PostgreSQL's implicit row lock means only ONE
      concurrent request can flip PENDING→ACCEPTED; the other gets 0 rows back.
    If rowcount = 0: ROLLBACK → 403 "This invite link is invalid or has expired."
                                    (covers expired · already used · tampered · concurrent loser)
6.  INSERT users (email=invite.email, password_hash, status='pending')
    → returns new_user_id
7.  INSERT user_roles (user_id=new_user_id, role='user')
8.  COMMIT
9.  audit_log(action='SIGNUP', user_id=new_user_id, resource_type='auth')

→ 201 { message: "Account created. Please log in." }
→ 403  token invalid / expired / already used / concurrent loser (all same generic message)
→ 429  rate limit

Race condition (AC-005 — first-come-first-served, no explicit lock):
  Both sessions submit simultaneously.
  PostgreSQL serialises the two UPDATEs internally — one wins (gets the row back),
  the other gets 0 rows → ROLLBACK → 403 identical generic message.
  No deadlocks, no explicit FOR UPDATE, no session blocking the other.
```

---

### 3.5 Sign-in + Email OTP — Groups B & C

**`POST /api/auth/login`** — public, rate-limited

```
Body: { email: str, password: str }
Rate limit (all three must pass):
  · 10 req/min per IP                  — burst cap for automated sweeps
  · 5 req/hr  per IP                   — sustained cap
  · 5 req/hr  per email                — primary brute-force guard; survives NAT/proxy bypass
    (Valkey key: email:{sha256(lower(email))}:login)
→ 429 on any breach

1.  user = SELECT from users WHERE email = lower(body.email)
    (do NOT return early if not found — continue to prevent timing attacks)
2.  locked_until check:
    If user and user.locked_until > now() → 403 "Account is locked. Try again later."
3.  argon2.verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    (always runs Argon2id even for non-existent email — constant time)
4a. FAIL:
    If user exists: UPDATE users SET failed_attempts = failed_attempts + 1
    If failed_attempts >= 5:
      UPDATE users SET locked_until = now() + INTERVAL '30 minutes', status='locked'
      audit_log(action='ACCOUNT_LOCKED')
    audit_log(action='LOGIN_FAIL', details={reason: generic})
    → 401 "Invalid email or password."   ← identical for wrong password AND unknown email
4b. SUCCESS:
    UPDATE users SET failed_attempts = 0, locked_until = NULL
    otp_plain = str(secrets.randbelow(1000000)).zfill(6)  # 6-digit
    otp_hash  = crypto.sha256_hex(otp_plain)
    DELETE FROM otp_codes WHERE user_id = user.id    ← clear any prior session
    INSERT otp_codes (user_id=user.id, otp_code_hash=otp_hash,
                      expires_at=now()+timedelta(minutes=settings.OTP_EXPIRY_MINUTES),
                      attempt_count=0, resend_count=0)
    # OTP_EXPIRY_MINUTES env var — default: 10
    email.send_otp_email(to=user.email, code=otp_plain)
    audit_log(action='OTP_SENT', user_id=user.id)
    → 200 { message: "A verification code has been sent to your email." }

NOTE: Response is identical shape for valid + invalid credentials (no enumeration).
NOTE: Never log or return the password or OTP in any response.
```

**`POST /api/auth/otp/verify`** — public

```
Body: { email: str, otp: str }

1.  user = SELECT from users WHERE email = lower(body.email)
    → 401 generic if not found
2.  otp = SELECT from otp_codes WHERE user_id = user.id
    → 401 "Code expired. Please log in again." if not found
    If otp.expires_at < now():
    DELETE FROM otp_codes WHERE user_id = user.id
    audit_log(action='OTP_FAIL', details={reason:'expired'})
    → 401 "Code expired. Please log in again."
3.  If otp.attempt_count >= 3:
    DELETE FROM otp_codes WHERE user_id = user.id
    audit_log(action='OTP_FAIL', details={reason:'max_attempts'})
    → 401 "Too many attempts. Please log in again."
4.  submitted_hash = crypto.sha256_hex(body.otp)
    match = hmac.compare_digest(submitted_hash, otp.otp_code_hash)
4a. NO MATCH:
    UPDATE otp_codes SET attempt_count = attempt_count + 1 WHERE user_id = user.id
    If new count >= 3: DELETE FROM otp_codes WHERE user_id = user.id
    audit_log(action='OTP_FAIL')
    → 401 "Invalid code."
4b. MATCH:
    DELETE FROM otp_codes WHERE user_id = user.id    ← clean up
    UPDATE users SET status='active',
                     email_verified_at = COALESCE(email_verified_at, now()),
                     last_sign_in_at = now()

    # Fetch role for JWT claim
    user_role = SELECT role FROM user_roles WHERE user_id = user.id  # → 'user' | 'admin'

    # Issue JWT access token  (JWT_ACCESS_EXPIRY_MINUTES env var — default: 15)
    jti = str(uuid4())
    access_token = jwt.create_access_token({
      sub: user.id, email: user.email,
      role: user_role, mfa_verified: true, jti: jti
    }, expires_minutes=settings.JWT_ACCESS_EXPIRY_MINUTES)

    # Issue refresh token  (JWT_REFRESH_EXPIRY_DAYS env var — default: 7)
    raw_refresh = secrets.token_urlsafe(32)
    refresh_hash = crypto.sha256_hex(raw_refresh)
    refresh_expiry = timedelta(days=settings.JWT_REFRESH_EXPIRY_DAYS)
    INSERT refresh_tokens (user_id, token_hash=refresh_hash, jti,
                           expires_at=now()+refresh_expiry, device_info, ip_address)

    # Set cookies — Max-Age derived from the same env vars
    access_max_age  = settings.JWT_ACCESS_EXPIRY_MINUTES * 60
    refresh_max_age = settings.JWT_REFRESH_EXPIRY_DAYS * 86400
    Set-Cookie: access_token={access_token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age={access_max_age}
    Set-Cookie: refresh_token={raw_refresh}; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/token/refresh; Max-Age={refresh_max_age}
    # Next.js middleware verifies the access_token JWT directly — no session flag cookie needed

    audit_log(action='LOGIN_SUCCESS', user_id=user.id)
    device_check(user.id, request)   # → NEW_DEVICE alert or GEO_ANOMALY step-up
    # Electron OTC flow is renderer-initiated: after OTP verify, frontend calls
    # POST /api/auth/electron/otc then fires fideon://auth?otc=<value> deep link.
    # Backend does NOT push to Electron — no server-side dispatch here.

    → 200 { message: "Login successful.", user: { id, email, role, full_name } }
```

**`POST /api/auth/otp/resend`** — public, rate-limited

```
Rate limit (all must pass):
  · OTP_RESEND_LIMIT req per active OTP session per email  — primary (default: 3)
    (tracked via otp_codes.resend_count; row replaced on each new /login call)
  · OTP_RATE_WINDOW_REQUESTS req / OTP_RATE_WINDOW_MINUTES min per IP — secondary (default: 5/hr)
  → 429 on any breach; 400 if no active OTP session exists (user must restart login)
Body: { email: str }

1.  user = SELECT from users WHERE email = lower(body.email)
    otp  = SELECT from otp_codes WHERE user_id = user.id AND expires_at > now()
    → 400 if no active OTP session (user must restart login)
    → 429 if otp.resend_count >= settings.OTP_RESEND_LIMIT
2.  Regenerate OTP and re-send:
    - new OTP_EXPIRY_MINUTES window
    - UPDATE otp_codes SET otp_code_hash=new_hash, expires_at=new_expiry,
                           attempt_count=0, resend_count=resend_count+1
      WHERE user_id=user.id
    email.send_otp_email(to=user.email, code=new_otp_plain)
    audit_log(action='OTP_SENT', user_id=user.id)

→ 200 { message: "A new code has been sent." }
```

---

### 3.6 JWT Token Refresh & Logout — Groups D & E

**`POST /api/auth/token/refresh`**

```
Reads: refresh_token cookie (HttpOnly)

1.  raw_refresh = cookie["refresh_token"]
    hash = crypto.sha256_hex(raw_refresh)

2.  record = SELECT from refresh_tokens WHERE token_hash = hash

3a. Not found → 401 "Session expired. Please log in."

3b. Found with revoked=true  → REPLAY ATTACK:
    UPDATE refresh_tokens SET revoked=true WHERE user_id = record.user_id  ← revoke ALL
    audit_log(action='REPLAY_ATTACK_DETECTED', user_id=record.user_id,
              details={ip, user_agent})
    # Fetch user to send alert email
    user = db.fetch_user_by_id(record.user_id)
    email.send_security_alert(user.email)
    → 401 "Session invalidated for security. Please log in again."

3c. expires_at < now() → 401 "Session expired."

4.  Fetch user + role to populate new token claims:
    user      = db.fetch_user_by_id(record.user_id)
    user_role = SELECT role FROM user_roles WHERE user_id = record.user_id

    ATOMIC transaction:
    UPDATE refresh_tokens SET revoked=true WHERE id = record.id
    new_jti = str(uuid4())
    new_access = jwt.create_access_token({
      sub: user.id, email: user.email,
      role: user_role, mfa_verified: true, jti: new_jti
    }, expires_minutes=settings.JWT_ACCESS_EXPIRY_MINUTES)
    new_raw_refresh = secrets.token_urlsafe(32)
    new_hash = crypto.sha256_hex(new_raw_refresh)
    INSERT refresh_tokens (user_id, token_hash=new_hash, jti=new_jti,
                           expires_at=now()+timedelta(days=settings.JWT_REFRESH_EXPIRY_DAYS), ...)
    COMMIT

5.  Set new cookies (same attributes as /otp/verify)
    audit_log(action='TOKEN_REFRESHED', user_id)
→ 200 (cookies silently updated)
```

**`POST /api/auth/logout`** — `Depends(get_current_user)`

```
1.  jti = current JWT payload["jti"]
2.  UPDATE refresh_tokens SET revoked=true WHERE jti = jti
3.  Set-Cookie: access_token=; Max-Age=0; HttpOnly; Secure; SameSite=Strict
    Set-Cookie: refresh_token=; Max-Age=0; HttpOnly; Secure; SameSite=Strict
4.  audit_log(action='LOGOUT', user_id)
→ 200 { message: "Logged out." }
```

---

### 3.7 Device Fingerprint & Geo Anomaly — AC-015

Called internally after every successful OTP verify and token refresh:

```python
async def device_check(user_id: UUID, request: Request):
    ua          = request.headers.get("user-agent", "")
    screen_res  = request.headers.get("x-screen-res", "")   # sent by frontend
    timezone    = request.headers.get("x-timezone", "")
    ip          = request.client.host
    country     = geo.ip_to_country(ip)
    fingerprint = crypto.sha256_hex(ua + screen_res + timezone)

    existing = db.fetch_device(user_id, fingerprint)

    if not existing:
        # New device
        device_id = db.insert_device(user_id, fingerprint, ip, country, ua)
        user = await db.fetch_user_by_id(user_id)
        email.send_new_device_alert(user.email, city=geo.ip_to_city(ip), country=country)
        audit_log(action='NEW_DEVICE', resource_id=str(device_id))
    else:
        prev_country  = existing["country_code"]
        prev_seen     = existing["last_seen_at"]
        db.update_device_last_seen(existing["id"], ip, country)

        # Impossible travel check
        if country != prev_country and prev_seen:
            minutes_since = (now() - prev_seen).total_seconds() / 60
            if minutes_since < GEO_ANOMALY_THRESHOLD_MINUTES:   # default: 60
                audit_log(action='GEO_ANOMALY', details={prev_country, country, minutes_since})
                # Trigger step-up OTP: re-generate OTP and require re-verify
                trigger_step_up_otp(user_id)
```

---

### 3.8 Forgot Password — Group F

**`POST /api/auth/password/forgot`** — public, rate-limited

```
Body: { email: str }
Rate limit (all must pass):
  · 3 req/hr per IP             — baseline
  · 3 req/hr per email          — prevents reset-link flooding to a specific inbox
    (Valkey key: email:{sha256(lower(email))}:password_forgot)
    Applied BEFORE the user lookup so the limit fires even for non-existent emails
→ 429 on any breach

1.  user = SELECT from users WHERE email = lower(body.email)
    (do NOT short-circuit if not found — prevent enumeration)
2.  If user exists:
    Invalidate prior tokens: UPDATE password_reset_tokens SET used=true WHERE user_id=uid
    raw = secrets.token_urlsafe(32)
    hash = crypto.sha256_hex(raw)
    INSERT password_reset_tokens (user_id, reset_token_hash=hash,
                                   expires_at=now()+timedelta(minutes=settings.PASSWORD_RESET_EXPIRY_MINUTES))
    # PASSWORD_RESET_EXPIRY_MINUTES env var — default: 15
    email.send_reset_email(to=user.email, link=f"{DOMAIN}/reset-password?token={raw}")
    audit_log(action='PASSWORD_RESET_REQUEST', user_id=uid)

→ 200 { message: "If an account exists for this email, a reset link has been sent." }
← Always 200. Never reveal whether email is registered.
```

**`POST /api/auth/password/reset`** — public

```
Body: { token: str, new_password: str }

1.  hash = crypto.sha256_hex(token)
2.  record = SELECT from password_reset_tokens
             WHERE reset_token_hash = hash AND used=false AND expires_at > now()
    → 403 "This reset link is invalid or has expired." if not found
3.  Validate password policy (min 12 · upper · lower · digit · special)
    Check against common-passwords list
    → 422 if fails
4.  history = SELECT password_hash FROM password_history
              WHERE user_id=record.user_id ORDER BY created_at DESC LIMIT 3
    For each h in history: if argon2.verify_password(new_password, h): → 422 "Cannot reuse a recent password"
5.  new_hash = argon2.hash_password(new_password)
6.  BEGIN transaction:
    UPDATE users SET password_hash = new_hash WHERE id = record.user_id
    INSERT password_history (user_id, password_hash = new_hash)
    UPDATE password_reset_tokens SET used=true WHERE id = record.id
    UPDATE refresh_tokens SET revoked=true WHERE user_id = record.user_id  ← force re-login everywhere
    COMMIT
7.  audit_log(action='PASSWORD_RESET_SUCCESS', user_id)

→ 200 { message: "Password updated. Please log in." }
```

---

### 3.9 RBAC & Protected Routes — Group G

```python
# Applied as Depends() on any admin-only route
require_admin    → enforces role=admin + mfa_verified=true in JWT
require_mfa      → enforces mfa_verified=true in JWT (for elevated ops)
get_current_user → enforces valid JWT + status=active
```

**Unauthorized access logging:**

```python
# In get_current_user: if JWT valid but endpoint requires higher privilege
audit_log(action='UNAUTHORIZED_ACCESS', user_id=uid,
          resource_type='endpoint', resource_id=request.url.path,
          details={role: user_role, required: 'admin'})
```

**AC-020 — Admin Dashboard:**
- `GET /api/admin/*` uses `Depends(require_admin)` (role=admin + mfa_verified=true)
- A valid JWT without `mfa_verified=true` is rejected even for admins

**AC-021 — Non-admin rejection:**
- HTTP 403 (not 401 — user IS authenticated, just not authorized)
- Every rejection writes `UNAUTHORIZED_ACCESS` to audit_logs

---

### 3.10 Electron Auth Endpoints — Group H

**`POST /api/auth/electron/otc`** — `Depends(get_current_user)` (called right after JWT issuance)

```
1.  Generate one-time code (OTC): raw_otc = secrets.token_urlsafe(32), ttl = 90 seconds
    Store in Valkey: key=sha256(raw_otc), value=user_id, TTL=90s
2.  Return raw_otc to web client (NOT the long-lived service token)
→ 200 { otc: raw_otc }
```

**`POST /api/auth/electron/token`** — called by Electron app

```
Body: { otc: str }
1.  hash = sha256(otc)
2.  user_id = Valkey.get(hash) → 401 if not found or expired
3.  Valkey.delete(hash)   ← single-use
4.  raw_service = secrets.token_urlsafe(32)
    INSERT electron_service_tokens (user_id, token_hash=sha256(raw_service),
                                    expires_at=now+30d, device_id)
→ 200 { service_token: raw_service }
Electron stores this in OS keychain (Windows Credential Manager / macOS Keychain)
```

**`POST /api/auth/electron/token/refresh`** — two callers, two auth paths

This endpoint must accept **either** credential. `get_current_user` is extended to check Bearer first, then fall back to the `access_token` HttpOnly cookie.

**Path A — Electron main process (normal silent renewal, Bearer auth):**
```
Header: Authorization: Bearer <raw_service_token>
1.  hash = sha256(raw_service_token)
2.  record = SELECT from electron_service_tokens WHERE token_hash=hash AND revoked=false
    → 401 if not found or revoked
3.  If expires_at >= now+48h: return 204 (no renewal needed yet)
4.  Issue new service token:
      new_token = secrets.token_urlsafe(32)
      INSERT electron_service_tokens (user_id, token_hash=sha256(new_token), expires_at=now+30d, ...)
      UPDATE old record SET revoked=true  ← atomic; replay detection via UNIQUE token_hash
→ 200 { "service_token": "<new_raw_token>" }
NOTE: Web logout does NOT revoke electron_service_tokens — separate token family
```

**Path B — Next.js renderer (recovery path, cookie auth):**
```
Cookie: access_token=<jwt>   ← HttpOnly cookie sent automatically by browser
(no Bearer header)
1.  JWT verified via get_current_user cookie fallback → resolves user_id
2.  SELECT most recent non-revoked token from electron_service_tokens WHERE user_id=uid
    → 401 if no active record found (user never completed OTC exchange on this device)
3.  Always issue a new service token (renderer calls this only when service token is already dead):
      new_token = secrets.token_urlsafe(32)
      INSERT electron_service_tokens (user_id, token_hash=sha256(new_token), expires_at=now+30d, ...)
      UPDATE old record SET revoked=true
→ 200 { "service_token": "<new_raw_token>" }
```

**When Path B is used:** The Electron main process emits `auth:token-expired` IPC when any FastAPI call returns 401. The renderer catches this, calls `POST /api/auth/electron/token/refresh` with `credentials: 'include'` (cookie auth), receives the new service token in the response body, and forwards it to the main process via `auth:store-service-token` IPC for keychain storage. This recovers the session without forcing a full re-login.

**`get_current_user` extension required:**
```python
async def get_current_user(
    request: Request,
    authorization: str = Header(default=None),
):
    # 1. Try Bearer service token
    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization.removeprefix("Bearer ")
        # validate against electron_service_tokens table
        ...
    # 2. Fall back to access_token cookie (RS256 JWT)
    token = request.cookies.get("access_token")
    if token:
        # verify RS256 JWT, extract user_id
        ...
    raise HTTPException(status_code=401)
```

---

### 3.11 Auth Utility Endpoints

**`GET /api/auth/me`** — `Depends(get_current_user)`

```python
@router.get("/api/auth/me")
async def me(current_user = Depends(get_current_user)):
    return {
        "id":           str(current_user["id"]),
        "email":        current_user["email"],
        "full_name":    current_user["full_name"],
        "role":         current_user["role"],         # from JWT via enriched get_current_user
        "mfa_verified": current_user["mfa_verified"], # from JWT via enriched get_current_user
        "status":       current_user["status"],
    }
```

Used by: Next.js AuthContext on mount · middleware session validation

**`GET /api/admin/invites`** — `Depends(require_admin)`

```
→ 200 { invites: [ { id, email, status, expires_at, invited_by, created_at } ] }
```

---

## 4. Frontend Pages & Components

### 4.1 Pages

| Route | File | AC |
|-------|------|----|
| `/auth` | `app/auth/page.tsx` | AC-007, AC-008, AC-009, AC-017 |
| `/auth/otp` | `app/auth/otp/page.tsx` | AC-010, AC-011, AC-012 |
| `/signup` | `app/signup/page.tsx` | AC-002, AC-003, AC-004 |
| `/reset-password` | `app/reset-password/page.tsx` | AC-018, AC-019 |

### 4.2 Remove Supabase Auth from Frontend

The following must be changed — Supabase JS client is **no longer used for auth**:

| Current | Replace with |
|---------|-------------|
| `lib/supabaseClient.ts` — `signIn()`, `signOut()`, `getSession()` | FastAPI auth endpoints via `lib/api.ts` → `authApi` |
| `contexts/AuthContext.tsx` Supabase listener | `GET /api/auth/me` on mount; `access_token` HttpOnly cookie sent automatically |
| `middleware.ts` Supabase session cookie check | Verify RS256 JWT in `access_token` HttpOnly cookie using `jose` (see §4.4) |

> `lib/supabaseClient.ts` can remain for any non-auth Supabase SDK usage, but auth functions must be removed.

### 4.3 AuthContext Rewrite

```typescript
// contexts/AuthContext.tsx
const AuthContext = createContext(...)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)

  useEffect(() => {
    // On mount: validate session via FastAPI
    authApi.me()
      .then(data => setUser(data))
      .catch(() => setUser(null))
  }, [])

  // Derived — no separate state; eliminates user/isAdmin drift
  const isAdmin = user?.role === 'admin'

  const signOut = async () => {
    await authApi.logout()
    setUser(null)
    router.push('/auth')
  }

  return <AuthContext.Provider value={{ user, isAdmin, signOut }}>
    {children}
  </AuthContext.Provider>
}
```

### 4.4 Middleware Update

```typescript
// middleware.ts
import { jwtVerify, importSPKI } from 'jose'

export async function middleware(request: NextRequest) {
  const isPublic = ['/auth', '/signup', '/reset-password', '/auth/otp',
                    '/_next', '/favicon.ico', '/api'].some(p =>
                      request.nextUrl.pathname.startsWith(p))

  if (isPublic) return NextResponse.next()

  const accessToken = request.cookies.get('access_token')?.value

  if (!accessToken) {
    return NextResponse.redirect(new URL('/auth', request.url))
  }

  try {
    // Verify RS256 JWT with the FastAPI public key — cryptographic auth at the edge
    const publicKey = await importSPKI(process.env.JWT_PUBLIC_KEY_PEM!, 'RS256')
    await jwtVerify(accessToken, publicKey)
    return NextResponse.next()
  } catch {
    return NextResponse.redirect(new URL('/auth', request.url))
  }
}
```

> **`JWT_PUBLIC_KEY_PEM`** — non-`NEXT_PUBLIC_` env var; accessed by edge runtime only, never sent to browser. Add to `frontend/.env.local`:
> ```
> JWT_PUBLIC_KEY_PEM=   # PEM content of backend/keys/public.pem
> ```
> The `session=1` flag cookie is no longer used for route guarding — the access token JWT is verified directly. Checking cookie presence only was trivially forgeable (anyone could set `session=1`).

### 4.5 API Layer Additions (`lib/api.ts`)

```typescript
export const authApi = {
  sendInvite:      (email: string)                     => post('/api/auth/invite', { email }),
  validateToken:   (token: string)                     => post('/api/auth/invite/validate', { token }),
  signup:          (token: string, password: string)   => post('/api/auth/signup', { token, password }),
  login:           (email: string, password: string)   => post('/api/auth/login', { email, password }),
  verifyOtp:       (email: string, otp: string)        => post('/api/auth/otp/verify', { email, otp }),
  resendOtp:       (email: string)                     => post('/api/auth/otp/resend', { email }),
  refresh:         ()                                  => post('/api/auth/token/refresh'),
  logout:          ()                                  => post('/api/auth/logout'),
  me:              ()                                  => get('/api/auth/me'),
  forgotPassword:  (email: string)                     => post('/api/auth/password/forgot', { email }),
  resetPassword:   (token: string, newPassword: string)=> post('/api/auth/password/reset', { token, new_password: newPassword }),
  listInvites:     ()                                  => get('/api/admin/invites'),
}
```

---

## 5. Electron Integration

### 5.1 Auto-Launch on Web Login (AC-023)

```
Web login completes (JWT issued + OTP verified)
  → FastAPI POST /api/auth/electron/otc → returns OTC (90-second TTL)
  → Next.js frontend fires: window.location = `fideon://auth?otc=${otc}`

Electron main.cjs:
  → Registers protocol: app.setAsDefaultProtocolClient('fideon')
  → Handles 'open-url' (macOS) / second-instance (Windows/Linux)
  → Extracts OTC from URI
  → POST /api/auth/electron/token { otc }
  → Stores service_token in OS keychain:
      Windows: Windows Credential Manager (OS keychain API)
      macOS:   Keychain (OS keychain API)
  → Loads authenticated app view

Single-instance guard:
  const lock = app.requestSingleInstanceLock()
  if (!lock) { app.quit() }
  // On second-instance: bring existing window to focus
```

**Token handoff — no plaintext token in URI (security requirement):**
- URI carries a 90-second OTC, not the actual service token
- Electron exchanges OTC for service token over HTTPS (not visible in URI)
- OTC is single-use (Valkey delete on first use)

### 5.2 Scheduled Workflows Continue After Web Logout (AC-024)

```
Web logout path:
  UPDATE refresh_tokens SET revoked=true WHERE jti=<web_jti>
  Clear web cookies
  → electron_service_tokens NOT touched

Electron session:
  Reads service_token from OS keychain on workflow execution
  Uses service_token for POST /api/training/* and workflow API calls
  Silent renewal via POST /api/auth/electron/token/refresh when < 48h to expiry

DB verification (post web logout):
  SELECT * FROM workflow_runs WHERE user_id=uid ORDER BY created_at DESC
  → status = 'running' or 'completed' even after web session revoked
  SELECT revoked FROM electron_service_tokens WHERE user_id=uid
  → revoked = false  (web logout did not affect it)
```

---

## 6. Implementation Phases

### Phase 0 — RS256 Key Generation & Backend Services
**Duration: 0.5 day**

- [ ] `openssl genrsa -out backend/keys/private.pem 2048`
- [ ] `openssl rsa -in backend/keys/private.pem -pubout -out backend/keys/public.pem`
- [ ] `backend/keys/` added to `.gitignore` — private key never committed
- [ ] Add to backend `.env` — all timing values are configurable without code changes:
  ```
  JWT_PRIVATE_KEY_PATH=backend/keys/private.pem
  JWT_PUBLIC_KEY_PATH=backend/keys/public.pem
  RESEND_API_KEY=

  # Token / session expiry
  JWT_ACCESS_EXPIRY_MINUTES=15        # access token lifetime
  JWT_REFRESH_EXPIRY_DAYS=7           # refresh token lifetime
  INVITE_EXPIRY_HOURS=48              # invite link lifetime
  OTP_EXPIRY_MINUTES=10               # OTP code validity window
  PASSWORD_RESET_EXPIRY_MINUTES=15    # password reset link lifetime

  # OTP rate limits (values, not just on/off)
  OTP_RESEND_LIMIT=3                  # max resends per OTP session per email
  OTP_RATE_WINDOW_REQUESTS=5          # secondary IP-based resend cap (numerator)
  OTP_RATE_WINDOW_MINUTES=60          # secondary IP-based resend cap (denominator)

  # Intrusion detection
  GEO_ANOMALY_THRESHOLD_MINUTES=60    # impossible-travel window
  ```
- [ ] Implement `backend/services/jwt.py`, `argon2.py`, `email.py`, `geo.py`, `crypto.py`, `ratelimit.py`
- [ ] Set up IP geolocation lookup for `services/geo.py` (country-level resolution sufficient)

> **Secret Management**
> - **Dev:** `.env` file locally; never committed (`.gitignore`). RS256 keys generated per developer and stored in `backend/keys/` (git-ignored).
> - **Staging / Production:** All secrets (`RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, Valkey credentials, RS256 private key) stored in **Azure Key Vault**. The deployment pipeline fetches them at runtime and injects as environment variables — never baked into the container image. The RS256 private key is stored as a Key Vault secret and written to a temp path on container start.
> - **CI/CD:** **GitHub Actions secrets** hold the credentials needed for the pipeline itself (Azure service principal, container registry credentials, deploy keys). Application secrets are never stored in GitHub — the pipeline retrieves them from Azure Key Vault at deploy time.
> - **Frontend:** Only `NEXT_PUBLIC_API_URL` and `JWT_PUBLIC_KEY_PEM` (non-public, edge runtime only) are needed. Frontend never connects to Supabase directly — all data flows through FastAPI. No `NEXT_PUBLIC_SUPABASE_URL`, no `NEXT_PUBLIC_SUPABASE_ANON_KEY`, no private keys or service-role credentials ever reach the Next.js build.
> - **Rotation:** See RS256 key rotation note below.

> **RS256 Key Rotation**
> Rotating the signing key requires a brief overlap window so in-flight tokens remain valid:
> 1. Generate `private_new.pem` / `public_new.pem`.
> 2. Update FastAPI to **sign** new tokens with `private_new.pem` but **accept** both `public.pem` and `public_new.pem` during verification (multi-key validation, e.g. `python-jose` `jwk` key set).
> 3. Wait for `JWT_ACCESS_EXPIRY_MINUTES` (15 min) — all tokens signed with the old key will have expired.
> 4. Remove the old public key from the validation set; promote `private_new.pem` → `private.pem`.
> 5. Update `JWT_PUBLIC_KEY_PEM` in the frontend secret store and redeploy middleware.
> Document this runbook before go-live.

---

### Phase 1 — Database Migrations
**Duration: 1 day · Dependencies: Phase 0**

- [ ] `001_create_users.sql` — `public.users` table + `set_updated_at` trigger + indexes
- [ ] `002_create_otp_codes.sql` — `public.otp_codes` table + index
- [ ] `003_create_invites.sql` — `public.invites` + indexes
- [ ] `004_create_user_roles.sql` — `public.user_roles` (role TEXT + CHECK; no app_role ENUM, no has_role() — see §2.4)
- [ ] `005_create_user_devices.sql` — `public.user_devices`
- [ ] `006_create_refresh_tokens.sql` — `public.refresh_tokens`
- [ ] `007_create_password_reset_tokens.sql` — `public.password_reset_tokens`
- [ ] `008_create_password_history.sql` — `public.password_history` + prune trigger
- [ ] `009_create_audit_logs.sql` — `public.audit_logs` + indexes (INSERT-only REVOKE targets `authenticator` only — NOT enforced against `service_role`; see §2.9 caveat)
- [ ] `010_create_electron_service_tokens.sql` — `public.electron_service_tokens`
- [ ] `011_seed_first_admin.sql` — INSERT first admin user (manual Argon2id hash) + user_role
- [ ] Verify self-hosted Supabase `db push` applies cleanly in QA

---

### Phase 2 — Group A: Invite Flow (AC-001 to AC-005)
**Dependencies: Phase 1**
> AC-006 (out-of-domain email restriction) is **out of scope** for this release.

- [ ] `POST /api/auth/invite` — token gen (`secrets.token_urlsafe`), configurable expiry (`INVITE_EXPIRY_HOURS`), Resend email, audit log
- [ ] `POST /api/auth/invite/validate` — per-IP + per-token rate limit, SHA-256 match, constant-time, generic 403 (token in body, not query string)
- [ ] `POST /api/auth/signup` — atomic `UPDATE ... WHERE status='PENDING' RETURNING` (first-come-first-served; no FOR UPDATE), Argon2id, transaction, generic 403
- [ ] Frontend: `/signup` page — read-only email, password strength indicator
- [ ] Frontend: Admin invite form in `/admin` page

---

### Phase 3 — Groups B & C: Sign-in + OTP (AC-007 to AC-012)
**Dependencies: Phase 2**

- [ ] `POST /api/auth/login` — Argon2id constant-time, lockout logic, OTP dispatch, generic 401
- [ ] `POST /api/auth/otp/verify` — attempt tracking, hash match, JWT issuance, cookie setting
- [ ] `POST /api/auth/otp/resend` — session-scoped rate limit (3/session)
- [ ] `GET /api/auth/me` — returns user profile from JWT sub
- [ ] Frontend: `/auth` login page
- [ ] Frontend: `/auth/otp` OTP entry page
- [ ] Frontend: `AuthContext` rewrite (no Supabase auth calls)
- [ ] Frontend: `middleware.ts` update (RS256 JWT verification via `jose`)

---

### Phase 4 — Groups D & E: JWT Refresh + Logout (AC-013 to AC-016)
**Dependencies: Phase 3**

- [ ] `POST /api/auth/token/refresh` — atomic rotation, replay detection, full revocation on replay
- [ ] `POST /api/auth/logout` — revoke refresh token, clear cookies (access_token + refresh_token)
- [ ] Frontend: silent refresh interceptor in `lib/api.ts` (retry on 401 → call /token/refresh → retry original)

---

### Phase 5 — Group F: Forgot Password (AC-017 to AC-019)
**Dependencies: Phase 3**

- [ ] `POST /api/auth/password/forgot` — generic 200, configurable reset token expiry (`PASSWORD_RESET_EXPIRY_MINUTES`), Resend
- [ ] `POST /api/auth/password/reset` — policy + history check, Argon2id, revoke sessions
- [ ] Frontend: `/reset-password` page
- [ ] Frontend: Forgot Password link on `/auth` page

---

### Phase 6 — Device Fingerprinting & Geo Anomaly (AC-015)
**Dependencies: Phase 3**

- [ ] `device_check()` called after every successful OTP verify
- [ ] New device email alert via Resend
- [ ] Geo anomaly → step-up OTP trigger (re-runs OTP flow for existing session)
- [ ] Frontend: send `x-screen-res` and `x-timezone` headers on login request

---

### Phase 7 — Group G: RBAC (AC-020 to AC-022)
**Dependencies: Phase 3**

- [ ] `require_admin` dependency (role + mfa_verified check)
- [ ] Apply to `/api/admin/*`, `/api/auth/invite`
- [ ] `UNAUTHORIZED_ACCESS` audit log on every 403
- [ ] Frontend: hide admin nav for non-admin users
- [ ] Frontend: admin route guard in `middleware.ts`

---

### Phase 8 — Group H: Electron Auth (AC-023 to AC-024)
**Dependencies: Phase 3, Phase 4**

- [ ] `POST /api/auth/electron/otc` — Valkey OTC (90-second TTL)
- [ ] `POST /api/auth/electron/token` — OTC → service token
- [ ] `POST /api/auth/electron/token/refresh` — Bearer path (silent renewal, 204 if not due) + cookie-auth path (renderer recovery, always issues new token)
- [ ] `electron/main.cjs`: `setAsDefaultProtocolClient('fideon')` + URI handler + OS keychain storage + single-instance lock
- [ ] Confirm web logout does NOT revoke `electron_service_tokens`
- [ ] Confirm workflow execution continues post web logout (query `workflow_runs`)

---

### Phase 9 — Group I: Audit Logging Completeness (AC-025)
**Run as a cross-phase verification pass**

- [ ] Every action in the enum is covered by at least one code path
- [ ] INSERT-only enforcement verified — NOTE: current REVOKE targets `authenticator`, not the `service_role` FastAPI uses, so it is not enforced today (see §2.9 caveat)
- [ ] `details` JSONB field checked across all log writes — no tokens/passwords/OTP codes present
- [ ] `audit_logs_created_at_idx` verified effective for time-range queries


*Last updated: 2026-05-21 — v2.0 Custom Auth Architecture (no Supabase Auth)*
