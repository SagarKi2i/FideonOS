# FNF Sprint Execution — Doc Retrieval v1

**Sprint window:** May 25 → May 30, 2026
**Branch:** feature branch off `main` (staging branch name + creds TBD by user — see FNF-565)
**Companion doc:** [doc-retrieval-v1-sprint-plan.md](./doc-retrieval-v1-sprint-plan.md) — long-form design rationale, day-by-day plan, risks. **This doc** is the executable index, keyed by Jira ticket.

## Implementation status snapshot (2026-05-26)

| FNF | Status | What landed |
|---|---|---|
| FNF-573 | ✅ done | Verified: `events.py`, `errors.py`, orchestrator emits, adapter raises typed errors |
| FNF-574 | ✅ done | `services/observability/logging.py` (structlog config), `retry.py` (tenacity decorator), wired into adapter + orchestrator + `main.py` |
| FNF-564 | ✅ done | Facade pattern: `store.py`/`registry.py` dispatch to `_json_*` or `_supabase_*` based on `settings.doc_retrieval_storage_backend`. Seed script at `scripts/seed_registries.py` |
| FNF-566 | ✅ done | `views/AdminCarriers.tsx` + `app/(app)/admin/carriers/page.tsx` + `adminApi.carriers/upsertCarrier/deleteCarrier` |
| FNF-567 | ✅ done (tests deferred) | `views/AdminAmsTargets.tsx` + page; gating via existing `AdminGuard`. Backend gating test file deferred (no backend test harness yet) |
| FNF-569 | ✅ done | New `playwright_adapter.py` using `playwright.async_api`; legacy httpx code archived as `httpx_adapter.py`; `mfa_playwright.py` companion |
| FNF-570 | ✅ done | `services/storage/azure_blob.py` with `upload_run_blob` + `signed_url`; adapter `_download_row` uploads when `AZURE_BLOB_CONNECTION_STRING` is set, local FS otherwise |
| FNF-572 | ✅ done | `agentsApi.startDocRetrievalRun`/`getDocRetrievalRun`/`postDocRetrievalMfaResponse` + `lib/pollRun.ts` + real-run status panel in `DocumentRetrievalUI.tsx` |
| FNF-562 | ✅ done | `MfaPromptDialog.tsx` (email_otp + email_link + captcha_hil); `captcha_bypass` solver added to `mfa_playwright.py`; dialog auto-mounted on `awaiting_mfa` |
| FNF-565 | 📋 BLOCKED | needs staging branch name + Supabase creds |

---

## How to use this doc

- **One ticket = one section.** Open the FNF-XXX you're shipping, read its `Files`, `Steps`, `Acceptance`, and `Verify` blocks, and you have everything you need to close it.
- **Status flags are accurate to current code state.** ✅ means "already in the repo, do not re-implement". 🚧 means "skeleton exists, finish it". 📋 means "not started".
- **Cross-link, don't copy.** If you want the *why* behind an approach, follow the link to [doc-retrieval-v1-sprint-plan.md](./doc-retrieval-v1-sprint-plan.md) §Task N. This doc keeps each section to ~50 lines.
- **Execution order ≠ ticket-number order.** Ship sub-tasks in the order listed under "Sub-tasks" — that order respects dependencies.
- **Claude Code prompt:** "Open `Sprint-execution/Sagar/fnf-tasks-execution.md`, jump to FNF-XXX, and ship it. Follow the Files/Steps/Acceptance/Verify blocks exactly. Reuse anything marked ✅; do not re-implement."

---

## Stack & conventions (pointers only)

- **Backend venv:** [backend/venv/](../../backend/) — Python 3.11.9. Activate with `.\venv\Scripts\Activate.ps1` (PowerShell). New deps already in [requirements.txt](../../backend/requirements.txt): `playwright==1.47.0`, `pyotp==2.9.0`, `structlog==24.4.0`, `tenacity==9.0.0`, `valkey==6.0.2`. Add `azure-storage-blob==12.23.1` for FNF-570.
- **Frontend:** Next.js 15 SSR. Install with `npm install --no-audit --no-fund --maxsockets=1` (Windows Defender races otherwise).
- **Auth gating:** every admin route uses `Depends(require_admin)` from [backend/auth/dependencies.py](../../backend/auth/dependencies.py). Every admin page wraps in `<AdminGate>` (📋 to be built in FNF-567).
- **Windows + Playwright:** the process-wide `WindowsProactorEventLoopPolicy` is set in [backend/run_server.py](../../backend/run_server.py). Playwright subprocesses spawn correctly. Don't run uvicorn directly with `uvicorn.run(...)` — use `python -m run_server`.
- **Do NOT introduce:** `react-router-dom` (use `next/navigation`), `import.meta.env` (use `process.env.NEXT_PUBLIC_*`), synchronous Playwright API (use `playwright.async_api`).
- **Type-check + import-sanity after every backend change:** `python -c "import main"` from `backend/` and `npx tsc --noEmit` from `frontend/`.

---

## Current state legend

- ✅ **done** — code is in the repo, do not re-implement
- 🚧 **partial** — skeleton or alternative implementation exists; this ticket finishes/changes it
- 📋 **todo** — not started

---

# Epics

### FNF-346 — Document Retrieval system (umbrella)

**Status:** 🚧 partial — v0 single-carrier loop works; v1 (this sprint) promotes it to 6-carrier, Supabase-backed, observable.
**Closes:** the v1 cut of the Doc Retrieval pod.
**Composed of sub-tasks:** FNF-564, FNF-565, FNF-569, FNF-570, FNF-572, FNF-562, FNF-573, FNF-574.

**Definition of done (epic-level):**
- All 6 mock carriers boot ([mock_carriers/](../../mock_carriers/), ports 8001-8006) and complete end-to-end via the orchestrator.
- `carriers` + `doc_retrieval_runs` + `ams_targets` rows are read/written against Supabase (not the JSON file store).
- The pod UI's "Retrieve & Attach" button runs a real retrieval, not the hardcoded stub.
- Lifecycle events emit JSON via structlog; failures classified by error taxonomy; retryable steps retry with exponential backoff.

**Verify (epic):** run the full end-to-end block at the bottom of this doc.

---

### FNF-340 — Finalize Carrier settings

**Status:** 🚧 partial — schema ✅, backend admin routes ✅, in-process registry seeded with 10 carriers ✅, Supabase-backed store 📋, frontend admin UI 📋.
**Closes via:** FNF-564 (Supabase cutover) + FNF-566 (admin UI).

**Why "finalize":** the canonical `Carrier` schema, the migration, and the seed data exist, but the runtime store ([store.py](../../backend/services/doc_retrieval/store.py)) is still JSON-backed and brokers can't edit a carrier without editing the JSON file by hand.

**Definition of done:** admin can CRUD a carrier from the browser, the value persists in Supabase, and the next run picks it up.

---

### FNF-341 — Completion of Admin interface for carriers & AMS settings

**Status:** 🚧 partial — backend routes ✅ ([admin.py:208-257](../../backend/routers/admin.py#L208)), frontend pages 📋, shared `<AdminGate>` 📋.
**Closes via:** FNF-566 (carrier UI) + FNF-567 (AMS panel + role gating).

**Why this epic exists separately from FNF-340:** AMS targets are a distinct concept from carriers (destination side vs source side) and need their own settings panel with connector-specific config forms (Applied Epic vs HawkSoft vs AMS360 vs QQ Catalyst vs EZLynx).

**Definition of done:** `/admin/carriers` and `/admin/ams-targets` pages exist, non-admins are redirected, all CRUD operations work end-to-end.

---

### FNF-345 — Doc Retrieval Agent — Login, Navigation, Download across all 6 sites

**Status:** 🚧 partial — current adapter is httpx-based ([playwright_adapter.py](../../backend/services/doc_retrieval/playwright_adapter.py)); ticket title calls for Playwright. Swap-back is in scope (see FNF-569).
**Closes via:** FNF-569 (Playwright per site) + FNF-570 (download + storage) + FNF-562 (HIL MFA closes the loop on Liberty + Nationwide).

**Six target carriers and their MFA flavors:**

| Carrier | Port | mfa_kind | Selector style |
|---|---|---|---|
| mock_travelers | 8001 | totp_rfc6238 | attribute-based (data-testid) |
| mock_hartford | 8002 | email_otp | column-index |
| mock_chubb | 8003 | totp_rfc6238 | ARIA-first |
| mock_liberty | 8004 | email_link (HIL) | iframe-wrapped |
| mock_nationwide | 8005 | captcha_hil (HIL) | CSRF-token forms |
| mock_progressive | 8006 | totp_rfc6238 | paginated table |

**Definition of done:** each carrier runs end-to-end. Auto-MFA carriers (TOTP, email_otp) complete to `status=completed`. HIL carriers complete after a posted MFA response.

---

### FNF-347 — Event Logging & Error Handling for Carriers

**Status:** 🚧 partial — event schema ✅ ([events.py](../../backend/services/observability/events.py)), error taxonomy ✅ ([errors.py](../../backend/services/observability/errors.py)), orchestrator emits events ✅. Structured logging output 📋, retry handling 📋.
**Closes via:** FNF-573 (schema + taxonomy — mostly done) + FNF-574 (structlog + tenacity wiring).

**Definition of done:** an e2e run produces ≥ 8 JSON-formatted log lines on stdout, each tagged with `run_id`, `carrier_id`, `event`, `level`. Transient/rate_limited errors retry with exponential backoff; non-retryable errors fail fast.

---

# Sub-tasks

Ship in this order. Dependencies are listed per task.

---

### FNF-564 — Apply final defaults & migrate

**Status:** 🚧 partial — migration ✅, JSON store ✅, Supabase-backed store 📋.
**Closes epic(s):** FNF-340, FNF-346.
**Depends on:** —

**Goal:** Cut [store.py](../../backend/services/doc_retrieval/store.py) over from JSON file persistence to Supabase. JSON store stays as a local-dev fallback selected via `settings.doc_retrieval_storage_backend`.

**Files to touch:**
- ✅ [supabase/migrations/20260526100000_doc_retrieval_registry.sql](../../supabase/migrations/20260526100000_doc_retrieval_registry.sql) — already creates `carriers`, `doc_retrieval_runs`, `ams_targets`. **Do not re-create.**
- Modify: [backend/services/doc_retrieval/store.py](../../backend/services/doc_retrieval/store.py) — add `SupabaseStore` class with the same surface as the current JSON functions (`create_run`, `get_run`, `set_status`, `merge_metadata`, `run_blob_dir`). Reuse `services.supabase.get_supabase()`.
- Modify: [backend/services/doc_retrieval/registry.py](../../backend/services/doc_retrieval/registry.py) — add Supabase reads for `carriers` + `ams_targets`; keep the in-process registry as a fallback.
- Modify: `backend/config.py` — add `doc_retrieval_storage_backend: str = "supabase"`.
- Create: `backend/scripts/seed_registries.py` — seed Supabase with all 10 mock carriers (already defined in [registry.py](../../backend/services/doc_retrieval/registry.py)) + 5 AMS targets.

**Steps:**
1. Apply migration locally: `supabase db push` from repo root.
2. Implement `SupabaseStore` mirroring the JSON store's method surface.
3. Add the env-switched backend selector at the bottom of [store.py](../../backend/services/doc_retrieval/store.py).
4. `python -m scripts.seed_registries` from `backend/`.
5. Run a smoke retrieval to confirm Supabase is the source of truth.

**Acceptance:**
- `python -c "from services.doc_retrieval.store import get_run; print('ok')"` imports clean.
- `SELECT carrier_id FROM carriers;` returns ≥ 6 rows in the target Supabase.
- An e2e retrieval persists its run row to `doc_retrieval_runs` (verify with `SELECT id, status FROM doc_retrieval_runs ORDER BY created_at DESC LIMIT 1;`).

**Verify:**
```powershell
.\venv\Scripts\Activate.ps1
python -m scripts.seed_registries
python -c "from services.doc_retrieval.registry import list_carriers; print(len(list_carriers()))"
```

---

### FNF-565 — Verify in staging

**Status:** 📋 BLOCKED — needs user-provided staging branch name + Supabase creds.
**Closes epic(s):** FNF-346.
**Depends on:** FNF-564.

**Goal:** The Supabase migration + seed are applied to the staging Supabase, and the staging FastAPI service can read `carriers` rows.

**Files to touch:** none (operational only).

**Steps (once user provides creds):**
1. Push the feature branch into the user-provided staging branch.
2. SSH-tunnel into the Azure Supabase VM. Apply the migration: `psql -h localhost -U postgres -d postgres -f supabase/migrations/20260526100000_doc_retrieval_registry.sql`.
3. Point `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` at staging, run `python -m scripts.seed_registries`.
4. Hit `GET https://<staging-app-url>/api/health` → expect `200`.
5. From a logged-in admin session, hit `GET /api/admin/carriers` → expect 6+ rows.

**Acceptance:**
- Staging `carriers` table has all 6 mock carriers.
- Staging app boots clean.
- Admin user can list carriers via the staging UI.

**Verify:**
```bash
curl -H "Authorization: Bearer $STAGING_ADMIN_JWT" https://<staging-app-url>/api/admin/carriers | jq 'length'
```

**Fallback:** if staging not ready, treat as deferred checkpoint. Do not block downstream tasks.

---

### FNF-566 — Carrier config admin UI

**Status:** 🚧 partial — backend routes ✅ ([admin.py:212-234](../../backend/routers/admin.py#L212)), frontend page 📋.
**Closes epic(s):** FNF-340, FNF-341.
**Depends on:** FNF-564 (so the UI writes to Supabase, not the JSON registry).

**Goal:** An admin can list, create, edit, and delete carriers from `/admin/carriers` — including the JSON `listing_selector_spec`.

**Files to touch:**
- ✅ [backend/routers/admin.py](../../backend/routers/admin.py#L212-L234) — `GET/PUT/DELETE /admin/carriers` and `/admin/carriers/{carrier_id}` already exist with `Depends(require_admin)`.
- Modify: [frontend/lib/api.ts](../../frontend/lib/api.ts) — add `adminApi.carriers()`, `adminApi.upsertCarrier(id, body)`, `adminApi.deleteCarrier(id)`.
- Create: `frontend/app/(app)/admin/carriers/page.tsx` — table of carriers with Edit/Delete actions and a "+ New carrier" button. Mirror the pattern in [frontend/app/(app)/admin/pod-requests/page.tsx](../../frontend/app/(app)/admin/pod-requests/page.tsx).
- Create: `frontend/components/admin/CarrierEditDialog.tsx` — modal form. Scalar fields as `<input>`. `listing_selector_spec` as `<textarea>` with `JSON.parse` validation on submit. Reuse the dialog primitives already used by [frontend/components/admin/PodActivationRequests.tsx](../../frontend/components/admin/PodActivationRequests.tsx).

**Steps:**
1. Add the three `adminApi.*` functions in [lib/api.ts](../../frontend/lib/api.ts).
2. Build `page.tsx` — Card → Table → row actions, React Query for fetch + mutations, `useToast()` for feedback.
3. Build `CarrierEditDialog.tsx` — form state via React Hook Form (or whatever's already in use); inline JSON-parse error on the spec textarea.
4. Wire `<AdminGate>` (📋 from FNF-567) once available; until then, mirror the inline check in [admin/page.tsx](../../frontend/app/(app)/admin/page.tsx).

**Acceptance:**
- Non-admin `GET /api/admin/carriers` → 403.
- Admin `GET` → JSON array with all carriers.
- Admin edits `mock_travelers.hil_timeout_seconds` to 60 via the UI → next `GET` returns 60.
- Navigation to `/admin/carriers` for a non-admin redirects to `/`.

**Verify:**
```powershell
npx tsc --noEmit  # from frontend/
# In browser: log in as admin, navigate to /admin/carriers, edit a row, refresh, confirm persistence.
```

---

### FNF-567 — AMS settings panel + role gating

**Status:** 🚧 partial — backend routes ✅ ([admin.py:237-257](../../backend/routers/admin.py#L237)), `require_admin` ✅ ([auth/dependencies.py](../../backend/auth/dependencies.py)), frontend page 📋, shared `<AdminGate>` 📋.
**Closes epic(s):** FNF-341.
**Depends on:** FNF-564.

**Goal:** Admin-managed registry of AMS targets (mirror of carriers UI but for the destination side). Plus a shared `<AdminGate>` component so every admin page consistently rejects non-admins.

**Files to touch:**
- ✅ [backend/routers/admin.py](../../backend/routers/admin.py#L237-L257) — `GET/PUT/DELETE /admin/ams-targets` and `/admin/ams-targets/{ams_target_id}` already exist with `Depends(require_admin)`.
- Modify: [frontend/lib/api.ts](../../frontend/lib/api.ts) — add `adminApi.amsTargets()`, `upsertAmsTarget`, `deleteAmsTarget`.
- Create: `frontend/components/auth/AdminGate.tsx` — client component reading from the existing `useAuth()` hook in [frontend/contexts/AuthContext.tsx](../../frontend/contexts/AuthContext.tsx). If `!isAdmin && !loading`, call `router.replace("/")` and return `null`; else render children.
- Create: `frontend/app/(app)/admin/ams-targets/page.tsx`.
- Create: `frontend/components/admin/AmsTargetEditDialog.tsx` — connector-kind-aware form. When `connector_kind = "applied_epic"`, show Applied Epic fields; when `"hawksoft"`, show HawkSoft fields; etc. Default to a JSON textarea for `connector_config`.
- Modify: every page under `frontend/app/(app)/admin/` — wrap content in `<AdminGate>`. Replace the inline `useEffect` check in [admin/page.tsx](../../frontend/app/(app)/admin/page.tsx).
- Create: `backend/tests/test_admin_gating.py` — `TestClient` hits each `/admin/*` route with (a) no token → 401, (b) user-role JWT → 403, (c) admin-role JWT → 200.

**Steps:**
1. Build `AdminGate.tsx` first — every other admin page depends on it.
2. Add the three `adminApi.*` AMS functions.
3. Build the `ams-targets/page.tsx` mirroring the carriers page from FNF-566.
4. Build `AmsTargetEditDialog.tsx` with the connector-kind switch.
5. Retrofit `<AdminGate>` into existing admin pages.
6. Write `test_admin_gating.py`.

**Acceptance:**
- All `/admin/*` backend routes return 401 (no token), 403 (user JWT), 200/201 (admin JWT).
- Non-admin nav to any `/admin/*` page redirects within 500 ms.
- `pytest backend/tests/test_admin_gating.py` passes.
- `npx tsc --noEmit` clean.

**Verify:**
```powershell
cd backend; pytest tests/test_admin_gating.py -v
cd ../frontend; npx tsc --noEmit
```

---

### FNF-569 — Playwright login + navigation per site (6 sites)

**Status:** 🚧 partial — current adapter ([playwright_adapter.py](../../backend/services/doc_retrieval/playwright_adapter.py)) uses **httpx**, not Playwright. The ticket title calls for Playwright; swap-back is required.
**Closes epic(s):** FNF-345, FNF-346.
**Depends on:** mocks in [mock_carriers/](../../mock_carriers/).

**Why swap back:** real carrier portals will need JS execution; httpx is a v0 stopgap. The ticket title explicitly says Playwright. The Windows event-loop policy is already configured in [backend/run_server.py](../../backend/run_server.py), so Playwright subprocesses spawn correctly.

**Goal:** Rewrite the adapter to use `playwright.async_api`. All 6 mock carriers complete login → MFA → list → download → close.

**Files to touch:**
- Rewrite: [backend/services/doc_retrieval/playwright_adapter.py](../../backend/services/doc_retrieval/playwright_adapter.py) — replace `httpx.AsyncClient` with `async_playwright()`. Preserve the public entry `async def run_adapter(carrier, user_inputs, download_dir, on_mfa_required) -> list[DownloadedDoc]`.
- Reuse: [backend/services/doc_retrieval/mfa.py](../../backend/services/doc_retrieval/mfa.py) — Playwright-aware MFA solver (already exists; was sidelined by httpx variant). Wire it back in.
- Modify: [backend/services/doc_retrieval/registry.py](../../backend/services/doc_retrieval/registry.py) — confirm `listing_selector_spec` styles for all 6 carriers handle the 4 DOM personalities (attribute, column-index, iframe, paginated). Add column-index + iframe + paginated + CSRF branches in the adapter's `_scrape_listing`.
- Confirm: [mock_carriers/](../../mock_carriers/) has all 6 carriers (travelers, hartford, chubb, liberty, nationwide, progressive) running on ports 8001-8006. Add the 4 missing if not.
- Modify: `mock_carriers/scripts/start.ps1` (and `start.sh`) — launch all 6 uvicorn processes.

**Steps:**
1. **Don't delete the httpx adapter yet.** Rename it to `httpx_adapter.py` for reference; copy the public surface into the new Playwright adapter.
2. Implement Playwright `run_adapter` using `async with async_playwright() as p: browser = await p.chromium.launch(headless=True)`. One `BrowserContext` per run.
3. Cover 4 selector styles per the table in FNF-345.
4. Make sure the HIL hand-off (`on_mfa_required` callback) hands the `Page` (or `BrowserContext`) to the parked session — see FNF-562 for the resume side.
5. Once Playwright passes all 6 e2e tests, delete `httpx_adapter.py`.

**Acceptance:**
- All 6 mocks boot: `curl http://localhost:80{01..06}/login` returns 200.
- TOTP carriers (Travelers, Chubb, Progressive) and email_otp Hartford complete e2e: `status=completed`, ≥ 1 document downloaded.
- HIL carriers (Liberty, Nationwide) reach `status=awaiting_mfa` (FNF-562 closes the loop).

**Verify:**
```powershell
# Start all mocks (one PowerShell window):
.\mock_carriers\scripts\start.ps1
# In another window:
.\venv\Scripts\Activate.ps1
foreach ($c in @('mock_travelers','mock_chubb','mock_progressive','mock_hartford')) {
  python -m scripts.run_doc_retrieval_e2e --carrier $c --policy POL-2025-12345 --doc-type policy_renewal
}
```

---

### FNF-570 — Download handling + storage (Azure Blob)

**Status:** 📋 todo — downloads currently land at `backend/.run_store/runs/{run_id}/`.
**Closes epic(s):** FNF-345, FNF-346.
**Depends on:** FNF-569.

**Goal:** Downloaded PDFs land in Azure Blob Storage with signed-URL access. Local FS stays as a fallback when `AZURE_BLOB_CONNECTION_STRING` is unset (preserves local dev).

**Files to touch:**
- Create: `backend/services/storage/__init__.py` + `backend/services/storage/azure_blob.py` — wraps `azure.storage.blob.aio.BlobServiceClient`. Functions: `async upload_run_blob(run_id, filename, bytes) -> blob_url`, `signed_url(blob_url, ttl_seconds=3600) -> str`.
- Modify: `backend/config.py` — add `azure_blob_connection_string: str = ""`, `azure_blob_container: str = "doc-retrieval-runs"`.
- Modify: [backend/services/doc_retrieval/playwright_adapter.py](../../backend/services/doc_retrieval/playwright_adapter.py) `_download_one` — after the download lands locally, read bytes and upload to Azure Blob, set `DownloadedDoc.local_path` to the resulting blob URL.
- Modify: [backend/services/doc_retrieval/orchestrator.py](../../backend/services/doc_retrieval/orchestrator.py) — when summarizing, prefer blob URLs over local paths.
- Modify: [backend/requirements.txt](../../backend/requirements.txt) — add `azure-storage-blob==12.23.1`.

**Steps:**
1. Implement the Azure Blob wrapper. Use `aio` variant so it doesn't block the event loop.
2. Add the conditional path in `_download_one`: if connection string is set, upload; else keep local FS.
3. Wire `signed_url(...)` so the frontend can fetch the PDF.
4. Regression check: run an e2e with the env var unset → still completes locally.

**Acceptance:**
- With `AZURE_BLOB_CONNECTION_STRING` set, a run produces a blob at `https://<account>.blob.core.windows.net/doc-retrieval-runs/runs/{run_id}/<filename>.pdf`.
- `signed_url(...)` returns a URL that downloads the PDF when fetched.
- With no env var, the run still completes locally.

**Verify:**
```powershell
$env:AZURE_BLOB_CONNECTION_STRING="<dev-connection-string>"
python -m scripts.run_doc_retrieval_e2e --carrier mock_travelers --policy POL-2025-12345 --doc-type policy_renewal
# Inspect the run row's metadata.documents[].local_path — should be a blob URL.
```

---

### FNF-572 — Wire to retrieval API (frontend)

**Status:** 🚧 partial — backend `/agents/doc_retrieval_v0/*` routes ✅ ([agents.py](../../backend/routers/agents.py)); frontend `DocumentRetrievalUI.tsx` still renders hardcoded stub per sprint plan.
**Closes epic(s):** FNF-345, FNF-346.
**Depends on:** FNF-569 (so the API actually returns real data).

**Goal:** The pod UI's "Retrieve & Attach" button calls `POST /api/agents/doc_retrieval_v0/run`, polls `GET /runs/{run_id}` until terminal, and renders real `metadata.documents` instead of `parseRetrievalResult()` placeholder.

**Files to touch:**
- Modify: [frontend/lib/api.ts](../../frontend/lib/api.ts) — add `agentsApi.startDocRetrievalRun(body)`, `agentsApi.getDocRetrievalRun(runId)`.
- Modify: `frontend/components/playground/DocumentRetrievalUI.tsx`:
  - Replace `onRun` stub with a real handler.
  - Poll `getDocRetrievalRun(runId)` every 1500 ms until `status ∈ {completed, failed, awaiting_mfa}`.
  - On `awaiting_mfa`: mount `<MfaPromptDialog />` (📋 FNF-562) with `run.metadata.mfa_prompt`.
  - On `completed`: render `run.metadata.documents` (real shape from orchestrator's `_summarise` + adapter).
  - On `failed`: show toast with `run.error` + user-facing message from the error taxonomy.
  - Delete `parseRetrievalResult()` (dead code).
- Create: `frontend/lib/pollRun.ts` — generic `pollRun(runId, intervalMs, signal)` returning an async iterator of run states. Aborts on `AbortSignal`.

**Steps:**
1. Add the API functions.
2. Write `pollRun.ts` first (reusable utility).
3. Refactor `DocumentRetrievalUI.tsx` — keep the visual layout, swap data sources.
4. Add the `awaiting_mfa` branch (the actual modal lands in FNF-562; here just stub `<div>Awaiting MFA...</div>`).

**Acceptance:**
- Click "Retrieve & Attach" with carrier=mock_travelers, policy=POL-2025-12345, doc_type=policy_renewal → spinner → "Retrieved Documents" panel shows the real PDF name.
- No remaining references to `parseRetrievalResult` in `DocumentRetrievalUI.tsx`.
- `npx tsc --noEmit` clean.

**Verify:**
```powershell
cd frontend; npx tsc --noEmit
# Manual: open the pod UI in the browser, run a retrieval, verify the real PDF name appears.
```

---

### FNF-573 — Define event schema & error taxonomy

**Status:** ✅ done — both schemas are landed.
- Event schema: [backend/services/observability/events.py](../../backend/services/observability/events.py) — 8 lifecycle events, `Event` dataclass, `emit()` function.
- Error taxonomy: [backend/services/observability/errors.py](../../backend/services/observability/errors.py) — 7 error kinds, base `DocRetrievalError` + 6 subclasses with `kind`, `retryable`, `user_message`.
- Orchestrator emits events at every milestone: [orchestrator.py:48-156](../../backend/services/doc_retrieval/orchestrator.py#L48).
- Adapter raises typed errors: [playwright_adapter.py imports](../../backend/services/doc_retrieval/playwright_adapter.py#L25-L29).
- Migration column for error classification exists: [doc_retrieval_runs.error_kind + .retryable](../../supabase/migrations/20260526100000_doc_retrieval_registry.sql#L52-L54).

**Closes epic(s):** FNF-347.

**What still needs doing (rolls into FNF-574):**
- The `emit()` function logs via stdlib `logging`, not structlog. Swap in FNF-574.
- Once FNF-569 swaps in Playwright, make sure the new adapter raises the right typed errors (selector timeouts → `SelectorDriftError`, bad creds → `AuthFailedError`, network 5xx → `TransientError`, 429 → `RateLimitedError`).

**Verify:**
```powershell
python -c "from services.observability.events import Event, emit, EventName; print('events ok')"
python -c "from services.observability.errors import DocRetrievalError, TransientError, RateLimitedError, SelectorDriftError, AuthFailedError, MfaTimeoutError, UserActionRequiredError, FatalAdapterError; print('errors ok')"
```

---

### FNF-574 — Implement structured logging + error/retry handling

**Status:** 📋 todo — `structlog==24.4.0` and `tenacity==9.0.0` are in [requirements.txt](../../backend/requirements.txt) but neither is initialized.
**Closes epic(s):** FNF-347.
**Depends on:** FNF-573 (schema + taxonomy).

**Goal:** Replace stdlib `logging` + `print()` with structlog JSON output that carries `run_id`, `carrier_id`, `user_id`, `step`, `event_name`. Wrap retryable steps with tenacity's exponential backoff.

**Files to touch:**
- Create: `backend/services/observability/logging.py` — `configure_logging()` called from [backend/main.py](../../backend/main.py) startup. Use `structlog.processors.JSONRenderer()` in prod, `ConsoleRenderer(colors=True)` when `settings.app_env in {"dev","local"}`.
- Modify: [backend/services/observability/events.py](../../backend/services/observability/events.py) — `emit()` switches to `structlog.get_logger("doc_retrieval").info(event.name, **payload, run_id=..., carrier_id=...)`.
- Modify: [backend/services/doc_retrieval/orchestrator.py](../../backend/services/doc_retrieval/orchestrator.py) — bind run context at the top of `_execute_run`: `log = log.bind(run_id=run.id, carrier_id=run.carrier_id, user_id=run.user_id)`. Replace `print(...)` debugging with `log.debug(...)`.
- Modify: [backend/main.py](../../backend/main.py) — call `configure_logging()` in the startup event/lifespan.
- Create: `backend/services/observability/retry.py` — `@retry_doc_retrieval_step` decorator using tenacity:
  - `wait=tenacity.wait_exponential(multiplier=1, min=1, max=30)`
  - `stop=tenacity.stop_after_attempt(4)` (3 retries)
  - `retry=tenacity.retry_if_exception(lambda e: isinstance(e, DocRetrievalError) and e.retryable)`
  - `before_sleep=lambda rs: emit(Event(name="doc_retrieval.run.step_entered", ..., payload={"retry_count": rs.attempt_number}))`
- Modify: [backend/services/doc_retrieval/playwright_adapter.py](../../backend/services/doc_retrieval/playwright_adapter.py) — wrap each step function (`_authenticate`, `_scrape_listing`, `_download_one`) with `@retry_doc_retrieval_step`. Classify (`_classify`) and File (`_file`) are NOT retried in v1.

**Steps:**
1. Build `configure_logging()` first. Wire it in `main.py`. Run the server and confirm JSON log lines appear.
2. Switch `emit()` to structlog.
3. Replace `print(...)` calls in `orchestrator.py` with bound `log.debug(...)`.
4. Build `retry.py`. Apply the decorator to adapter step functions.
5. Inject a fake `TransientError` on the first download attempt to confirm retry → success path. Inject `SelectorDriftError` to confirm no-retry fast-fail.

**Acceptance:**
- An e2e run produces ≥ 8 structured JSON lines on stdout, each with `run_id`, `event`, `level`. Example:
  ```json
  {"event":"doc_retrieval.run.started","run_id":"abc-123","carrier_id":"mock_travelers","level":"info","timestamp":"2026-05-29T..."}
  ```
- Dev mode (`APP_ENV=dev`) shows colored, single-line console output with the same fields.
- Transient error injection: retries → second attempt completes → `status=completed`.
- Selector drift injection: zero retries → `status=failed`, `error_kind=selector_drift`.

**Verify:**
```powershell
$env:APP_ENV="prod"
python -m run_server  # runs once, captures stdout
# Greps for JSON-shape lines in stdout — every doc_retrieval.* line is valid JSON.
```

---

### FNF-562 — Captcha bypass + MFA/OTP HIL plugin integration

**Status:** 🚧 partial — TOTP auto-solve ✅ ([mfa_http.py](../../backend/services/doc_retrieval/mfa_http.py)), HIL parking ✅ ([hil_registry.py](../../backend/services/doc_retrieval/hil_registry.py)), orchestrator HIL callback ✅ ([orchestrator.py:159-206](../../backend/services/doc_retrieval/orchestrator.py#L159)). Captcha + email_link + email_otp flavors 🚧.
**Closes epic(s):** FNF-345, FNF-347.
**Depends on:** FNF-569 (Playwright adapter), FNF-572 (frontend polling), FNF-574 (logging).

**Goal:** Three HIL flavors work end-to-end against the mocks:
- **TOTP** (Travelers, Chubb, Progressive, etc.) — auto-solved, no broker input.
- **email_otp** (Hartford) — broker reads OTP from email, posts to `/runs/{run_id}/mfa-response`.
- **email_link** (Liberty) — magic link delivered to test-only endpoint; worker auto-navigates Playwright to it.
- **captcha_hil** (Nationwide) — captcha image surfaced to broker, broker submits text.

**Files to touch:**

*Mocks:*
- Confirm: [mock_carriers/](../../mock_carriers/) contains all 6 — Liberty (8004) serves a magic link, Nationwide (8005) renders a captcha image with the expected text baked in.
- Liberty: test-only endpoint `/__test__/last-email-link` returns the most recent magic-link URL.
- Nationwide: `/mfa` GET serves a PNG with the captcha text rendered as an image; `/mfa` POST verifies the text.

*Backend:*
- Modify: [backend/services/doc_retrieval/mfa_http.py](../../backend/services/doc_retrieval/mfa_http.py) — add handlers for `email_link`, `email_otp`, `captcha_hil`. Each returns `HilPending(prompt=MfaPrompt(...))` rather than a string code. Reuse the existing `HilPending` type.
- Modify: [backend/services/doc_retrieval/orchestrator.py:159-206](../../backend/services/doc_retrieval/orchestrator.py#L159) `_make_hil_callback` — already parks sessions and waits on resume. Make sure it works with the new prompt shapes (image_url for captcha, "check your email" copy for email_link/email_otp).
- Modify: [backend/routers/agents.py](../../backend/routers/agents.py) `POST /agents/doc_retrieval_v0/runs/{run_id}/mfa-response` — accept `{response: str}`, look up the parked session via [hil_registry.py](../../backend/services/doc_retrieval/hil_registry.py), call the handler with the response, set the resume event.

*Frontend:*
- Create: `frontend/components/playground/MfaPromptDialog.tsx` — branches on `prompt.kind`:
  - `email_link` → "Check your inbox at <email> and click the link. We'll resume automatically." (no broker input; worker auto-resumes.)
  - `email_otp` → "Enter the 6-digit code sent to <email>". Text input + Submit → POST `/mfa-response`.
  - `captcha_hil` → `<img src={prompt.image_url} />` + text input + Submit → POST `/mfa-response`.
- Wire from `DocumentRetrievalUI.tsx` (FNF-572): when poll observes `status=awaiting_mfa`, mount `<MfaPromptDialog prompt={run.metadata.mfa_prompt} runId={run.id} />`.

**Steps:**
1. Confirm mock_liberty and mock_nationwide are running and producing the right prompts.
2. Implement the 3 new MFA handlers in `mfa_http.py`. Each parks a `HilPending` with the right `prompt` payload.
3. Make sure the orchestrator's HIL callback persists the prompt to `runs.metadata.mfa_prompt` (already does).
4. Build `MfaPromptDialog.tsx`.
5. Run all 3 HIL flows end-to-end.

**Acceptance:**
- `mock_liberty` (email_link): orchestrator pauses → UI shows "check your inbox" → poll on the test-only endpoint auto-resumes → `status=completed`.
- `mock_hartford` (email_otp): orchestrator pauses → UI shows OTP input → broker submits the correct OTP from `/__test__/last-email-otp` → `status=completed`.
- `mock_nationwide` (captcha_hil): orchestrator pauses → UI shows captcha image → broker submits the correct text → `status=completed`.
- `runs.status` transitions for each: `running → awaiting_mfa → running → completed`. Events emit in order.

**Verify:**
```powershell
# 1. Start all 6 mocks.
.\mock_carriers\scripts\start.ps1
# 2. Run each HIL flow and observe in the browser.
python -m scripts.run_doc_retrieval_e2e --carrier mock_liberty --policy POL-2025-12345 --doc-type policy_renewal
python -m scripts.run_doc_retrieval_e2e --carrier mock_nationwide --policy POL-2025-12345 --doc-type policy_renewal
# 3. For Hartford, drive the OTP through the UI to exercise the manual response path.
```

**Risk:** parked Playwright sessions hold ~200 MB each. Single-user dev is fine; production concurrency cap is a follow-on sprint.

---

# End-to-end verification (run when the sprint closes)

From `backend/` with venv active and all 6 mocks running:

```powershell
$env:PYTHONIOENCODING="utf-8"
.\venv\Scripts\Activate.ps1

# 1. All 6 carriers seeded in Supabase
python -c "from services.doc_retrieval.registry import list_carriers; print([c.carrier_id for c in list_carriers()])"

# 2. Auto-MFA paths (TOTP + email_otp)
foreach ($c in @('mock_travelers','mock_chubb','mock_progressive','mock_hartford')) {
  python -m scripts.run_doc_retrieval_e2e --carrier $c --policy POL-2025-12345 --doc-type policy_renewal
}

# 3. HIL paths (Liberty email_link, Nationwide captcha_hil) — drive through the UI
#    Each should transition: running → awaiting_mfa → running → completed.

# 4. Backend boots clean
python -c "import main; print('routes:', len([r for r in main.app.routes if hasattr(r,'path')]))"

# 5. Structured logs visible
$env:APP_ENV="prod"; python -m run_server  # observe JSON log lines on a smoke retrieval

# 6. Frontend type-checks
cd ..\frontend; npx tsc --noEmit

# 7. Admin gating tests pass
cd ..\backend; pytest tests/test_admin_gating.py -v
```

Frontend smoke (against http://localhost:3000):
- Admin: navigate to `/admin/carriers` and `/admin/ams-targets`, edit a row, verify persistence in Supabase.
- Broker: open the Document Retrieval pod, run a TOTP carrier → real PDF in the result panel. Run a HIL carrier → modal appears → submit → run completes.

---

# Risks & known issues

| Risk | Mitigation |
|---|---|
| Staging branch/creds not ready (FNF-565 blocked) | Treat staging as a deferred checkpoint, not a blocker. Downstream tasks run locally against the Supabase migration applied via `supabase db push`. |
| Playwright swap-back breaks current httpx-based flows | Keep `httpx_adapter.py` as a fallback during the swap. Run the FNF-569 acceptance checks before deleting. |
| Parked Playwright sessions consume ~200 MB each (HIL) | Single-user dev is fine. Document the concurrency cap; production cap is a separate sprint. |
| Azure Blob requires a connection string | Code falls back to local FS when `AZURE_BLOB_CONNECTION_STRING` is empty. Preserves local dev. |
| structlog binding gotcha | `log.bind()` returns a new logger; assign back (`log = log.bind(...)`). Don't `log.bind(...)` for the side effect — common bug. |
| `email_otp` mocked but not exercised end-to-end in v0 | Hartford mock works; FNF-562 closes the loop. Trivial subclass of the HIL pattern. |
| Selector drift on the 4 newer mocks (chubb/liberty/nationwide/progressive) | Pin the selector_spec in `seed_registries.py` and treat the seed as the contract. |
