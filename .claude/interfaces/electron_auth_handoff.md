# Electron Auth Handoff — Auth Module 1 Phase 8 ↔ Electron Phases 2–4

**Owners:** Backend team (Auth Module 1 Phase 8) · Electron team (Phases 2–4)  
**Status:** Active — `fideon://` protocol sub-path agreed (see `ipc_contract.md` §1)  
**Created:** 2026-05-21  
**Related:** `Auth_Module_Plan.md` §3.10 · Electron plan Phases 2–4 · `ipc_contract.md` · `api_contracts.md` §2

---

## Why This Document Exists

The Electron plan (Phase 2.6) was drafted when Supabase Auth was the auth system. In that design, the renderer's JWT was accessible as a JavaScript string and could be passed to the main process via `auth:set-token` IPC. **This no longer applies.**

Under custom FastAPI auth (ADR-001):
- The access_token is an RS256 JWT in an **HttpOnly cookie** — JavaScript cannot read it.
- The renderer **cannot** pass the access_token to the Electron main process via IPC.
- Instead, the Electron main process gets its own **service token** via the OTC exchange, stored in the OS keychain.

This file defines how Auth Module 1 Phase 8 (the backend endpoints) maps to the Electron implementation.

---

## Token Families

```
┌─────────────────────────────────────────────────────────┐
│  Web browser session                                     │
│  access_token  (RS256 JWT · 15min · HttpOnly cookie)     │
│  refresh_token (256-bit · 7d  · HttpOnly cookie)         │
│  Controlled by: FastAPI /api/auth/* endpoints            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Electron main process session                           │
│  service_token (256-bit · 30d · OS keychain)             │
│  Controlled by: FastAPI /api/auth/electron/* endpoints   │
│                                                          │
│  INDEPENDENT: web logout does NOT revoke service_token   │
│  Scheduled workflows continue running after web logout   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Handoff token (single-use, ephemeral)                   │
│  OTC (32-byte random · 90s TTL · Valkey)                 │
│  Used once to bridge the two sessions above              │
└─────────────────────────────────────────────────────────┘
```

---

## §1 — Full Token Handoff Flow

```
1. User opens Fideon in browser (or Electron's embedded renderer)

2. User completes login:
   POST /api/auth/login         → sends OTP email
   POST /api/auth/otp/verify    → issues JWT cookies (access_token, refresh_token)
                                   sets: HttpOnly cookies on browser session
                                   returns: { user: { id, email, role, full_name } }

3. Renderer detects Electron environment (window.electron exists):
   POST /api/auth/electron/otc   ← authenticated by access_token cookie
   → FastAPI: generates OTC = secrets.token_urlsafe(32)
              stores in Valkey: key=sha256(otc), value=user_id, TTL=90s
   → returns { "otc": "<raw_90s_code>" }

4. Renderer fires deep link:
   window.location = `fideon://auth?otc=${otc}`

5. OS routes URI to Electron main process (already registered via setAsDefaultProtocolClient):
   - macOS: app.on('open-url', ...)
   - Windows/Linux: app.on('second-instance', ...) → argv scan

6. Electron main extracts OTC from URI:
   POST /api/auth/electron/token   { otc: "<raw_code>" }
   → FastAPI: hash = sha256(otc)
              user_id = Valkey.get(hash)   ← 401 if expired or not found
              Valkey.delete(hash)           ← single-use; deleted immediately
              INSERT electron_service_tokens (user_id, token_hash=sha256(service_token),
                                              expires_at=now+30d, device_id)
   → returns { "service_token": "<raw_256bit_token>" }

7. Electron main stores service_token in OS keychain:
   const encrypted = safeStorage.encryptString(service_token);
   store.set('serviceToken', encrypted.toString('base64'));
   _serviceToken = service_token;  // in-memory cache for hot path

8. Electron main sends IPC push to renderer:
   mainWindow.webContents.send('auth:service-token-ready', { userEmail })

9. Pod Monitor + Cloud Sync begin polling:
   getRuntimeServiceToken() → returns _serviceToken from memory
   All FastAPI calls use: Authorization: Bearer <service_token>
```

---

## §2 — Service Token Lifecycle

### On successful exchange

```js
// electron/main.cjs

async function exchangeOtcForServiceToken(rawOtc) {
  const res = await fetch(`${FIDEON_API_URL}/api/auth/electron/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otc: rawOtc }),
  });

  if (res.status === 401) {
    // OTC expired or already used — user must log in again
    mainWindow.webContents.send('auth:token-expired');
    return;
  }

  const { service_token } = await res.json();

  // Encrypt and persist
  const encrypted = safeStorage.encryptString(service_token);
  store.set('serviceToken', encrypted.toString('base64'));
  // Calculate expiry client-side — the exchange endpoint returns only the raw token (no expires_at).
  // Service tokens are 30-day TTL; we store the deadline locally for renewal checks.
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  store.set('serviceTokenExpiresAt', expiresAt);
  _serviceToken = service_token;

  // Fetch user email for display
  const me = await fetchWithServiceToken('/api/auth/me');
  mainWindow.webContents.send('auth:service-token-ready', { userEmail: me.email });
}
```

### On cold start (Electron restarts between sessions)

```js
// electron/main.cjs — called on app ready

async function loadServiceTokenFromKeychain() {
  const encrypted = store.get('serviceToken');
  if (!encrypted) return; // not logged in yet

  const raw = Buffer.from(encrypted, 'base64');
  _serviceToken = safeStorage.decryptString(raw);

  // Verify token is still valid
  const res = await fetchWithServiceToken('/api/auth/me');
  if (res.status === 401) {
    // Token revoked or expired — clear and require re-login
    store.delete('serviceToken');
    store.delete('serviceTokenExpiresAt');
    _serviceToken = null;
    mainWindow.webContents.send('auth:token-expired');
    return;
  }

  const me = await res.json();
  mainWindow.webContents.send('auth:service-token-ready', { userEmail: me.email });
}
```

### Silent renewal (within 48h of expiry)

```js
// Called inside podMonitor / cloudSync on each cycle
// (Token expiry is tracked via the expires_at field returned from /api/auth/me or stored locally)

async function maybeRenewServiceToken() {
  const expiresAt = store.get('serviceTokenExpiresAt');
  if (!expiresAt) return;

  const hoursRemaining = (new Date(expiresAt) - Date.now()) / (1000 * 60 * 60);
  if (hoursRemaining > 48) return; // no renewal needed

  const res = await fetchWithServiceToken('/api/auth/electron/token/refresh');
  if (res.status === 204) return; // FastAPI says not yet

  if (res.ok) {
    const { service_token } = await res.json();
    const encrypted = safeStorage.encryptString(service_token);
    store.set('serviceToken', encrypted.toString('base64'));
    // Reset the 30-day expiry window for the newly issued token
    store.set('serviceTokenExpiresAt', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
    _serviceToken = service_token;
  }
  // If 401: handled by the 401 contract in ipc_contract.md §9
}
```

### On web logout (renderer signals main)

```js
// ipcMain.handle('auth:logout', ...) — from ipc_contract.md §2

async function clearServiceToken() {
  store.delete('serviceToken');
  store.delete('serviceTokenExpiresAt');
  _serviceToken = null;
  // podMonitor and cloudSync will call getRuntimeServiceToken() → null → skip silently
}
```

**Note:** Web logout (`POST /api/auth/logout`) on the backend revokes the refresh_token (web session) but does **NOT** touch `public.electron_service_tokens`. The Electron session continues until either:
- `auth:logout` IPC is called from the renderer (above), OR
- The service token's 30-day TTL expires, OR
- The service token is explicitly revoked by an admin via a future admin endpoint.

---

## §3 — Pod Monitor + Cloud Sync — Token Usage

```js
// electron/services/podMonitor.cjs

async function poll(mainWindow, store) {
  const token = await getRuntimeServiceToken(); // from main.cjs
  if (!token) {
    // Not logged in — skip silently
    return;
  }

  let res;
  try {
    res = await fetch(`${FIDEON_API_URL}/api/workflows`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    // Network failure — serve cache, emit isOffline: true
    const cached = store.get('podStatus') ?? { workflows: [], overall: 'unknown' };
    mainWindow.webContents.send('pod:status-update', { ...cached, isOffline: true });
    return;
  }

  if (res.status === 401) {
    // Service token rejected
    _serviceToken = null;           // clear memory cache
    mainWindow.webContents.send('auth:token-expired');
    return;                         // do NOT serve stale cache on auth failure
  }

  if (res.status === 403) {
    console.warn('[podMonitor] 403 — permissions issue, skipping cycle');
    return;                         // do NOT clear token
  }

  const data = await res.json();
  const podStatus = classifyWorkflows(data.workflows);
  store.set('podStatus', podStatus);
  mainWindow.webContents.send('pod:status-update', { ...podStatus, isOffline: false });
}
```

Same pattern applies identically to `cloudSync.cjs` (`/api/agents` + `/api/workflows`).

---

## §4 — Renderer Side — Handling `auth:token-expired`

When the main process emits `auth:token-expired`, the renderer should attempt a silent service token renewal (not a web session refresh — those are different token families):

```ts
// frontend/contexts/AuthContext.tsx — inside useEffect

if (isElectron()) {
  const unsub = window.electron!.auth.onTokenExpired(async () => {
    // The service token expired. The web session may still be valid.
    // Call the Electron refresh endpoint via the web session (cookie auth).
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/electron/token/refresh`, {
      method: 'POST',
      credentials: 'include', // send access_token cookie
    });

    if (res.ok) {
      // FastAPI issued a new service token. The response body lands in the renderer,
      // so the renderer must forward the raw token to the main process for keychain storage.
      // Main process cannot make this call itself (no browser cookie access).
      const { service_token } = await res.json();
      await window.electron!.auth.storeServiceToken(service_token);
      // storeServiceToken IPC: renderer → main (invoke), main calls safeStorage + electron-store
      // This is the ONE case where the renderer passes a service token to main — recovery only.
    } else {
      // Renewal failed — web session also expired → full sign out
      await signOut();
    }
  });
  return unsub;
}
```

> **Implementation note for backend:** `/api/auth/electron/token/refresh` should accept EITHER `Authorization: Bearer <service_token>` OR the `access_token` HttpOnly cookie — whichever is present. When the service token is expired, the renderer can use its still-valid web cookie to get a fresh service token without requiring a full re-login.

---

## §5 — Phase 2.6 Correction for Electron Plan

The Electron plan Phase 2.6 describes `auth:set-token` / `auth:clear-token` IPC that passes the JWT from renderer to main. **This must NOT be implemented** under custom FastAPI auth:

| Phase 2.6 (Electron plan — OLD) | Correct approach (this document) |
|---------------------------------|----------------------------------|
| Renderer reads JWT from `supabase.auth.getSession()` | JWT is in HttpOnly cookie — not readable by JS |
| Renderer sends JWT to main via `auth:set-token` IPC | Main gets service_token via OTC exchange — never from renderer |
| Main uses JWT for Bearer auth | Main uses service_token for Bearer auth |
| JWT in-memory in main process | service_token encrypted in OS keychain via safeStorage |

**What to keep from Phase 2.6:**
- `auth:logout` IPC (renderer → main to clear service_token) ✓
- `auth:token-expired` IPC (main → renderer to trigger refresh) ✓
- `_runtimeToken = null` pattern (memory cache for token) ✓ — rename to `_serviceToken`

**What to remove:**
- `ipcMain.handle('auth:set-token', ...)` — delete
- `ipcMain.handle('auth:clear-token', ...)` — replace with `auth:logout`
- `window.electron.auth.setToken(token)` call in `AuthContext.tsx` — delete
- Reference to `supabase.auth.getSession()` in the auth:set-token flow — irrelevant

---

## §6 — Security Properties

| Property | How enforced |
|----------|-------------|
| OTC is single-use | Valkey.delete(hash) immediately on exchange — second request gets 401 |
| OTC is short-lived | 90-second Valkey TTL — expired OTC returns 401 |
| OTC is opaque to deep-link sniffers | OTC is a raw token; even if intercepted, valid only once in 90s |
| Service token never in plaintext on disk | `safeStorage.encryptString()` → base64 → `electron-store`; decrypted in memory only |
| Service token never accessible to renderer | Stored in main process only; not exposed via contextBridge |
| Web logout does not affect scheduled workflows | `electron_service_tokens` table not touched by web logout path |
| Replay detection | Service token column: UNIQUE + revoked flag; old token revoked atomically on renewal |
| 401 does not serve stale cache | Pod monitor / cloud sync explicitly skip cache path on 401 |

---

## §7 — Backend Checklist (Phase 8, Auth Module 1)

- [ ] `POST /api/auth/electron/otc` implemented and protected by `get_current_user`
- [ ] OTC stored in Valkey with `sha256(raw_otc)` as key, 90-second TTL
- [ ] `POST /api/auth/electron/token` — Valkey lookup, single-delete, INSERT `electron_service_tokens`
- [ ] `POST /api/auth/electron/token/refresh` — accepts Bearer service_token OR access_token cookie
- [ ] `POST /api/auth/logout` — confirmed it does NOT touch `electron_service_tokens`
- [ ] `public.electron_service_tokens` migration applied (migration `010_create_electron_service_tokens.sql`)
- [ ] `auth:set-token` endpoint NOT implemented (this is the old Supabase-based design)

## §8 — Electron Checklist (Phases 2–4)

- [ ] `app.setAsDefaultProtocolClient('fideon')` registered before window opens
- [ ] Single-instance lock `app.requestSingleInstanceLock()` — app.quit() if lock fails
- [ ] `handleFideonUri()` handles `fideon://auth?otc=<value>` → calls `exchangeOtcForServiceToken()`
- [ ] `safeStorage.encryptString()` used for service_token — never stored in plaintext
- [ ] `getRuntimeServiceToken()` reads from memory cache, falls back to keychain decrypt
- [ ] Pod monitor + cloud sync call `getRuntimeServiceToken()`, skip cycle if null
- [ ] 401 contract from `ipc_contract.md §9` implemented in both services
- [ ] `auth:logout` IPC clears `_serviceToken` from memory AND keychain AND `serviceTokenExpiresAt`
- [ ] `auth:store-service-token` IPC implemented (recovery path — renderer → main after cookie-refresh)
- [ ] `auth:set-token` IPC from Electron plan Phase 2.6 NOT implemented (old design)
- [ ] `window.electron.auth.setToken()` NOT exposed in `preload.cjs` (old design)
- [ ] `AuthContext.tsx` does NOT call `window.electron.auth.setToken()` (old design)

---

*This is a living contract. Backend and Electron changes to the auth handoff require sign-off from both team leads and an update to this document.*
