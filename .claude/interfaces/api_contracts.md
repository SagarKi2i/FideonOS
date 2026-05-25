# API Contracts — FastAPI Endpoint Schemas

**Owners:** Backend team  
**Consumers:** Frontend (Next.js) · Electron (main process services)  
**Status:** Active  
**Created:** 2026-05-21  
**Related:** `Auth_Module_Plan.md` · `backend/docs/pod_structure.md` · `api_overview.md` · `electron_auth_handoff.md`

---

## Auth Mechanism — Frontend vs Electron

| Consumer | Token type | Transport | How obtained |
|----------|-----------|-----------|-------------|
| **Frontend (Next.js)** | RS256 JWT access_token | HttpOnly cookie (`access_token`) | Issued by `/api/auth/otp/verify` |
| **Frontend refresh** | Refresh token (256-bit random) | HttpOnly cookie (`refresh_token`, Path=/api/auth/token/refresh) | Issued alongside access_token |
| **Electron main process** | Service token (256-bit random) | `Authorization: Bearer <service_token>` header | Obtained via OTC exchange — see §2 |
| **Electron web renderer** | Same RS256 JWT as frontend | HttpOnly cookie (set when user logs in via embedded browser) | Same as frontend — OTP verify flow |

**Critical:** Electron's pod monitor and cloud sync services use the **service token** (Bearer header), not the JWT cookie. The JWT lives in an HttpOnly cookie and cannot be accessed by JS or the main process.

---

## §1 — Auth Endpoints (Frontend)

Base URL: `http://localhost:8000` (dev) / `https://api.fideon.com` (prod)  
All responses: `Content-Type: application/json`  
Error shape: `{ "detail": "message" }`

---

### `POST /api/auth/invite` — Send invite

**Auth required:** `require_admin` (role=admin + mfa_verified=true in JWT)

**Request:**
```json
{ "email": "user@example.com" }
```

**Responses:**
```
201 { "message": "Invite sent." }
403 not admin / MFA not completed
409 duplicate PENDING invite for this email
429 rate limited
```

---

### `POST /api/auth/invite/validate` — Validate invite token

**Auth required:** none (public)  
**Rate limited:** 5/hr per IP · 5/hr per token hash

**Request:** *(token in body — NOT query string)*
```json
{ "token": "<raw_invite_token>" }
```

**Responses:**
```
200 { "email": "user@example.com" }
403 "This invite link is invalid or has expired."  ← identical for all failure modes
429 rate limited
```

---

### `POST /api/auth/signup` — Create account

**Auth required:** none (public)  
**Rate limited:** 5/hr per IP · 5/hr per token hash · 3/hr per email

**Request:**
```json
{ "token": "<raw_invite_token>", "password": "..." }
```

**Responses:**
```
201 { "message": "Account created. Please log in." }
403 token invalid / expired / already used
422 password policy violation: { "detail": [{ "field": "password", "msg": "..." }] }
429 rate limited
```

---

### `POST /api/auth/login` — Initiate sign-in

**Auth required:** none (public)  
**Rate limited:** 10/min per IP · 5/hr per IP · 5/hr per email

**Request:**
```json
{ "email": "user@example.com", "password": "..." }
```

**Responses:**
```
200 { "message": "A verification code has been sent to your email." }
401 "Invalid email or password."          ← identical for wrong password AND unknown email
403 "Account is locked. Try again later."
429 rate limited
```

---

### `POST /api/auth/otp/verify` — Complete sign-in (issues JWT)

**Auth required:** none (public)

**Request:**
```json
{ "email": "user@example.com", "otp": "123456" }
```

**Response (success):**
```
200 {
  "message": "Login successful.",
  "user": { "id": "uuid", "email": "...", "role": "user|admin", "full_name": "..." }
}

Set-Cookie: access_token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=900
Set-Cookie: refresh_token=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/token/refresh; Max-Age=604800
```

**Error responses:**
```
401 "Code expired. Please log in again."
401 "Too many attempts. Please log in again."
401 "Invalid code."
```

---

### `POST /api/auth/otp/resend` — Resend OTP

**Auth required:** none (public)

**Request:**
```json
{ "email": "user@example.com" }
```

**Responses:**
```
200 { "message": "A new code has been sent." }
400 no active OTP session (user must restart login)
429 resend limit reached (3 per OTP session)
```

---

### `POST /api/auth/token/refresh` — Silent refresh

**Auth required:** refresh_token cookie (HttpOnly)  
**Called by:** Next.js `lib/api.ts` interceptor on 401 from any protected endpoint

**Request:** no body (reads refresh_token cookie automatically)

**Responses:**
```
200  (silently sets new access_token + refresh_token cookies)
401 "Session expired. Please log in."
401 "Session invalidated for security. Please log in again."  ← replay attack detected
```

---

### `POST /api/auth/logout` — Sign out

**Auth required:** `get_current_user` (valid access_token cookie)

**Request:** no body

**Response:**
```
200 { "message": "Logged out." }

Set-Cookie: access_token=; Max-Age=0
Set-Cookie: refresh_token=; Max-Age=0
```

---

### `GET /api/auth/me` — Current user profile

**Auth required:** `get_current_user`

**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "Jane Smith",
  "role": "user",
  "mfa_verified": true,
  "status": "active"
}
```

Used by: Next.js `AuthContext` on mount · `middleware.ts` session validation

---

### `POST /api/auth/password/forgot` — Request reset

**Auth required:** none (public)  
**Rate limited:** 3/hr per IP · 3/hr per email

**Request:**
```json
{ "email": "user@example.com" }
```

**Response:**
```
200 { "message": "If an account exists for this email, a reset link has been sent." }
← Always 200. Never reveals whether email is registered.
429 rate limited
```

---

### `POST /api/auth/password/reset` — Set new password

**Auth required:** none (public — token in body)

**Request:**
```json
{ "token": "<raw_reset_token>", "new_password": "..." }
```

**Responses:**
```
200 { "message": "Password updated. Please log in." }
403 "This reset link is invalid or has expired."
422 password policy violation / reuse of recent password
```

---

## §2 — Auth Endpoints (Electron only)

These endpoints are called by the **Electron main process** using the service token flow. They are NOT called by the Next.js frontend. Full flow documented in `electron_auth_handoff.md`.

---

### `POST /api/auth/electron/otc` — Issue one-time code

**Auth required:** `get_current_user` (called immediately after OTP verify, while JWT cookie is active in the embedded browser session)  
**Called by:** Next.js renderer via fetch (cookie auth), immediately after `/api/auth/otp/verify` succeeds

**Request:** no body

**Response:**
```json
{ "otc": "<raw_90s_one_time_code>" }
```

The raw OTC is passed to Electron main process via `fideon://auth?otc=<value>`. It is NOT stored anywhere — single-use, 90-second TTL in Valkey.

---

### `POST /api/auth/electron/token` — Exchange OTC for service token

**Auth required:** none (OTC is the credential)  
**Called by:** Electron main process (after extracting OTC from `fideon://` URI)

**Request:**
```json
{ "otc": "<raw_one_time_code>" }
```

**Response:**
```json
{ "service_token": "<raw_256bit_token>" }
```

Electron main process: encrypt with `safeStorage` → store in `electron-store` → clear OTC from memory.

**Errors:**
```
401 OTC not found or expired (Valkey TTL exceeded or already used)
```

---

### `POST /api/auth/electron/token/refresh` — Silent service token renewal

**Auth required (two accepted forms):**
- `Authorization: Bearer <raw_service_token>` — Electron main process (normal renewal path)
- `Cookie: access_token=<jwt>` — Renderer (fallback: service token already expired; web session still valid)

**Called by:**
- Electron main process (periodic check, within 48 hours of expiry) — uses Bearer
- Next.js renderer via `fetch(..., { credentials: 'include' })` after receiving `auth:token-expired` IPC — uses cookie

> Both paths are now fully documented in **Auth_Module_Plan.md §3.10** — Bearer (normal renewal) and cookie-auth (renderer recovery). `get_current_user` extension required to check Bearer first, then fall back to `access_token` cookie.

**Request:** no body

**Responses:**
```
200 { "service_token": "<new_raw_token>" }   ← old token revoked atomically
204                                           ← token still valid, no renewal needed (Bearer path only)
401 token not found or revoked / web session invalid
```

---

## §3 — Agent & Workflow Endpoints (Frontend + Electron)

These endpoints are consumed by both the Next.js frontend (JWT cookie) and the Electron main process (Bearer service token). FastAPI accepts both auth mechanisms on these routes.

> **Not exhaustive.** This section documents the key contracts. Full endpoint index → `api_overview.md` §4 (Agents) and §5 (Runs).

---

### `GET /api/workflows` — List user's workflows

**Auth required:** `get_current_user` (cookie or Bearer)

**Response:**
```json
{
  "workflows": [
    {
      "id": "uuid",
      "name": "Loss Run Automation",
      "status": "active",
      "last_run_at": "2026-05-19T14:08:00Z",
      "current_step_index": null
    }
  ]
}
```

**Used by:** Electron `cloudSync` service (60s poll) · Frontend Workflows page

---

### `POST /api/agents` — Activate agent

**Auth required:** `get_current_user`

**Request:**
```json
{ "agent_id": "uuid", "model_name": "Loss Run Reporting", "domain": "insurance" }
```

**Response:**
```json
{ "message": "Agent activated.", "user_agent_id": "uuid" }
```

---

### `GET /api/agents/{agent_keyword}` — Agent detail + version check

**Auth required:** `get_current_user`

**Response:** Agent detail including version check (Q8 from `pod_structure.md`) — whether user is on latest version.

---

### `DELETE /api/agents/{agent_keyword}` — Deactivate agent

**Auth required:** `get_current_user`

**Response:**
```
200 { "message": "Agent deactivated." }
```

---

### `GET /api/agents` — List user's activated agents

**Auth required:** `get_current_user` (cookie or Bearer)

**Response:**
```json
{
  "agents": [
    {
      "id": "uuid",
      "agent_id": "uuid",
      "agent_keyword": "loss-run-reporting",
      "model_name": "Loss Run Reporting",
      "domain": "insurance",
      "is_active": true,
      "activated_at": "2026-02-01T00:00:00Z"
    }
  ]
}
```

**Used by:** Electron `cloudSync` service · Frontend My Agents page  
**Note:** `agent_keyword` is returned alongside `agent_id` so the frontend can construct API paths directly (e.g. `/api/agents/loss-run-reporting/dashboard`).  
**Field key:** `id` = `user_agents.id` (the user's activation record) · `agent_id` = `agents.id` (the catalog agent UUID)

---

### `GET /api/agents/{agent_keyword}/dashboard` — Agent dashboard data (page load)

**Auth required:** `get_current_user`  
**Path param:** `agent_keyword` — kebab-case keyword from `agents.keyword`, e.g. `policy-comparison`  
**User identity:** from JWT cookie — same keyword, different JWT = different user's data

**Response:** Joins `user_agents`, `user_agent_stats`, `agents`, `agent_dashboard_templates` — full payload for one agent dashboard render (Q1 query from `pod_structure.md`).

---

### `GET /api/agents/{agent_keyword}/stats` — KPI tile refresh (O(1))

**Auth required:** `get_current_user`

**Response:** `{ stats: {...}, updated_at: "...", widgets: [...], comparison_period_days: 30 }` (Q2 query)

---

### `GET /api/agents/{agent_keyword}/runs` — Activity tab (paginated)

**Auth required:** `get_current_user`  
**Query params:** `offset=0&limit=20`

**Response:** Array of `{ run_id, activity, metrics, status, started_at, finished_at, confidence, version }` (Q3 query)

---

### `POST /api/agents/{agent_keyword}/runs` — Trigger agent run

**Auth required:** `get_current_user`

**Request:** JSON matching `agent_versions.input_schema` for the agent.

**Response:**
```json
{ "run_id": "uuid", "status": "running", "started_at": "..." }
```

---

### `GET /api/runs/{run_id}` — Single run detail

**Auth required:** `get_current_user`  
**Note:** `run_id` is a UUID. User scope enforced by JWT — never from the URL.

**Response:** Full run detail including input, output, metrics, activity, input_schema, output_schema (Q6 query)

---

### `GET /api/runs/{run_id}/status` — Poll run status

**Auth required:** `get_current_user`

**Response:**
```json
{ "run_id": "uuid", "status": "running|complete|failed", "finished_at": "..." }
```

---

### `POST /api/runs/{run_id}/approve` — Submit HITL approval

**Auth required:** `get_current_user`

**Request:**
```json
{ "decision": "approved|rejected|escalated", "notes": "..." }
```

**Response:** `200 { "message": "Decision recorded." }`

---

### Agent Access Requests (marketplace agents)

> `agent_id` is a UUID in the **request body** — the user is requesting access to an agent they don't yet have activated, so there's no `{agent_keyword}` path param.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/agent-requests` | JWT | List user's marketplace agent access requests |
| `POST` | `/api/agent-requests` | JWT | Submit access request |

**POST body:**
```json
{ "agent_id": "uuid", "model_name": "Policy Comparison Engine" }
```

---

### Custom Agent Build Requests

> For users requesting Fideon build a brand-new custom agent. Separate from marketplace agent access.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/custom-agent-requests` | JWT | List user's custom agent build requests |
| `POST` | `/api/custom-agent-requests` | JWT | Submit a custom agent build request |

**POST body:**
```json
{
  "title": "Loss Run Auto-Filer for Surplus Lines",
  "sop_text": "...",
  "target_carriers": ["Lloyd's", "Markel"],
  "priority": "normal",
  "expected_outcome": "...",
  "desired_by": "2026-09-01"
}
```

---

## §4 — Admin Endpoints (Frontend only)

**Auth required:** `require_admin` (role=admin + mfa_verified=true in JWT)

> **Not exhaustive.** Full admin endpoint index → `api_overview.md` §2.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/admin/stats` | Dashboard KPIs — total users, runs, requests, devices |
| `GET` | `/api/admin/invites` | List all invites |
| `POST` | `/api/auth/invite` | Send invite |
| `GET` | `/api/admin/users` | List all users |
| `GET` | `/api/admin/users/{id}` | Single user detail |
| `PATCH` | `/api/admin/users/{id}` | Update user — role, status (active/suspended) |
| `GET` | `/api/admin/agent-requests` | List all marketplace agent access requests |
| `PATCH` | `/api/admin/agent-requests/{id}` | Approve or reject — body: `{ status, rejection_reason? }` |
| `GET` | `/api/admin/custom-agent-requests` | List all custom agent build requests |
| `PATCH` | `/api/admin/custom-agent-requests/{id}` | Update build pipeline status |
| `GET` | `/api/admin/devices` | List all devices |
| `GET` | `/api/admin/devices/pending` | Devices awaiting approval |
| `GET` | `/api/admin/devices/{id}` | Single device detail |
| `GET` | `/api/admin/devices/{id}/models` | Models allocated to a device |
| `PATCH` | `/api/admin/devices/{id}` | Update device status |
| `POST` | `/api/admin/devices/{id}/models` | Allocate model to device |

---

## §5 — Response Error Shape

All FastAPI error responses follow:

```json
{ "detail": "Human-readable message" }
```

Validation errors (422):
```json
{
  "detail": [
    { "loc": ["body", "field_name"], "msg": "error description", "type": "value_error" }
  ]
}
```

---

## §6 — Token Transport Summary

| Endpoint group | Frontend (renderer) sends | Electron main sends |
|----------------|--------------------------|-------------------|
| Auth (login, otp, signup) | No token | No token (public) |
| Protected app routes | `Cookie: access_token=<jwt>` | — |
| `/api/auth/electron/otc` | `Cookie: access_token=<jwt>` | — (not called by main) |
| `/api/auth/electron/token` | — | OTC in request body |
| `/api/auth/electron/token/refresh` | `Cookie: access_token=<jwt>` (fallback path) | `Authorization: Bearer <service_token>` |
| Agent / workflow routes | `Cookie: access_token=<jwt>` | `Authorization: Bearer <service_token>` |
| Admin routes | `Cookie: access_token=<jwt>` | Not applicable |

FastAPI `get_current_user` dependency checks cookie first, then falls back to `Authorization: Bearer` header — both are supported on non-admin routes.

---

## §7 — Rate Limit Headers

All rate-limited endpoints return on 429:
```
Retry-After: <seconds>
X-RateLimit-Limit: <limit>
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <unix_timestamp>
```

Frontend `lib/api.ts` interceptor should surface 429 as "Too many requests — please wait X seconds" in the UI.

---

*Changes to request/response shapes require a backend PR + update to this file. Breaking changes require a version bump or a new endpoint path.*
