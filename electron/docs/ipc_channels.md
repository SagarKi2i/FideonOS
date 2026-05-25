# IPC Channels — Electron ↔ Next.js Renderer

**Owner:** Electron team
**Source of truth:** `.claude/interfaces/ipc_contract.md`
**Created:** 2026-05-21

> All `on*` listeners in `preload.cjs` MUST return an unsubscribe function. Consume in `useEffect` with cleanup. Never expose `ipcRenderer` directly. See `.claude/interfaces/ipc_contract.md §8` for the full contextBridge rules.

---

## Channel Index

| Channel | Direction | Type | Namespace |
|---------|-----------|------|-----------|
| `auth:service-token-ready` | main → renderer | push | auth |
| `auth:token-expired` | main → renderer | push | auth |
| `auth:logout` | renderer → main | invoke | auth |
| `auth:store-service-token` | renderer → main | invoke | auth |
| `pod:get-status` | renderer → main | invoke | pod |
| `pod:status-update` | main → renderer | push | pod |
| `cloudsync:get-workflows` | renderer → main | invoke | cloudSync |
| `cloudsync:trigger-now` | renderer → main | invoke | cloudSync |
| `cloudsync:synced` | main → renderer | push | cloudSync |
| `outlook:auth` | renderer → main | invoke | outlook |
| `outlook:get-auth-status` | renderer → main | invoke | outlook |
| `outlook:get-emails` | renderer → main | invoke | outlook |
| `outlook:send-email` | renderer → main | invoke | outlook |
| `outlook:compose` | renderer → main | invoke | outlook |
| `outlook:new-email` | main → renderer | push | outlook |
| `autolaunch:get-status` | renderer → main | invoke | autoLaunch |
| `autolaunch:set` | renderer → main | invoke | autoLaunch |
| `window:show` | renderer → main | invoke | window |
| `window:hide` | renderer → main | invoke | window |

---

## Auth Channels

### `auth:service-token-ready`
**Direction:** main → renderer (push)
**Trigger:** OTC exchange completed — service token written to keychain, or cold-start token validated.
**Payload:**
```ts
{ userEmail: string }
```
**Renderer action:** Update `AuthContext` — mark Electron session active, hide "connecting…" spinner.

```js
// preload.cjs
onServiceTokenReady: (cb) => {
  const handler = (_e, data) => cb(data);
  ipcRenderer.on('auth:service-token-ready', handler);
  return () => ipcRenderer.removeListener('auth:service-token-ready', handler);
}
```

---

### `auth:token-expired`
**Direction:** main → renderer (push)
**Trigger:** FastAPI returned 401 to a service_token request (podMonitor or cloudSync).
**Payload:** none
**Renderer action:** Call `POST /api/auth/electron/token/refresh` with `credentials: 'include'` (web cookie). If ok → `auth:store-service-token`. If fails → `signOut()`.

```js
// preload.cjs
onTokenExpired: (cb) => {
  const handler = () => cb();
  ipcRenderer.on('auth:token-expired', handler);
  return () => ipcRenderer.removeListener('auth:token-expired', handler);
}
```

---

### `auth:logout`
**Direction:** renderer → main (invoke)
**Trigger:** User signs out from web UI.
**Payload:** none
**Main action:** Calls `clearServiceToken()` — deletes `serviceToken` + `serviceTokenExpiresAt` from `electron-store`, sets `_serviceToken = null`. Pod monitor and cloud sync skip silently on next tick.

```js
// preload.cjs
logout: () => ipcRenderer.invoke('auth:logout')

// main.cjs
ipcMain.handle('auth:logout', async () => {
  await clearServiceToken();
});
```

---

### `auth:store-service-token`
**Direction:** renderer → main (invoke)
**Trigger:** Renderer received new service token from `POST /api/auth/electron/token/refresh` (cookie-auth recovery path — service token expired, web session still valid).
**Payload:**
```ts
{ serviceToken: string }
```
**Main action:** Encrypt with `safeStorage` → store in `electron-store` → reset `serviceTokenExpiresAt` to now+30d → update `_serviceToken` memory cache.

> This is the **only** case where a raw service token crosses the IPC boundary renderer → main. Restricted to the token-expired recovery path. Normal issuance always goes through the OTC exchange (deep-link → main directly, never via renderer).

```js
// preload.cjs
storeServiceToken: (serviceToken) =>
  ipcRenderer.invoke('auth:store-service-token', { serviceToken })

// main.cjs
ipcMain.handle('auth:store-service-token', async (_e, { serviceToken }) => {
  const encrypted = safeStorage.encryptString(serviceToken);
  store.set('serviceToken', encrypted.toString('base64'));
  store.set('serviceTokenExpiresAt',
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
  _serviceToken = serviceToken;
});
```

---

## Pod Monitor Channels

### `pod:get-status`
**Direction:** renderer → main (invoke)
**Returns:**
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

---

### `pod:status-update`
**Direction:** main → renderer (push)
**Trigger:** Each 30s poll cycle completes (success or network failure).
**Payload:** `PodStatus` (see above)

> Not emitted on 401. On 401 the monitor sends `auth:token-expired` instead.

```js
// preload.cjs
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

## Cloud Sync Channels

### `cloudsync:get-workflows`
**Direction:** renderer → main (invoke)
**Returns:**
```ts
interface SyncData {
  workflows: Array<{ id: string; name: string; status: string; lastRunAt: string }>;
  activatedAgents: Array<{ id: string; name: string; domain: string }>;
  syncedAt: string;
  isOffline: boolean;
}
```

---

### `cloudsync:trigger-now`
**Direction:** renderer → main (invoke)
**Effect:** Fires an immediate sync cycle regardless of the 60s timer.

---

### `cloudsync:synced`
**Direction:** main → renderer (push)
**Trigger:** Each 60s sync cycle completes (success or network failure).
**Payload:** `SyncData` (see above)

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

## Outlook (Microsoft Graph) Channels

### `outlook:auth`
**Direction:** renderer → main (invoke)
**Effect:** Opens browser for PKCE OAuth2 flow. Spawns temp HTTP server on port 49152. Stores encrypted tokens in `electron-store` via `safeStorage`. See `docs/oauth_flow.md`.

### `outlook:get-auth-status`
**Direction:** renderer → main (invoke)
**Returns:** `{ authenticated: boolean; userEmail: string | null }`

### `outlook:get-emails`
**Direction:** renderer → main (invoke)
**Payload:** `{ top?: number; filter?: string }`
**Returns:** `Email[]`

### `outlook:send-email`
**Direction:** renderer → main (invoke)
**Payload:** `{ to: string; subject: string; body: string; isHtml: boolean }`

### `outlook:compose`
**Direction:** renderer → main (invoke)
**Payload:** `{ to?: string; subject?: string; body?: string }`

### `outlook:new-email`
**Direction:** main → renderer (push)
**Trigger:** Poll detects new unread messages.
**Payload:** `Email` (single new message summary)

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

## Auto-Launch Channels

### `autolaunch:get-status`
**Direction:** renderer → main (invoke)
**Returns:** `{ enabled: boolean }`

### `autolaunch:set`
**Direction:** renderer → main (invoke)
**Payload:** `{ enabled: boolean }`
**Note:** macOS requires code-signing + notarization for reliable auto-launch.

```js
// preload.cjs
autoLaunch: {
  getStatus: () => ipcRenderer.invoke('autolaunch:get-status'),
  set: (enabled) => ipcRenderer.invoke('autolaunch:set', { enabled }),
}
```

---

## Window Channels

### `window:show` / `window:hide`
**Direction:** renderer → main (invoke)
**Effect:** Shows or hides the main `BrowserWindow`.

```js
// preload.cjs
window: {
  show: () => ipcRenderer.invoke('window:show'),
  hide: () => ipcRenderer.invoke('window:hide'),
}
```

---

## 401 / 403 / Network Handling Contract

Applies to all main-process services that call FastAPI (podMonitor, cloudSync):

| HTTP status | Meaning | Action |
|-------------|---------|--------|
| **401** | Service token rejected | Clear `_serviceToken`. Send `auth:token-expired`. Skip cycle. Never serve cache. |
| **403** | Permissions issue | Log warning. Skip cycle. Keep token. No renderer notification. |
| **fetch throws** | Network / FastAPI offline | Serve cached `electron-store` data. Emit `isOffline: true`. Keep token. |

**Cache rule:** Stale cache is served ONLY on network failure. Never on 401.

---

## contextBridge Rules (non-negotiable)

1. Never expose `ipcRenderer` itself — use named methods only
2. Every `on*` MUST return an unsubscribe function using a named handler ref
3. React: consume `on*` inside `useEffect`, call unsubscribe in cleanup
4. Never use `ipcRenderer.removeAllListeners()`
5. Never pass raw tokens through `on*` push channels (except `auth:store-service-token` invoke — recovery path only)
