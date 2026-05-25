# OAuth Flow — MS Graph PKCE + `fideon://` Routing

**Owner:** Electron team
**Created:** 2026-05-21
**Related:** `.claude/interfaces/ipc_contract.md §1` · `.claude/interfaces/ipc_contract.md §5` · `docs/plan.md Phase 5A`

---

## `fideon://` Protocol Routing Decision

The `fideon://` URI scheme is shared between the auth team and the Electron team. Sub-paths partition ownership:

| URI | Owner | Purpose |
|-----|-------|---------|
| `fideon://auth?otc=<value>` | Auth + Electron (joint) | Fideon login OTC handoff → service token exchange |
| `fideon://auth/reset-password` | Auth team | Deep-link into password reset flow |
| `fideon://` for MS OAuth | **NOT USED** | Rejected — see decision below |

### Why MS OAuth does NOT use `fideon://`

Using `fideon://` as the Microsoft OAuth redirect URI causes two problems:

1. **Path conflict** — `fideon://auth` is already owned by the Fideon auth handoff. A Microsoft redirect to `fideon://email://auth` or similar creates ambiguity in `handleFideonUri()` and risks routing the OAuth code to the wrong handler.
2. **macOS Gatekeeper** — Custom protocol redirects from a browser back to an unsigned Electron app can be blocked by Gatekeeper before notarization. A localhost HTTP server is unaffected.

**Decision (2026-05-21):** MS OAuth redirect URI is `http://localhost:49152/callback`.
Electron spawns a temporary HTTP server on port 49152 only for the duration of the OAuth flow. The server is torn down immediately after capturing the authorization code.

Set in `electron/.env`:
```
MS_REDIRECT_URI=http://localhost:49152/callback
```

Register exactly this URI in the Azure App Registration — no other redirect URIs needed.

---

## MS Graph OAuth2 — PKCE Flow

### Why PKCE (not client secret)

Electron apps are public clients — the app binary is on the user's machine and any embedded client secret can be extracted. PKCE replaces the client secret with a cryptographic challenge generated fresh for each authorization request. Microsoft requires PKCE for public clients.

### Full Flow

```
1. User clicks "Connect Outlook" in the UI
   → renderer calls window.electron.outlook.auth()
   → IPC: outlook:auth → main process

2. Main process generates PKCE parameters:
   code_verifier  = crypto.randomBytes(32).toString('base64url')   // 43 chars
   code_challenge = base64url(sha256(code_verifier))
   state          = crypto.randomBytes(16).toString('hex')         // stored in memory

3. Main process spawns temp HTTP server on port 49152:
   server = http.createServer(handleRedirect)
   server.listen(49152)

4. Main process opens browser:
   shell.openExternal(buildAuthUrl({
     client_id:             AZURE_CLIENT_ID,
     response_type:         'code',
     redirect_uri:          'http://localhost:49152/callback',
     scope:                 'Mail.Read Mail.Send User.Read offline_access',
     code_challenge:        code_challenge,
     code_challenge_method: 'S256',
     state:                 state,
   }))

5. User authenticates in browser, Microsoft redirects to:
   http://localhost:49152/callback?code=<auth_code>&state=<state>

6. Temp HTTP server captures redirect:
   handleRedirect(req, res):
     params = new URL(req.url).searchParams
     if params.get('state') !== storedState → reject, send error page
     code = params.get('code')
     server.close()  // tear down immediately

7. Main process exchanges code for tokens:
   POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
   Body: {
     grant_type:    'authorization_code',
     client_id:     AZURE_CLIENT_ID,
     code:          code,
     redirect_uri:  'http://localhost:49152/callback',
     code_verifier: code_verifier,    // proves possession, replaces client secret
   }
   Response: { access_token, refresh_token, expires_in, ... }

8. Main process encrypts and stores tokens:
   const encrypted = safeStorage.encryptString(JSON.stringify(tokens));
   store.set('msTokens', encrypted.toString('base64'));
   // Never store raw token strings in electron-store

9. Main process sends auth:get-auth-status to renderer with { authenticated: true, userEmail }
```

---

## `safeStorage` Encryption Pattern

All token values written to `electron-store` must be encrypted. Raw strings must never appear in the store.

```js
// Encrypt before writing
const encrypted = safeStorage.encryptString(JSON.stringify(tokens));
store.set('msTokens', encrypted.toString('base64'));

// Decrypt on read
const raw = Buffer.from(store.get('msTokens'), 'base64');
const tokens = JSON.parse(safeStorage.decryptString(raw));
```

`safeStorage` uses the OS credential store:
- **Windows:** DPAPI (tied to the Windows user account)
- **macOS:** Keychain
- **Linux:** libsecret / kwallet

The encrypted value is opaque bytes — base64 encoding makes it safe for `electron-store` (which serialises to JSON). The `base64` string is meaningless without the OS key.

Same pattern applies to the Fideon service token — see `docs/plan.md Phase 2.6`.

---

## Token Refresh (MS Graph)

Microsoft access tokens expire in ~1 hour. `getAccessToken()` in `msAuth.cjs` handles silent refresh:

```js
async function getAccessToken() {
  const raw = Buffer.from(store.get('msTokens'), 'base64');
  const tokens = JSON.parse(safeStorage.decryptString(raw));

  // Check expiry with a 5-minute buffer
  if (Date.now() < tokens.expires_at - 5 * 60 * 1000) {
    return tokens.access_token; // still valid
  }

  // Refresh
  const res = await fetch(
    `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        client_id:     AZURE_CLIENT_ID,
        refresh_token: tokens.refresh_token,
        scope:         'Mail.Read Mail.Send User.Read offline_access',
      }),
    }
  );

  const refreshed = await res.json();
  const newTokens = {
    access_token:  refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? tokens.refresh_token,
    expires_at:    Date.now() + refreshed.expires_in * 1000,
  };

  // Re-encrypt and store
  const encrypted = safeStorage.encryptString(JSON.stringify(newTokens));
  store.set('msTokens', encrypted.toString('base64'));

  return newTokens.access_token;
}
```

---

## Security Checklist

- [ ] `state` parameter generated with `crypto.randomBytes(16)` — verified on redirect, rejected if mismatch
- [ ] `code_verifier` generated with `crypto.randomBytes(32).toString('base64url')` — never logged or serialised
- [ ] `code_challenge` = `base64url(sha256(code_verifier))` — verified by Microsoft on exchange
- [ ] Temp HTTP server torn down immediately after capturing redirect code
- [ ] Tokens encrypted with `safeStorage` before any `electron-store` write
- [ ] `AZURE_CLIENT_ID` in `electron/.env` — never committed; `.gitignore` covers it
- [ ] Redirect URI registered in Azure App Registration matches exactly: `http://localhost:49152/callback`
- [ ] No client secret used or stored — PKCE public client flow only

---

## Azure App Registration — Required Settings

| Setting | Value |
|---------|-------|
| Platform | Mobile and desktop applications |
| Redirect URI | `http://localhost:49152/callback` |
| Supported account types | Accounts in any org directory (multi-tenant) |
| Client secret | **None** — public client / PKCE |
| API permissions | `Mail.Read`, `Mail.Send`, `User.Read`, `offline_access` |
| Allow public client flows | Yes |

---

## Environment Variables

```
# electron/.env (never committed)
AZURE_CLIENT_ID=<from Azure portal>
AZURE_TENANT_ID=common          # or specific tenant ID for single-tenant
MS_REDIRECT_URI=http://localhost:49152/callback

# electron/.env.example (committed — placeholders)
AZURE_CLIENT_ID=your-azure-client-id-here
AZURE_TENANT_ID=common
MS_REDIRECT_URI=http://localhost:49152/callback
```
