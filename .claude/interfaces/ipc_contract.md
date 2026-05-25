# IPC Contract — Electron ↔ Next.js Renderer

**Owners:** Backend team · Electron team  
**Status:** Active — `fideon://` protocol routing resolved (see §1)  
**Created:** 2026-05-21  
**Related:** `electron_auth_handoff.md` · `Auth_Module_Plan.md` Phase 8 · Electron plan Phase 2.6 / 3 / 4

> **Arch note:** The Electron plan (Phase 2.6) was drafted when Supabase Auth was the auth system.
> Under ADR-001 (custom FastAPI auth), the renderer's access_token lives in an **HttpOnly cookie**
> and is not accessible to JavaScript. The `auth:set-token` IPC channel described in Phase 2.6
> **does not apply** to the service token — see §2 for the correct token flow.
> Phase 2.6 has been corrected in `electron/docs/plan.md` to match this contract.

---

## §1 — `fideon://` Custom Protocol

### Agreed routing

The `fideon://` URI scheme is **shared** between the auth team and the Electron team. Sub-paths partition ownership to avoid conflicts:

| Sub-path prefix | Owner | Purpose |
|----------------|-------|---------|
| `fideon://auth?otc=<raw_otc>` | Auth team / Electron team (joint) | OTC handoff — web login → Electron service token exchange |
| `fideon://auth/reset-password` | Auth team | Deep-link into password reset flow |
| `fideon://email://auth` | **NOT USED** — rejected | Microsoft OAuth redirect (use localhost instead — see §5) |

### Resolution (2026-05-21)

**Decision:** The OTC auth handoff uses `fideon://auth?otc=<value>`. Microsoft OAuth redirect does **not** use `fideon://` — it uses `http://localhost:49152/callback` to avoid protocol conflicts and Gatekeeper issues. This unblocks Electron Phase 5A.1.

**Electron main.cjs registration:**
```js
// Register ONCE on app ready — before any window opens
app.setAsDefaultProtocolClient('fideon');

// macOS: 'open-url' event on the app (single instance)
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleFideonUri(url);
});

// Windows / Linux: second-instance argv
app.on('second-instance', (_event, argv) => {
  const url = argv.find(a => a.startsWith('fideon://'));
  if (url) handleFideonUri(url);
  mainWindow?.show();
  mainWindow?.focus();
});

function handleFideonUri(url) {
  const parsed = new URL(url);
  // For custom protocol URLs (fideon://auth?otc=x), Node's URL parser puts 'auth' in host
  // and pathname is '/' — never check pathname === '//auth'
  if (parsed.host === 'auth') {
    const otc = parsed.searchParams.get('otc');
    if (otc) exchangeOtcForServiceToken(otc); // defined in electron_auth_handoff.md §2
  }
}
```

**Single-instance guard (required — without this Windows deep-links break):**
```js
const lock = app.requestSingleInstanceLock();
if (!lock) { app.quit(); return; }
```

---

## §2 — Auth IPC Channels

### Architecture summary

Under custom FastAPI auth (ADR-001):
- **Renderer** holds the RS256 access_token in an **HttpOnly cookie** — NOT accessible to JS.
- **Electron main process** holds the **service_token** in OS keychain (`safeStorage` + `electron-store` encrypted).
- The service_token is obtained via the OTC exchange flow (see `electron_auth_handoff.md`).
- Pod Monitor and Cloud Sync use the **service_token**, NOT the access_token.
- The renderer CANNOT pass the access_token to main via IPC (HttpOnly = no JS access).

### IPC channels

---

#### `auth:service-token-ready`

**Direction:** main → renderer (push)  
**Trigger:** OTC exchange completed successfully — service token written to keychain.  
**Payload:** `{ userEmail: string }`  
**Renderer action:** Update `AuthContext` to mark Electron session as active; hide "connecting…" spinner.

```js
// main.cjs (send after keychain write succeeds)
mainWindow.webContents.send('auth:service-token-ready', { userEmail });

// preload.cjs
auth: {
  onServiceTokenReady: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('auth:service-token-ready', handler);
    return () => ipcRenderer.removeListener('auth:service-token-ready', handler);
  },
}
```

---

#### `auth:token-expired`

**Direction:** main → renderer (push)  
**Trigger:** FastAPI returned HTTP 401 to a service_token request (podMonitor or cloudSync).  
**Payload:** none  
**Renderer action:** Force session refresh — call `POST /api/auth/electron/token/refresh` to get a new service token, then store it. If refresh also fails → sign out.

```js
// main.cjs (inside podMonitor / cloudSync on 401)
mainWindow.webContents.send('auth:token-expired');

// preload.cjs
auth: {
  onTokenExpired: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('auth:token-expired', handler);
    return () => ipcRenderer.removeListener('auth:token-expired', handler);
  },
}

// AuthContext.tsx — useEffect
if (isElectron()) {
  const unsub = window.electron!.auth.onTokenExpired(async () => {
    // The service token expired. Use the still-valid web session cookie to get a new one.
    // This fetch uses the HttpOnly access_token cookie (credentials: 'include').
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/electron/token/refresh`, {
      method: 'POST',
      credentials: 'include', // sends access_token cookie
    });
    if (res.ok) {
      const { service_token } = await res.json();
      // Renderer received the token — forward to main process for keychain storage.
      // This is the only case a service token crosses the IPC boundary renderer → main.
      await window.electron!.auth.storeServiceToken(service_token);
    } else {
      await signOut();
    }
  });
  return unsub;
}
```

---

#### `auth:logout`

**Direction:** renderer → main (invoke)  
**Trigger:** User signs out from the web UI.  
**Main action:** Clear service_token from OS keychain. Stop pod monitor + cloud sync polling. Do NOT call `/api/auth/electron/token/refresh`.

```js
// main.cjs
ipcMain.handle('auth:logout', async () => {
  await clearServiceToken(); // defined in electron_auth_handoff.md §2 — clears keychain + serviceTokenExpiresAt + _serviceToken
});

// preload.cjs
auth: {
  logout: () => ipcRenderer.invoke('auth:logout'),
}

// AuthContext.tsx — inside signOut()
if (isElectron()) {
  await window.electron!.auth.logout();
}
```

---

#### `auth:store-service-token`

**Direction:** renderer → main (invoke)  
**Trigger:** Renderer received a new service token from `POST /api/auth/electron/token/refresh` (cookie-auth path — service token expired, web session still valid).  
**Payload:** `{ serviceToken: string }` — raw 256-bit token  
**Main action:** Encrypt with `safeStorage`, write to `electron-store`, reset `serviceTokenExpiresAt`, update `_serviceToken` memory cache.

> This is the **only** case where a service token value crosses the IPC boundary renderer → main. It is limited to the recovery path; normal token issuance always goes through the OTC exchange (deep-link → main process directly).

```js
// main.cjs
ipcMain.handle('auth:store-service-token', async (_e, { serviceToken }) => {
  const encrypted = safeStorage.encryptString(serviceToken);
  store.set('serviceToken', encrypted.toString('base64'));
  store.set('serviceTokenExpiresAt', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
  _serviceToken = serviceToken;
});

// preload.cjs
auth: {
  storeServiceToken: (serviceToken) => ipcRenderer.invoke('auth:store-service-token', { serviceToken }),
}
```

---

#### `auth:get-service-token` *(main-process internal only)*

**Not exposed to renderer.** Main process reads service_token from keychain internally.  
Pod Monitor and Cloud Sync call `getRuntimeServiceToken()` — a module-scoped function in `main.cjs`:

```js
// main.cjs
let _serviceToken = null; // in-memory cache; source of truth is keychain

async function getRuntimeServiceToken() {
  if (_serviceToken) return _serviceToken;
  // Read from keychain on cold start / after restart
  const encrypted = store.get('serviceToken');
  if (!encrypted) return null;
  const raw = Buffer.from(encrypted, 'base64');
  _serviceToken = safeStorage.decryptString(raw);
  return _serviceToken;
}
```

---

## §3 — Pod Monitor IPC Channels

#### `pod:get-status` (invoke)

**Direction:** renderer → main (request/response)  
**Returns:** `PodStatus` (current cached state from `electron-store`)

```ts
interface PodStatus {
  workflows: Array<{
    id: string;
    name: string;
    status: 'Running' | 'Stopped' | 'Failed' | 'Unknown';
    lastChecked: string; // ISO timestamp
  }>;
  overall: 'healthy' | 'degraded' | 'failed' | 'unknown';
  lastChecked: string;
  isOffline: boolean;
}
```

#### `pod:status-update` (push)

**Direction:** main → renderer  
**Trigger:** Each poll cycle completes (success or failure).  
**Payload:** `PodStatus`

```js
// preload.cjs — correct pattern (returns unsubscribe)
pod: {
  getStatus: () => ipcRenderer.invoke('pod:get-status'),
  onStatusUpdate: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('pod:status-update', handler);
    return () => ipcRenderer.removeListener('pod:status-update', handler);
  },
}
```

---

## §4 — Cloud Sync IPC Channels

#### `cloudsync:get-workflows` (invoke)

**Direction:** renderer → main  
**Returns:** `SyncData` (cached from `electron-store`)

```ts
interface SyncData {
  workflows: Array<{ id: string; name: string; status: string; lastRunAt: string }>;
  activatedAgents: Array<{ id: string; name: string; domain: string }>;
  syncedAt: string;
  isOffline: boolean;
}
```

#### `cloudsync:trigger-now` (invoke)

**Direction:** renderer → main  
**Effect:** Fires immediate sync cycle regardless of timer.

#### `cloudsync:synced` (push)

**Direction:** main → renderer  
**Trigger:** Each sync cycle completes.  
**Payload:** `SyncData`

```js
// preload.cjs
cloudSync: {
  getWorkflows:  () => ipcRenderer.invoke('cloudsync:get-workflows'),
  triggerNow:    () => ipcRenderer.invoke('cloudsync:trigger-now'),
  onSynced: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('cloudsync:synced', handler);
    return () => ipcRenderer.removeListener('cloudsync:synced', handler);
  },
}
```

---

## §5 — Email (Microsoft Graph) IPC Channels

Microsoft OAuth redirect URI: **`http://localhost:49152/callback`** (not `fideon://` — see §1).

#### `outlook:auth` (invoke)

**Direction:** renderer → main  
**Effect:** Opens browser for PKCE OAuth2 flow. Spawns a temporary HTTP server on port 49152 to capture the redirect. Stores encrypted tokens in `electron-store` via `safeStorage`.

#### `outlook:get-auth-status` (invoke)

**Returns:** `{ authenticated: boolean; userEmail: string | null }`

#### `outlook:get-emails` (invoke)

**Payload:** `{ top?: number; filter?: string }`  
**Returns:** `Email[]`

#### `outlook:send-email` (invoke)

**Payload:** `{ to: string; subject: string; body: string; isHtml: boolean }`

#### `outlook:new-email` (push)

**Direction:** main → renderer  
**Trigger:** Poll detects new unread messages.

```js
// preload.cjs
outlook: {
  auth:          () => ipcRenderer.invoke('outlook:auth'),
  getAuthStatus: () => ipcRenderer.invoke('outlook:get-auth-status'),
  getEmails:     (opts) => ipcRenderer.invoke('outlook:get-emails', opts),
  sendEmail:     (params) => ipcRenderer.invoke('outlook:send-email', params),
  compose:       (params) => ipcRenderer.invoke('outlook:compose', params),
  onNewEmail: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('outlook:new-email', handler);
    return () => ipcRenderer.removeListener('outlook:new-email', handler);
  },
}
```

---

## §6 — Auto-Launch IPC Channels

#### `autolaunch:get-status` (invoke)

**Returns:** `{ enabled: boolean }`

#### `autolaunch:set` (invoke)

**Payload:** `{ enabled: boolean }`  
**Note:** macOS requires code-signing + notarization for reliable auto-launch (see Electron plan Phase 2.7).

```js
// preload.cjs
autoLaunch: {
  getStatus: () => ipcRenderer.invoke('autolaunch:get-status'),
  set:       (enabled) => ipcRenderer.invoke('autolaunch:set', { enabled }),
}
```

---

## §7 — Window IPC Channels

#### `window:show` / `window:hide` (invoke)

**Direction:** renderer → main  
**Effect:** Shows or hides the main window (used by dashboard minimize action).

---

## §8 — contextBridge Rules (non-negotiable)

All `preload.cjs` additions MUST follow these rules:

1. **Never expose `ipcRenderer` itself.** Use `contextBridge.exposeInMainWorld` with named methods only.
2. **Every `on*` listener MUST return an unsubscribe function** (named handler ref — not inline arrow):
   ```js
   // CORRECT
   onFoo: (cb) => {
     const handler = (_e, data) => cb(data);
     ipcRenderer.on('foo', handler);
     return () => ipcRenderer.removeListener('foo', handler);
   }
   // WRONG — leaks listener on every call
   onFoo: (cb) => ipcRenderer.on('foo', (_e, data) => cb(data))
   ```
3. **React components MUST consume `on*` inside `useEffect` and call the returned unsubscribe in cleanup:**
   ```ts
   useEffect(() => {
     const unsub = window.electron!.pod.onStatusUpdate(setStatus);
     return unsub;
   }, []);
   ```
4. **Never use `ipcRenderer.removeAllListeners()`** — it removes other components' listeners.
5. **All `on*` handlers that are no longer needed must be explicitly removed** — memory leaks in long-running Electron processes are worse than in browsers.

---

## §9 — 401 / 403 Handling Contract

This is shared behaviour between **all** main-process services that call FastAPI (podMonitor, cloudSync):

| HTTP status | Meaning | Action |
|-------------|---------|--------|
| **401** | Service token rejected (expired or revoked) | Clear `_serviceToken` from memory. Send `auth:token-expired` to renderer. **Skip this cycle.** Do NOT fall through to offline/cache path. Do NOT retry with same token. |
| **403** | Permissions — user lacks access to this endpoint | Log warning. Skip cycle silently. Do NOT clear token. Do NOT notify user. |
| **fetch throws** (network error) | FastAPI unreachable / device offline | Return cached `electron-store` data. Emit `isOffline: true`. Do NOT clear token. |

**Cache-serve rule:** Stale cache is ONLY served on network failure (`fetch` throws). It is NEVER served on 401. Serving cache on 401 would silently hide an expired session.

**Token refresh race:** If podMonitor (30s) and cloudSync (60s) both fire during a token refresh window, both will get `null` from `getRuntimeServiceToken()` and skip their cycle. This is safe — both resume normally on the next tick after the new service token is written to the keychain and `_serviceToken` is updated in memory.

---

*This is a living contract. Changes require a PR with sign-off from both backend and electron team leads.*
