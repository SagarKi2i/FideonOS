# Fideon OS — Electron Desktop App Execution Plan

**Based on:** Architecture diagram (System Boot → Electron Main Process → Next.js Renderer → External Services)
**Date:** 2026-05-21
**Current state:** Electron shell exists (`electron/main.cjs`, `electron/preload.cjs`) but is mostly wired to `electron-playground` with no real integration. No system tray, no background services, no email, no cloud sync.

> **Auth architecture note:** This plan was originally drafted with Supabase Auth (`auth:set-token` IPC). That design is eliminated under ADR-001. Auth token handling in Phase 2.6, Phase 3, Phase 4, and Phase 7 has been corrected to use the custom FastAPI service token (OTC exchange) approach. See `.claude/interfaces/electron_auth_handoff.md §5` for the full correction table.

---

## Manager Review — Open Items (2026-05-21)

| # | Area | Severity | Resolution |
|---|------|----------|------------|
| 1 | `safeStorage` encryption pattern unclear | 🔴 Security | Documented in Phase 5A.2 |
| 2 | OAuth state param / CSRF not mentioned | 🔴 Security | Added to Phase 5A.2 |
| 3 | `fideon://` protocol conflict with Auth Module 1 | ✅ **RESOLVED** | `fideon://auth?otc=<value>` for auth; `http://localhost:49152/callback` for MS OAuth — see `docs/oauth_flow.md` and `.claude/interfaces/ipc_contract.md §1` |
| 4 | Security settings in Phase 8, not Phase 0 | 🟠 Security | CSP + `webSecurity` checks moved to Phase 0 |
| 5 | Auth token dependency for pod/cloud sync | ✅ **RESOLVED** | Phase 2.6 corrected — `auth:set-token` eliminated; service token via OTC exchange — see `.claude/interfaces/electron_auth_handoff.md §5` |
| 6 | `setInterval` fragility (concurrent polls, sleep/wake) | 🟠 Architecture | Replaced with self-scheduling pattern in Phase 3 + 4 |
| 7 | Dual "Last synced" UI in Header and Footer | 🟡 UX | Consolidated to Footer only; Header shows offline badge only |
| 8 | `electron-auto-launch` macOS signing requirement | 🟡 Platform | Note added to Phase 2 |
| 9 | No automated tests in Phase 8 | 🟡 Quality | Unit test tasks added to Phase 8 |
| 10 | `electron/.env` not in `.gitignore` checklist | 🟡 Security | Added to Phase 0 |
| 11 | `contextBridge` pattern not specified | 🟡 Implementation | Example added to Phase 7 |
| 12 | `electron-store` corruption/recovery not addressed | 🟡 Resilience | Schema versioning note added to Phase 3 |

> **One remaining blocker before implementation starts:**
> - 🔴 Confirm `safeStorage` + `electron-store` encryption approach with security lead.
> - ~~🔴 Coordinate `fideon://` custom protocol~~ — **RESOLVED** (see item 3 above)

---

## What We Are Building

A full Electron desktop wrapper around the existing Next.js + FastAPI app, adding:

1. **System tray** — background visibility, minimize-to-tray on close
2. **Auto-launch** — start on system boot (Windows: registry / `electron-auto-launch`)
3. **Pod Health Monitor** — IPC service polling FastAPI `/api/workflows` every 30s, exposes `/pod/status`, sends desktop notifications on failure
4. **Cloud Sync** — polls Cloud API every 60s for activated workflows, caches locally for offline support
5. **Email Receiver** — OAuth2 Microsoft Graph, fetch Outlook emails, extract code blocks & plain text
6. **Email Sender** — compose + send via Graph API, triggered by workflow or user action
7. **Next.js UI shell** — Header (app name, sync status, user info), Pod Status Bar, Workflows Panel, Outlook Panel, Sidebar nav, Footer

---

## Phase 0 — Project Setup

**Goal:** Wire Electron correctly as a proper dev/prod app. Security baselines established here, not deferred to Phase 8.

### Tasks

- [ ] **0.1** Add Electron dependencies to `electron/package.json`:
  - `electron`, `electron-builder`, `electron-auto-launch`, `electron-store`
  - Dev: `concurrently`, `wait-on`
- [ ] **0.2** Create `electron/package.json` with `"main": "main.cjs"` and `electron-builder` config block
- [ ] **0.3** Update `electron/main.cjs` start URL:
  - Dev: `http://localhost:3000`
  - Prod: load Next.js standalone server or packaged output
- [ ] **0.4** Add npm scripts:
  ```
  "electron:dev"   → wait-on http://localhost:3000 && electron .
  "electron:build" → electron-builder
  "dev:all"        → concurrently "cd ../frontend && npm run dev" "npm run electron:dev"
  ```
- [ ] **0.5** Add `electron-builder` config: targets Windows NSIS + macOS dmg, icons, productName `"Fideon OS"`
- [ ] **0.6** 🔴 **Security baseline:**
  - Confirm `BrowserWindow` has `nodeIntegration: false`, `contextIsolation: true`, `webSecurity: true`
  - Add `Content-Security-Policy` meta tag: allow `self`, block `unsafe-eval`, allow FastAPI origin for API calls
  - Add `electron/.env` to `electron/.gitignore`; create `.gitignore` with: `.env`, `dist/`, `node_modules/`
  - Add `electron/.env.example` with placeholder keys

**Files:** `electron/package.json` (new), `electron/main.cjs`, `electron/.gitignore` (new), `electron/.env.example` (new)

---

## Phase 1 — System Tray & Window Management

**Goal:** App lives in system tray. Closing window hides it. Tray click restores it.

### Tasks

- [ ] **1.1** Import `Tray`, `Menu`, `nativeImage` in `electron/main.cjs`
- [ ] **1.2** Create tray icon on app `ready`:
  - Windows: `electron/assets/tray-icon.ico`
  - macOS: `tray-icon.png` (template image)
- [ ] **1.3** Override `close` event — `event.preventDefault()` + `mainWindow.hide()`
- [ ] **1.4** Tray context menu: **Open Fideon OS**, **Quit**
- [ ] **1.5** Single-click tray icon — show + focus window
- [ ] **1.6** Add IPC handlers `window:show` / `window:hide`
- [ ] **1.7** HMR guard in dev mode — skip tray minimize when `NODE_ENV === 'development'`

**Files:** `electron/main.cjs`, `electron/assets/` (new icons)

---

## Phase 2 — Auto-Launch on System Boot

### Tasks

- [ ] **2.1** Install `electron-auto-launch`
- [ ] **2.2** Instantiate `AutoLaunch` with `{ name: 'Fideon OS', path: app.getPath('exe') }`
- [ ] **2.3** Add IPC handlers: `autolaunch:get-status`, `autolaunch:set`
- [ ] **2.4** Expose via `preload.cjs`: `window.electron.autoLaunch.getStatus()`, `.set(enabled)`
- [ ] **2.5** Wire auto-launch toggle in Sidebar UI

### Phase 2.6 — Service Token IPC Contract (replaces old auth:set-token)

> ⚠️ **This section replaces the original Phase 2.6.** The original described `auth:set-token` IPC where the renderer pushed the Supabase JWT to main. That design is **eliminated** under ADR-001 — the JWT is in an HttpOnly cookie, JavaScript cannot read it, the renderer cannot pass it to main. See `.claude/interfaces/electron_auth_handoff.md §5`.

**Correct approach: service token via OTC exchange + OS keychain.**

**`electron/main.cjs` — service token state:**

```js
let _serviceToken = null; // in-memory cache; source of truth is OS keychain

// Restores session on cold start
async function loadServiceTokenFromKeychain() {
  const encrypted = store.get('serviceToken');
  if (!encrypted) return;
  const raw = Buffer.from(encrypted, 'base64');
  _serviceToken = safeStorage.decryptString(raw);

  const res = await fetchWithServiceToken('/api/auth/me');
  if (res.status === 401) {
    store.delete('serviceToken');
    store.delete('serviceTokenExpiresAt');
    _serviceToken = null;
    mainWindow.webContents.send('auth:token-expired');
    return;
  }
  const me = await res.json();
  mainWindow.webContents.send('auth:service-token-ready', { userEmail: me.email });
}

// Called by handleFideonUri() when fideon://auth?otc=<value> arrives
async function exchangeOtcForServiceToken(rawOtc) {
  const res = await fetch(`${FIDEON_API_URL}/api/auth/electron/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otc: rawOtc }),
  });
  if (res.status === 401) {
    mainWindow.webContents.send('auth:token-expired');
    return;
  }
  const { service_token } = await res.json();
  const encrypted = safeStorage.encryptString(service_token);
  store.set('serviceToken', encrypted.toString('base64'));
  store.set('serviceTokenExpiresAt', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
  _serviceToken = service_token;
  const me = await fetchWithServiceToken('/api/auth/me');
  mainWindow.webContents.send('auth:service-token-ready', { userEmail: (await me.json()).email });
}

// Called by podMonitor / cloudSync on every poll cycle
async function getRuntimeServiceToken() {
  if (_serviceToken) return _serviceToken;
  const encrypted = store.get('serviceToken');
  if (!encrypted) return null;
  const raw = Buffer.from(encrypted, 'base64');
  _serviceToken = safeStorage.decryptString(raw);
  return _serviceToken;
}

async function clearServiceToken() {
  store.delete('serviceToken');
  store.delete('serviceTokenExpiresAt');
  _serviceToken = null;
}

// IPC handlers
ipcMain.handle('auth:logout', async () => {
  await clearServiceToken();
});

// Recovery path only — renderer received new token from /api/auth/electron/token/refresh (cookie auth)
ipcMain.handle('auth:store-service-token', async (_e, { serviceToken }) => {
  const encrypted = safeStorage.encryptString(serviceToken);
  store.set('serviceToken', encrypted.toString('base64'));
  store.set('serviceTokenExpiresAt', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
  _serviceToken = serviceToken;
});

// fideon:// deep link handler — triggers OTC exchange
function handleFideonUri(url) {
  const parsed = new URL(url);
  if (parsed.host === 'auth') {
    const otc = parsed.searchParams.get('otc');
    if (otc) exchangeOtcForServiceToken(otc);
  }
}

// Register protocol + single-instance guard (on app ready)
app.setAsDefaultProtocolClient('fideon');
const lock = app.requestSingleInstanceLock();
if (!lock) { app.quit(); return; }
app.on('open-url', (event, url) => { event.preventDefault(); handleFideonUri(url); });
app.on('second-instance', (_event, argv) => {
  const url = argv.find(a => a.startsWith('fideon://'));
  if (url) handleFideonUri(url);
  mainWindow?.show(); mainWindow?.focus();
});
```

**`electron/preload.cjs` — auth namespace:**

```js
auth: {
  onServiceTokenReady: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('auth:service-token-ready', handler);
    return () => ipcRenderer.removeListener('auth:service-token-ready', handler);
  },
  onTokenExpired: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('auth:token-expired', handler);
    return () => ipcRenderer.removeListener('auth:token-expired', handler);
  },
  logout: () => ipcRenderer.invoke('auth:logout'),
  storeServiceToken: (serviceToken) => ipcRenderer.invoke('auth:store-service-token', { serviceToken }),
  // NO setToken — NO clearToken — those were the old Supabase design
}
```

**`frontend/contexts/AuthContext.tsx` — after OTP verify succeeds in Electron:**

```ts
// After POST /api/auth/otp/verify returns 200 and window.electron exists:
// FastAPI already set the HttpOnly cookie. Now trigger OTC flow:
if (isElectron()) {
  const otcRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/electron/otc`, {
    method: 'POST',
    credentials: 'include',
  });
  if (otcRes.ok) {
    const { otc } = await otcRes.json();
    window.location.href = `fideon://auth?otc=${otc}`;
    // OS routes this to Electron main → exchangeOtcForServiceToken()
  }
}
```

**`frontend/contexts/AuthContext.tsx` — auth:token-expired handler:**

```ts
useEffect(() => {
  if (!isElectron()) return;
  const unsub = window.electron!.auth.onTokenExpired(async () => {
    // Service token expired. Use still-valid web cookie to get a new one.
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/electron/token/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) {
      const { service_token } = await res.json();
      await window.electron!.auth.storeServiceToken(service_token);
    } else {
      await signOut();
    }
  });
  return unsub;
}, []);
```

- [ ] **2.6a** Implement `exchangeOtcForServiceToken()`, `loadServiceTokenFromKeychain()`, `getRuntimeServiceToken()`, `clearServiceToken()` in `main.cjs`
- [ ] **2.6b** Register `fideon://` protocol + single-instance lock on app ready
- [ ] **2.6c** Add `auth:logout` + `auth:store-service-token` IPC handlers
- [ ] **2.6d** Expose `auth` namespace in `preload.cjs` (no `setToken`, no `clearToken`)
- [ ] **2.6e** Update `AuthContext.tsx`: trigger OTC flow after OTP verify; handle `auth:token-expired`

- [ ] **2.7** 🟡 **macOS note:** `electron-auto-launch` requires code-signing + notarization on macOS.

**Files:** `electron/main.cjs`, `electron/preload.cjs`, `frontend/contexts/AuthContext.tsx`

---

## Phase 3 — Pod Health Monitor

**Goal:** Background service polling FastAPI `/api/workflows` every 30s. Caches pod status, sends desktop notifications on failure.

### Architecture

```
Electron Main (self-scheduling, 30s)
  → getRuntimeServiceToken()  ← from keychain/memory (Phase 2.6)
  → fetch /api/workflows with Authorization: Bearer <service_token>
  → save state to electron-store (schema-versioned)
  → ipcMain: respond to 'pod:get-status'
  → BrowserWindow.webContents.send('pod:status-update', payload)
  → Notification on failure
```

### Tasks

- [ ] **3.1** Install `electron-store`
- [ ] **3.2** In `electron/services/podMonitor.cjs` (new file), implement self-scheduling pattern:

```js
async function schedulePoll(mainWindow, store) {
  await poll(mainWindow, store);
  setTimeout(() => schedulePoll(mainWindow, store), 30_000);
}

async function poll(mainWindow, store) {
  const token = await getRuntimeServiceToken(); // from main.cjs
  if (!token) return; // not logged in — skip silently

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
    // Service token rejected — clear memory, notify renderer
    _serviceToken = null;
    mainWindow.webContents.send('auth:token-expired');
    return; // do NOT serve stale cache on auth failure
  }

  if (res.status === 403) {
    console.warn('[podMonitor] 403 — permissions issue, skipping cycle');
    return; // do NOT clear token
  }

  const data = await res.json();
  const podStatus = classifyWorkflows(data.workflows);
  store.set('podStatus', podStatus);
  mainWindow.webContents.send('pod:status-update', { ...podStatus, isOffline: false });
}
```

- [ ] **3.3** Import and call `startPodMonitor` from `main.cjs` after window created
- [ ] **3.4** Add IPC handler `pod:get-status` → returns `store.get('podStatus')`
- [ ] **3.5** Expose via `preload.cjs`: `window.electron.pod.getStatus()`, `.onStatusUpdate(cb)`
- [ ] **3.6** Frontend: **Pod Status Bar** component (`frontend/components/shell/PodStatusBar.tsx`)
- [ ] **3.7** Mount `PodStatusBar` in `frontend/app/(app)/layout.tsx`
- [ ] **3.8** 🛡️ **electron-store schema versioning:** Initialize with `{ name: 'fideon-data', schema: {...}, migrations: { '>=2': store => store.clear() } }`

**Files:** `electron/services/podMonitor.cjs` (new), `electron/main.cjs`, `electron/preload.cjs`, `frontend/components/shell/PodStatusBar.tsx` (new)

---

## Phase 4 — Cloud Sync

**Goal:** Background service polling FastAPI every 60s. Fetches activated workflows + agents, caches for offline.

### Architecture

```
Electron Main (self-scheduling, 60s)
  → getRuntimeServiceToken()  ← from keychain/memory (Phase 2.6)
  → fetch /api/agents + /api/workflows with Authorization: Bearer <service_token>
  → save to store: { workflows, activatedAgents, syncedAt }
  → push 'cloudsync:synced' to renderer
```

### Tasks

- [ ] **4.1** In `electron/services/cloudSync.cjs` (new file), self-scheduling pattern (60s):

```js
async function scheduleSync(mainWindow, store) {
  await sync(mainWindow, store);
  setTimeout(() => scheduleSync(mainWindow, store), 60_000);
}

async function sync(mainWindow, store) {
  const token = await getRuntimeServiceToken();
  if (!token) return;

  // 401 → clear _serviceToken + auth:token-expired (same contract as podMonitor)
  // 403 → log warning, skip, keep token
  // fetch throws → serve cache, isOffline: true
  // See .claude/interfaces/ipc_contract.md §9 for full contract
}
```

- [ ] **4.2** Add IPC handlers: `cloudsync:get-workflows`, `cloudsync:trigger-now`
- [ ] **4.3** Expose via `preload.cjs`: `getWorkflows()`, `triggerNow()`, `onSynced(cb)`
- [ ] **4.4** 🎨 **UX:** "Last synced" in **Footer only**. Header shows offline badge only.
- [ ] **4.5** Frontend: **Workflows Panel** (`frontend/components/shell/WorkflowsPanel.tsx`)
- [ ] **4.6** Footer component (`frontend/components/shell/AppFooter.tsx`) — "Last synced: X ago · [Sync Now]"

**Files:** `electron/services/cloudSync.cjs` (new), `electron/main.cjs`, `electron/preload.cjs`, `frontend/components/shell/WorkflowsPanel.tsx` (new), `frontend/components/shell/AppFooter.tsx` (new)

---

## Phase 5 — Email Integration (Microsoft Graph API)

**Goal:** OAuth2 PKCE auth with Microsoft, receive/send Outlook emails via Graph API.

> **fideon:// routing:** MS OAuth redirect uses `http://localhost:49152/callback` — NOT `fideon://`. See `docs/oauth_flow.md` for full PKCE flow and routing decision.

### 5A — Email Receiver

- [ ] **5A.1** Register Azure App Registration (external prereq):
  - Scopes: `Mail.Read`, `Mail.Send`, `User.Read`, `offline_access`
  - Redirect URI: `http://localhost:49152/callback`
  - Add `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` to `electron/.env`
- [ ] **5A.2** `electron/services/msAuth.cjs` — PKCE OAuth2 flow:
  - Generate `code_verifier` (random 43–128 chars) + `code_challenge` (SHA-256, base64url)
  - Generate random `state` (16+ bytes `crypto.randomBytes`) — verify on redirect, reject mismatch
  - Open browser via `shell.openExternal()`; spawn temp HTTP server on port 49152 to capture redirect
  - Exchange `code` + `code_verifier` for tokens; encrypt with `safeStorage` before storing
  - `getAccessToken()` — auto-refresh using `refresh_token` if expired; re-encrypt on store
- [ ] **5A.3** `electron/services/emailReceiver.cjs` — fetch + parse emails
- [ ] **5A.4** IPC handlers: `outlook:auth`, `outlook:get-emails`, `outlook:get-auth-status`
- [ ] **5A.5** Expose via `preload.cjs`

### 5B — Email Sender

- [ ] **5B.1** `electron/services/emailSender.cjs` — POST to `/v1.0/me/sendMail`
- [ ] **5B.2** IPC handlers: `outlook:send-email`, `outlook:compose`
- [ ] **5B.3** Expose via `preload.cjs`
- [ ] **5B.4** Frontend: Outlook page (`frontend/app/(app)/outlook/page.tsx`)
- [ ] **5B.5** Wire "Send email" as workflow action

**Files:** `electron/services/msAuth.cjs` (new), `electron/services/emailReceiver.cjs` (new), `electron/services/emailSender.cjs` (new)

---

## Phase 6 — Next.js UI Shell

- [ ] **6.1** `frontend/app/(app)/electron-layout.tsx` — Electron-specific layout wrapper
- [ ] **6.2** Header: app name, sync badge, user info
- [ ] **6.3** Sidebar: Dashboard, Workflows, Outlook, Settings, Auto-launch toggle
- [ ] **6.4** Workflows Panel (from Phase 4)
- [ ] **6.5** Outlook Panel (from Phase 5B)
- [ ] **6.6** Footer (from Phase 4)
- [ ] **6.7** `frontend/app/(app)/electron-home/page.tsx` — main landing page in Electron

**Files:** `frontend/app/(app)/electron-home/page.tsx` (new), `frontend/app/(app)/layout.tsx`

---

## Phase 7 — IPC Bridge Cleanup & Type Safety

- [ ] **7.1** Create `frontend/types/electron.d.ts`:

```ts
interface Window {
  electron?: {
    isElectron: () => Promise<boolean>;
    auth: {
      // NO setToken — NO clearToken (old Supabase design, eliminated under ADR-001)
      onServiceTokenReady(cb: (data: { userEmail: string }) => void): () => void;
      onTokenExpired(cb: () => void): () => void;
      logout(): Promise<void>;
      storeServiceToken(serviceToken: string): Promise<void>; // recovery path only
    };
    autoLaunch: {
      getStatus(): Promise<{ enabled: boolean }>;
      set(v: boolean): Promise<void>;
    };
    pod: {
      getStatus(): Promise<PodStatus>;
      onStatusUpdate(cb: (s: PodStatus) => void): () => void;
    };
    cloudSync: {
      getWorkflows(): Promise<SyncData>;
      triggerNow(): Promise<void>;
      onSynced(cb: (s: SyncData) => void): () => void;
    };
    outlook: {
      auth(): Promise<void>;
      getEmails(o?: EmailOptions): Promise<Email[]>;
      sendEmail(p: SendParams): Promise<void>;
      getAuthStatus(): Promise<{ authenticated: boolean; userEmail: string | null }>;
      onNewEmail(cb: (e: Email) => void): () => void;
      compose(p: ComposeParams): void;
    };
  }
}
```

- [ ] **7.2** 🛡️ **contextBridge pattern — all `on*` methods must return unsubscribe:**

```js
// CORRECT — named handler ref, returns unsubscribe
onStatusUpdate: (cb) => {
  const handler = (_event, data) => cb(data);
  ipcRenderer.on('pod:status-update', handler);
  return () => ipcRenderer.removeListener('pod:status-update', handler);
}
// WRONG — leaks listener on every call
onStatusUpdate: (cb) => ipcRenderer.on('pod:status-update', (_e, data) => cb(data))
```

React usage — always in `useEffect`:
```ts
useEffect(() => {
  const unsub = window.electron!.pod.onStatusUpdate(setStatus);
  return unsub;
}, []);
```

- [ ] **7.3** Create `frontend/lib/electronApi.ts` — `isElectron()` guard + typed wrappers
- [ ] **7.4** Update all components using `window.electron` directly to go through `electronApi.ts`

**Files:** `frontend/types/electron.d.ts` (new), `frontend/lib/electronApi.ts` (new)

---

## Phase 8 — Testing & Polish

### Manual integration tests

- [ ] **8.1** Smoke test: launch in dev mode, verify tray, pod status, sync
- [ ] **8.2** Offline mode: kill FastAPI, verify cached data, offline badge, Footer sync time
- [ ] **8.3** Email auth flow end-to-end (requires Azure App Registration — external prereq)
- [ ] **8.4** Auto-launch: enable toggle, reboot Windows; note macOS needs notarization
- [ ] **8.5** Build production package: `npm run electron:build`, install and run NSIS on Windows

### Automated unit tests

- [ ] **8.6** Unit test `podMonitor.cjs`:
  - Status classification: `Running | Stopped | Failed | Unknown`
  - `Failed` transition → `Notification` fires
  - Self-scheduling: second `poll()` fires ~30s after first *completes* (not starts)
  - 401 → `_serviceToken` cleared + `auth:token-expired` sent + cache NOT updated
  - Network error → cache served + `isOffline: true` + token NOT cleared
  - 403 → token NOT cleared + no user notification + cycle skipped
- [ ] **8.7** Unit test `cloudSync.cjs` — same 401/403/network scenarios; token refresh race
- [ ] **8.8** Unit test `msAuth.cjs`:
  - `state` mismatch on redirect → auth rejected
  - `safeStorage` encrypt/decrypt round-trip
  - PKCE `code_challenge` = SHA-256(`code_verifier`) base64url
- [ ] **8.9** Unit test `emailReceiver.cjs`: `extractCodeBlocks()`, `extractPlainText()`

---

## Execution Order

| Phase | Depends On | Complexity | Notes |
|-------|-----------|------------|-------|
| 0 — Project Setup | — | Low | Security baseline first |
| 1 — System Tray | 0 | Low | |
| 2 — Auto-Launch + Service Token | 1 | Medium | OTC exchange; fideon:// protocol |
| 3 — Pod Health Monitor | 0, 2 | Medium | Self-scheduling; `getRuntimeServiceToken()` |
| 4 — Cloud Sync | 0, 3 | Medium | Self-scheduling; same token contract |
| 5 — Email Integration | 0, 4 | High | `localhost:49152` redirect (not `fideon://`) |
| 6 — UI Shell | 3, 4, 5 | Medium | Footer-only sync status |
| 7 — Type Safety | 6 | Low | No `setToken`/`clearToken` in types |
| 8 — Testing | 7 | Medium | Unit tests for all services |

---

## Key Files Reference

| What to build | Where |
|--------------|-------|
| Tray + window management | `electron/main.cjs` |
| IPC bridge (all exposed APIs) | `electron/preload.cjs` |
| Service token contract (OTC exchange) | `electron/main.cjs` — Phase 2.6; see `docs/ipc_channels.md` |
| Pod health polling | `electron/services/podMonitor.cjs` (new) |
| Cloud sync service | `electron/services/cloudSync.cjs` (new) |
| MS OAuth2 PKCE flow | `electron/services/msAuth.cjs` (new); see `docs/oauth_flow.md` |
| Email fetch + parse | `electron/services/emailReceiver.cjs` (new) |
| Email send | `electron/services/emailSender.cjs` (new) |
| Electron type declarations | `frontend/types/electron.d.ts` (new) |
| Safe IPC wrapper | `frontend/lib/electronApi.ts` (new) |
| Pod Status Bar UI | `frontend/components/shell/PodStatusBar.tsx` (new) |
| Workflows Panel UI | `frontend/components/shell/WorkflowsPanel.tsx` (new) |
| App Footer UI | `frontend/components/shell/AppFooter.tsx` (new) |
| Outlook page | `frontend/app/(app)/outlook/page.tsx` (new) |
| Electron home page | `frontend/app/(app)/electron-home/page.tsx` (new) |

---

## Environment Variables

**`electron/.env` (never committed):**
```
AZURE_CLIENT_ID=
AZURE_TENANT_ID=common
FIDEON_API_URL=http://localhost:8000
MS_REDIRECT_URI=http://localhost:49152/callback
```

**`electron/.env.example` (committed — placeholders only):**
```
AZURE_CLIENT_ID=your-azure-client-id-here
AZURE_TENANT_ID=common
FIDEON_API_URL=http://localhost:8000
MS_REDIRECT_URI=http://localhost:49152/callback
```
