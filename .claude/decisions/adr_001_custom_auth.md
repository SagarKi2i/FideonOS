# ADR-001: Custom FastAPI Auth — No Supabase Auth SDK

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** Backend Lead, Frontend Lead, Security Lead  
**Supersedes:** n/a  
**Superseded by:** n/a

---

## Context

Fideon OS requires multi-factor authentication (email OTP), invite-only onboarding, device fingerprinting, geo-anomaly detection, and independent Electron session tokens that survive web logout. These are non-negotiable product requirements driven by the regulated insurance-industry customer base.

The initial prototype used Supabase Auth (GoTrue) via `@supabase/ssr` for session management. During architecture review, Supabase Auth was evaluated against the full AC list and found to have the following blockers:

1. **No invite-only flow.** Supabase Auth supports magic link and OAuth but not a token-hash-based invite gate where only pre-approved emails may register.
2. **No independent Electron token family.** Supabase JWTs are session-bound; there is no first-class mechanism for a long-lived service token (30-day TTL) that is unaffected by web session logout, which is required for scheduled background workflows in Electron.
3. **MFA limitations.** Supabase Auth MFA requires the managed cloud offering's TOTP flow. Email OTP with custom lockout logic and resend-count tracking is not natively supported.
4. **Argon2id requirement.** The security specification mandates Argon2id for password hashing. Supabase Auth uses bcrypt internally and does not expose the hashing algorithm.
5. **Geo-anomaly & impossible-travel detection.** Requires per-login IP geolocation and cross-session country comparison. This is not a Supabase Auth primitive; it would require custom trigger logic that would be difficult to test and impossible to unit-test in isolation.
6. **Rate limiting granularity.** The spec requires three independent rate-limit axes per endpoint (per-IP, per-email-hash, per-token-hash) backed by Valkey. Supabase Auth's built-in rate limiting is coarse and not configurable to this level.
7. **RS256 JWT requirement.** Other services (Electron, FastAPI middleware) need to verify JWTs without a round-trip to Supabase. This requires asymmetric signing (RS256) with a known public key. Supabase Auth issues HS256 JWTs signed with a shared secret, which requires every verifier to hold the secret.

Supabase Auth was not rejected due to capability gaps in a general sense — it is a well-designed product. The rejection is specific to this project's requirements.

---

## Decision

**FastAPI owns the entire authentication layer.** Supabase is used as a PostgreSQL database only (see ADR-002).

Specifics:

- **JWT algorithm:** RS256. Private key (`backend/keys/private.pem`) held by FastAPI only. Public key (`backend/keys/public.pem`) shared with Next.js middleware for edge verification without network round-trips.
- **Password hashing:** Argon2id via `argon2-cffi`. Constant-time verification via `hmac.compare_digest`.
- **Token storage:** All tokens stored as SHA-256 hashes in the DB. Raw tokens only ever exist in HttpOnly cookies or email links. Never logged, never returned in responses beyond their initial issuance.
- **Session model:** Access token (15 min, RS256 JWT, HttpOnly cookie) + refresh token (7 days, random 256-bit, HttpOnly cookie). Atomic rotation on refresh — replay detected by checking revoked flag; triggers full session revocation + security email on replay.
- **OTP:** 6-digit code, SHA-256 stored, 10-minute window, max 3 attempts, max 3 resends per session. Row in `public.otp_codes` deleted on success/expiry/max-attempts.
- **Invite gate:** `public.invites` table. Admin creates invite → `secrets.token_urlsafe(32)` → SHA-256 stored → raw token in email link only. Signup uses atomic `UPDATE ... WHERE status='PENDING' RETURNING` (no `FOR UPDATE`) — first concurrent request wins, second gets 0 rows → 403, no deadlock.
- **Electron auth:** One-time code (90-second TTL in Valkey) exchanged for a service token stored in OS keychain. Service tokens are a separate family — web logout does not revoke them. Scheduled workflows continue post web-logout.
- **Rate limiting:** Valkey-backed. Three key types per endpoint: `ip:{ip}`, `email:{sha256(email)}`, `token:{sha256(token)}`. Email and token keys SHA-256-hashed before use as Valkey keys to avoid storing PII.
- **No `auth.*` tables.** All 10 auth tables are `public.*`. This avoids hidden coupling to Supabase's internal schema and makes the auth system portable.

---

## Consequences

### Positive

- Full control over the auth lifecycle — any AC can be implemented without hitting a third-party capability ceiling.
- RS256 JWTs allow cryptographic verification at the Next.js edge (middleware) without a Supabase network call on every request.
- Independent Electron token family is a clean architectural boundary — no special-casing needed in the web logout path.
- All auth logic is in FastAPI (Python) — unit-testable, reviewable, auditable.
- No vendor lock-in for auth; migrating DB host (e.g. Supabase → RDS) does not require auth changes.

### Negative / Trade-offs

- **Maintenance burden:** Supabase Auth is a battle-hardened product. Owning auth means owning security patches, edge-case bugs, and the upgrade path for dependencies (`argon2-cffi`, `python-jose`).
- **Initial implementation cost:** ~9 phases of work vs. a few lines of Supabase config. Estimated 3–4 sprints for full implementation.
- **No Supabase Auth dashboard:** Admin cannot use the Supabase dashboard to manage users, reset passwords, or review sessions. All ops go through FastAPI endpoints or direct DB queries.
- **Key rotation complexity:** RS256 key rotation requires a coordinated overlap window (see Phase 0 runbook in `Auth_Module_Plan.md`).
- **Frontend change:** `@supabase/ssr` auth calls must be removed from `lib/supabaseClient.ts` and replaced with `authApi` calls in `lib/api.ts`. `middleware.ts` must be rewritten to use `jose` for RS256 verification.

### Neutral

- `lib/supabaseClient.ts` remains for non-auth Supabase SDK usage (direct PostgREST queries, realtime, storage). Only auth functions are removed.
- Supabase RLS still applies to all tables — FastAPI uses the service-role key, so RLS is enforced in Python before the DB call, but the DB-level policies remain as a defence-in-depth layer.

---

## Alternatives Considered

| Alternative | Reason rejected |
|-------------|----------------|
| Supabase Auth (GoTrue) | Blockers 1–7 listed in Context. Not a general rejection — product-specific. |
| Auth0 / Okta | SaaS vendor dependency; pricing at scale; same blockers 2 (Electron) and 5 (geo-anomaly) |
| Keycloak (self-hosted) | Operational overhead of a separate Keycloak cluster; Java stack inconsistent with FastAPI/Python; invite flow still custom |
| Clerk | No Electron service token family; no Argon2id; managed SaaS |

---

## References

- `backend/docs/Auth_Module_Plan.md` — full implementation spec (approved v2.0)
- `.claude/decisions/adr_002_supabase_selfhosted.md` — companion decision on DB hosting
- `.claude/interfaces/electron_auth_handoff.md` — Electron OTC/service-token IPC contract

---

*ADRs are append-only. Do not edit this record. Add a new ADR to supersede.*
