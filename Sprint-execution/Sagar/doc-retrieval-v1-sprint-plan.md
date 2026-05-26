# Sprint Plan — Doc Retrieval v1 (May 25 → May 30, 2026)

## Context

The Doc Retrieval pod is currently a working **v0 single-carrier loop**: orchestrator + generic Playwright adapter + TOTP MFA against the Travelers mock, with run state in a JSON store and downloaded PDFs on local disk. The architecture (see [doc_retrieval.md](doc_retrieval.md)) calls for: data-driven `carriers` registry + admin UI, AMS targets, role-gated surfaces, six carriers exercised, durable Azure Blob storage, two HIL MFA flavors (email_link, captcha_hil), Supabase-backed `runs` table wired to the UI button, and observability primitives (events, errors, structured logs, retries) so failures are diagnosable.

This sprint promotes Doc Retrieval to **v1**: 6 carriers, real registry-driven config, working HIL flows, Azure-Blob-persisted downloads, structured observability — verifiable end-to-end from the broker's "Retrieve & Attach" button to a filed document.

**Existing state Claude Code must not re-create** (sprint builds on these):
- Subpackage [backend/services/doc_retrieval/](../../backend/services/doc_retrieval/) (store, mfa, playwright_adapter, orchestrator)
- Migration [supabase/migrations/20260522100000_carriers_and_runs.sql](../../supabase/migrations/20260522100000_carriers_and_runs.sql)
- HTTP routes `POST /api/agents/doc_retrieval_v0/run` + `GET /api/agents/doc_retrieval_v0/runs/{run_id}` in [backend/routers/agents.py](../../backend/routers/agents.py)
- Mocks [mock-carriers/travelers/](../../mock-carriers/travelers/) (TOTP) + [mock-carriers/hartford/](../../mock-carriers/hartford/) (email_otp HIL)
- Frontend pod UI [frontend/components/playground/DocumentRetrievalUI.tsx](../../frontend/components/playground/DocumentRetrievalUI.tsx) with hardcoded sample output

---

## Sprint timeline

| # | Task | Start | Due | Depends on |
|---|---|---|---|---|
| 1 | Apply final defaults & migrate | May 25 | May 25 | — |
| 2 | Verify in staging | May 26 | May 26 | 1 + staging branch + creds (user-provided) |
| 3 | Carrier config admin UI | May 25 | May 26 | 1, 5 (gating pattern) |
| 4 | AMS settings panel | May 26 | May 27 | 1, 5 |
| 5 | Role gating & permissions | May 27 | May 27 | — (foundational) |
| 6 | Playwright login + navigation per site (6 sites) | May 25 | May 27 | — (mocks land in parallel) |
| 7 | Download handling & storage (Azure Blob) | May 28 | May 28 | 6 |
| 8 | Wire retrieval API to frontend | May 27 | May 28 | 1, 6 |
| 9 | Define event schema | May 28 | May 28 | — |
| 10 | Define error taxonomy | May 28 | May 29 | — |
| 11 | Structured logging implementation | May 29 | May 30 | 9, 10 |
| 12 | Captcha/MFA/OTP HIL integration (email_link + captcha_hil) | May 29 | May 30 | 8, 9, 11 |
| 13 | Retry handling | May 30 | May 30 | 10, 11 |

---

## Sprint conventions (READ FIRST)

- **Branch**: feature branch off `main`. **Staging branch name + creds are user-provided when ready** (see Task 2). Until that lands, treat "staging" steps as deferred checkpoints, not blockers.
- **Backend venv**: [backend/venv/](../../backend/venv/) — Python 3.11.9 with all deps installed (incl. `playwright==1.47.0`, `pyotp==2.9.0`).
- **New backend deps** added this sprint (append to [backend/requirements.txt](../../backend/requirements.txt)): `azure-storage-blob==12.23.1`, `structlog==24.4.0`, `tenacity==9.0.0`. Install with `pip install -r requirements.txt` after editing.
- **Frontend**: [frontend/node_modules/](../../frontend/node_modules/) is populated. Install policy: `npm install --no-audit --no-fund --maxsockets=1` (Windows Defender races otherwise — see prior session).
- **Auth gating**: every new admin route uses `Depends(require_admin)` (defined in [backend/auth/dependencies.py](../../backend/auth/dependencies.py)); every new admin page redirects on `!isAdmin` via the `useAuth()` hook in [frontend/contexts/AuthContext.tsx](../../frontend/contexts/AuthContext.tsx).
- **Acceptance**: no task is "done" until its **Verify** block runs green. Always run `tsc --noEmit` (frontend) and the Python import-sanity check (`python -c "import main"` from `backend/`) after each task that touches code.
- **Don't introduce**: `react-router-dom` (use `next/navigation`), `import.meta.env` (use `process.env.NEXT_PUBLIC_*`), webhooks, or any synchronous Playwright API. Use `playwright.async_api` to match existing code.

---

## Task 1 — Apply final defaults & migrate (May 25 → May 25)

**Goal**: The `carriers` + `doc_retrieval_runs` tables exist in the target Supabase, seeded with the 6 carrier rows the rest of the sprint depends on. The JSON store in [backend/services/doc_retrieval/store.py](../../backend/services/doc_retrieval/store.py) becomes a fallback for local-only runs; Supabase becomes the source of truth.

**Files**:
- Modify: [backend/services/doc_retrieval/store.py](../../backend/services/doc_retrieval/store.py) — add a `SupabaseStore` alongside `JsonStore` with the same interface; choose backend via `settings.doc_retrieval_storage_backend` (default `"supabase"`, fallback `"json"`).
- Modify: [backend/config.py](../../backend/config.py) — add `doc_retrieval_storage_backend: str = "supabase"`.
- Create: `backend/scripts/seed_all_carriers.py` — seeds all 6 carriers (mock_travelers, mock_hartford, mock_chubb, mock_liberty, mock_nationwide, mock_progressive). The 2 existing rows are upserted unchanged; the 4 new ones get carrier_id + login_url + selector_spec stubs that Task 6 fills in.

**Steps**:
1. Apply migration to the target Supabase. Local: `supabase db push` from repo root. Staging/prod: deferred to Task 2.
2. Implement `SupabaseStore` by writing the same methods (`get_carrier`, `upsert_carrier`, `get_connection`, `create_run`, `update_run`, `get_run`, `run_blob_dir`) against `sb.table("carriers")` / `sb.table("doc_retrieval_runs")` / `sb.table("carrier_connections")`. Reuse `services.supabase.get_supabase()`.
3. `run_blob_dir` stays local in v1; Task 7 swaps it for Azure Blob.
4. Run the seed script: `python -m scripts.seed_all_carriers` from `backend/`.

**Acceptance**:
- `python -c "from services.doc_retrieval.store import get_carrier; print(get_carrier('mock_travelers').carrier_id)"` from `backend/` prints `mock_travelers` and reads from Supabase (not JSON).
- `SELECT carrier_id FROM carriers;` (psql) returns all 6 carrier IDs.
- E2E test still passes: `python -m scripts.run_doc_retrieval_e2e --policy POL-2025-12345 --doc-type policy_renewal`.

---

## Task 2 — Verify in staging (May 26 → May 26)

**Status: BLOCKED on user-provided staging branch name + creds.**

**Goal**: The migration + seed are applied to the staging Supabase, and the staging FastAPI service can read `carriers` rows.

**Steps (once user provides branch name + creds)**:
1. Push the feature branch into the staging branch (name TBD).
2. Apply migration to staging Supabase: SSH-tunnel into the Azure VM per [doc_retrieval.md](doc_retrieval.md) (Access pattern section), run `psql -h localhost -U postgres -d postgres -f /path/to/20260522100000_carriers_and_runs.sql`.
3. Run `python -m scripts.seed_all_carriers` against the staging Supabase (point `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` at staging env).
4. Hit `GET https://<staging-app-url>/api/health` → expect `200 {"status":"ok"}`.
5. From a logged-in staging session, hit `GET /api/admin/carriers` → expect 6 rows.

**Acceptance**: staging `carriers` table has 6 rows, app boots, admin user can list carriers.

**Fallback if staging not ready by EOD May 25**: treat this as a deferred checkpoint. Do NOT block downstream tasks; they run locally.

---

## Task 3 — Carrier config admin UI (May 25 → May 26)

**Goal**: An admin can view, add, edit, and delete carrier rows in the `carriers` registry from the browser — including the JSON `listing_selector_spec`. This is the surface that drives the Playwright adapter at runtime.

**Files**:
- Modify: [backend/routers/admin.py](../../backend/routers/admin.py) — add `GET /admin/carriers`, `PUT /admin/carriers/{carrier_id}`, `DELETE /admin/carriers/{carrier_id}`. All `Depends(require_admin)`.
- Modify: [backend/models/schemas.py](../../backend/models/schemas.py) — add `CarrierRegistryUpsert(BaseModel)` with `carrier_id`, `name`, `login_url`, `auth_kind`, `mfa_kind`, `hil_timeout_seconds`, `listing_selector_spec: dict[str, Any]`, `is_mock: bool = False`.
- Modify: [frontend/lib/api.ts](../../frontend/lib/api.ts) — add `adminApi.carriers()`, `adminApi.upsertCarrier(id, body)`, `adminApi.deleteCarrier(id)`.
- Create: `frontend/app/(app)/admin/carriers/page.tsx` — table of carriers with Edit/Delete actions and a "+ New carrier" button.
- Create: `frontend/components/admin/CarrierEditDialog.tsx` — modal form: text inputs for scalar fields, native `<textarea>` for `listing_selector_spec` JSON (validated on save). Reuse the form patterns from [frontend/components/admin/PodActivationRequests.tsx](../../frontend/components/admin/PodActivationRequests.tsx).

**Steps**:
1. Backend routes first — they MUST return 403 for non-admins (verify with curl + non-admin JWT).
2. Frontend page mirrors the admin/pod-requests template: Card → Table → row actions, React Query + mutations, `useToast()` for feedback.
3. JSON editor: simple `<textarea>` with `JSON.parse` validation in the submit handler; show inline error on parse failure.

**Acceptance**:
- Non-admin GET `/api/admin/carriers` → 403.
- Admin GET → JSON array of 6 carriers.
- Admin POSTs an edit to `mock_travelers` (e.g., bump `hil_timeout_seconds` to 60) → returns updated row.
- `frontend/app/(app)/admin/carriers/page.tsx` renders the table at `http://localhost:3000/admin/carriers` for an admin and redirects non-admin to `/`.
- `npx tsc --noEmit` clean.

---

## Task 4 — AMS settings panel (May 26 → May 27)

**Goal**: Admin-managed registry of AMS targets (mirror of carriers registry but for the destination side). Distinct from the per-broker `ams_connections` already on [frontend/app/(app)/settings/page.tsx](../../frontend/app/(app)/settings/page.tsx).

**Files**:
- Create: `supabase/migrations/20260526100000_ams_targets.sql` — table `ams_targets (ams_target_id text PRIMARY KEY, name text, connector_kind text, connector_config jsonb, is_active bool, created_at, updated_at)` + trigger.
- Modify: [backend/routers/admin.py](../../backend/routers/admin.py) — `GET/PUT/DELETE /admin/ams-targets`.
- Modify: [backend/models/schemas.py](../../backend/models/schemas.py) — `AmsTargetUpsert`.
- Modify: [frontend/lib/api.ts](../../frontend/lib/api.ts) — `adminApi.amsTargets()`, `upsertAmsTarget`, `deleteAmsTarget`.
- Create: `frontend/app/(app)/admin/ams-targets/page.tsx` + `frontend/components/admin/AmsTargetEditDialog.tsx`.
- Seed: Add 5 AMS target rows to `backend/scripts/seed_all_carriers.py` (rename to `seed_registries.py` or split): Applied Epic, HawkSoft, AMS360, QQ Catalyst, EZLynx — each with `connector_kind="stub"` for v1.

**Acceptance**:
- Migration applies clean (`supabase db push`).
- 5 AMS targets seeded.
- Admin can create/edit/delete from `/admin/ams-targets`.

---

## Task 5 — Role gating & permissions (May 27 → May 27)

**Goal**: Every admin surface (backend route + frontend page) consistently rejects non-admins. Replace ad-hoc `useEffect`-redirect with a shared component so future surfaces inherit it.

**Files**:
- Create: `frontend/components/auth/AdminGate.tsx` — client component: if `!isAdmin && !loading`, calls `router.replace("/")` and returns `null`; otherwise renders children. Reads from [frontend/hooks/useUserRole.ts](../../frontend/hooks/useUserRole.ts).
- Modify: every page under `frontend/app/(app)/admin/` to wrap its content in `<AdminGate>`. Currently inline-checks live in [frontend/app/(app)/admin/page.tsx](../../frontend/app/(app)/admin/page.tsx); replace those.
- Audit: every route in [backend/routers/admin.py](../../backend/routers/admin.py) MUST declare `Depends(require_admin)`. The new Task 3/4 routes already use it; this task adds an assertion test.
- Create: `backend/tests/test_admin_gating.py` — small test using FastAPI `TestClient` that hits each `/admin/*` route with (a) no token → 401, (b) user-role token → 403, (c) admin-role token → 200.

**Acceptance**:
- All admin routes return 403 for non-admin and 200/201 for admin.
- All `/admin/*` frontend pages redirect non-admin within 500 ms of load.
- `pytest backend/tests/test_admin_gating.py` passes.

---

## Task 6 — Playwright login + navigation per site (6 sites) (May 25 → May 27)

**Goal**: All 6 mock carriers boot, present a login → MFA → documents → download flow that the existing generic Playwright adapter can drive via runtime-loaded `listing_selector_spec`. Adapter handles both **attribute-based** and **column-index-based** selector specs.

**6 sites and their DOM personalities**:

| Carrier | Port | MFA kind | DOM style | Selector spec style |
|---|---|---|---|---|
| Travelers | 8001 | totp_rfc6238 | Modern SPA, `data-testid` everywhere | Attribute-based (exists) |
| Hartford | 8002 | email_otp | Legacy table, no data-attrs | Column-index (build adapter support) |
| Chubb | 8003 | totp_rfc6238 | ARIA-first (selectors by role/name) | Attribute-based (`aria-label`) |
| Liberty Mutual | 8004 | email_link | SPA with content in iframe | Attribute-based, with `iframe_selector` |
| Nationwide | 8005 | captcha_hil | Server-rendered with CSRF hidden inputs | Attribute-based, requires extracting CSRF on POST |
| Progressive | 8006 | totp_rfc6238 | Modern, paginated document list (10 per page) | Attribute-based, with `next_page_selector` |

**Files**:
- Create 4 new mock subdirs mirroring [mock-carriers/travelers/](../../mock-carriers/travelers/) structure: `mock-carriers/{chubb,liberty,nationwide,progressive}/{main.py,templates/*.html}`. Reuse [mock-carriers/shared/](../../mock-carriers/shared/) for data + pdf + session.
- Modify: [mock-carriers/shared/data.py](../../mock-carriers/shared/data.py) — add 5 policies × 8 doc_types per carrier (use existing `_docs()` helper).
- Modify: [mock-carriers/scripts/start.ps1](../../mock-carriers/scripts/start.ps1) + `start.sh` — launch all 6 uvicorn processes on ports 8001-8006.
- Modify: [backend/services/doc_retrieval/playwright_adapter.py](../../backend/services/doc_retrieval/playwright_adapter.py) — add:
  - Column-index scrape variant: if spec has `doc_policy_col` instead of `doc_policy_attr`, walk `<td>` cells by index. Branch in `_scrape_listing`.
  - iframe support: if spec has `iframe_selector`, `frame = await page.frame_locator(spec["iframe_selector"])` and run document scrape inside that frame.
  - CSRF support: if spec has `csrf_input`, extract its `value` after the login GET and include in the POST body.
  - Pagination: if spec has `next_page_selector`, loop click + scrape until selector is hidden or doc count plateaus.
- Update seed: `backend/scripts/seed_all_carriers.py` — populate `listing_selector_spec` for all 6 with the new shapes.

**Acceptance**:
- `mock-carriers/scripts/start.ps1` launches all 6 mocks; `curl http://localhost:80{01..06}/login` all return 200.
- The e2e test runs against each: `python -m scripts.run_doc_retrieval_e2e --carrier mock_chubb --policy POL-2025-12345 --doc-type policy_renewal` returns `status=completed`, `downloaded_count >= 1`. Adapter MFA layer can call into the registry for any of `totp_rfc6238` / `email_otp` (HIL handled in Task 12).
- For carriers whose mfa_kind is HIL (Liberty=email_link, Nationwide=captcha_hil), the e2e test halts at `runs.status = awaiting_mfa` — that's expected; Task 12 closes the loop.

---

## Task 7 — Download handling & storage (Azure Blob) (May 28 → May 28)

**Goal**: Downloaded PDFs land in Azure Blob Storage instead of local FS, with a signed-URL accessible to the frontend.

**Files**:
- Create: `backend/services/storage/__init__.py` + `backend/services/storage/azure_blob.py` — wrapper around `azure.storage.blob.aio.BlobServiceClient`. Functions: `upload_run_blob(run_id, filename, bytes) -> blob_url`, `signed_url(blob_url, ttl_seconds=3600) -> str`.
- Modify: [backend/config.py](../../backend/config.py) — add `azure_blob_connection_string: str = ""`, `azure_blob_container: str = "doc-retrieval-runs"`.
- Modify: [backend/services/doc_retrieval/playwright_adapter.py](../../backend/services/doc_retrieval/playwright_adapter.py) `_download_one` — after `download.save_as(...)`, read bytes and upload via `azure_blob.upload_run_blob(...)`, set `DownloadedDoc.local_path` to the resulting blob URL.
- Modify: [backend/services/doc_retrieval/orchestrator.py](../../backend/services/doc_retrieval/orchestrator.py) — `storage_path` on the run becomes the Azure container prefix `runs/{run_id}/`.
- Modify: [backend/requirements.txt](../../backend/requirements.txt) — add `azure-storage-blob==12.23.1`.
- Fallback: if `azure_blob_connection_string` is empty, keep using the existing local FS path. Log a warning. This lets local dev still work without Azure creds.

**Acceptance**:
- With `AZURE_BLOB_CONNECTION_STRING` set, an e2e run produces a blob at `https://<account>.blob.core.windows.net/doc-retrieval-runs/runs/{run_id}/POL-2025-12345_Renewal_Notice.pdf`.
- `azure_blob.signed_url(...)` returns a URL that downloads the PDF when fetched.
- With no env var, the run still completes locally (regression check).

---

## Task 8 — Wire retrieval API to frontend (May 27 → May 28)

**Goal**: The pod UI's "Retrieve & Attach" button calls `POST /api/agents/doc_retrieval_v0/run`, then polls `GET /api/agents/doc_retrieval_v0/runs/{run_id}` until terminal, then renders real result data — replacing the hardcoded `parseRetrievalResult()` placeholder.

**Files**:
- Modify: [frontend/lib/api.ts](../../frontend/lib/api.ts) — add `agentsApi.startDocRetrievalRun(body)`, `agentsApi.getDocRetrievalRun(runId)`.
- Modify: [frontend/components/playground/DocumentRetrievalUI.tsx](../../frontend/components/playground/DocumentRetrievalUI.tsx):
  - Replace the `onRun` placeholder mechanism with a real handler that calls `startDocRetrievalRun`, stores `run_id`, polls `getDocRetrievalRun` every 1500 ms until `status in {"completed","failed","awaiting_mfa"}`.
  - On `awaiting_mfa`: open a dialog with the MFA prompt (Task 12 builds the dialog body; here just stub `<div>Awaiting MFA...</div>`).
  - On `completed`: render `run.metadata.documents` (real shape from orchestrator) instead of `parseRetrievalResult` hardcoded data. Keep visual layout unchanged.
  - On `failed`: show toast with `run.error`.
- Polling helper: `frontend/lib/pollRun.ts` — generic `pollRun(runId, intervalMs, signal)` returning an async iterator of run states. Aborts on `AbortSignal`.

**Acceptance**:
- Click "Retrieve & Attach" with carrier=mock_travelers, policy=POL-2025-12345, doc_type=policy_renewal → spinner → "Retrieved Documents" panel shows the real PDF name from the run.
- No remaining references to `parseRetrievalResult` in `DocumentRetrievalUI.tsx` (it's dead code; delete it).
- `tsc --noEmit` clean.

---

## Task 9 — Define event schema (May 28 → May 28)

**Goal**: Lifecycle events for a run are emitted with a stable shape so downstream (notifications, Mailbox, audit log) can subscribe without coupling to internal orchestrator state.

**Files**:
- Create: `backend/services/observability/__init__.py` + `backend/services/observability/events.py`. Define:
  ```python
  EventName = Literal[
      "doc_retrieval.run.queued",
      "doc_retrieval.run.started",
      "doc_retrieval.run.step_entered",
      "doc_retrieval.run.mfa_required",
      "doc_retrieval.run.mfa_resolved",
      "doc_retrieval.run.document_downloaded",
      "doc_retrieval.run.completed",
      "doc_retrieval.run.failed",
  ]

  @dataclass
  class Event:
      name: EventName
      run_id: str
      user_id: str
      carrier_id: str
      timestamp: str  # ISO-8601 UTC
      payload: dict[str, Any]  # event-specific
  ```
- Document each event's `payload` shape in a docstring table at the top of the file (one row per event name, what keys carry what values).
- Add `emit(event: Event) -> None` — for v1, writes to Python `logging` at INFO (Task 11 swaps it for structured logs). NO DB writes from this function; persistence comes in a later sprint.
- Modify: [backend/services/doc_retrieval/orchestrator.py](../../backend/services/doc_retrieval/orchestrator.py) — emit `run.queued` in the HTTP handler, `run.started` / `run.step_entered` / `run.completed` / `run.failed` in `execute_run`. Emit `run.mfa_required` on entering `awaiting_mfa` and `run.mfa_resolved` on exit.

**Acceptance**:
- One run emits at least: queued → started → step_entered (×6) → document_downloaded (×N) → completed. Visible in log output.
- `from services.observability.events import emit, Event, EventName` imports cleanly.

---

## Task 10 — Define error taxonomy (May 28 → May 29)

**Goal**: Failures categorized so retry policy (Task 13), UI messaging, and on-call triage all share a single vocabulary.

**Files**:
- Create: `backend/services/observability/errors.py`:
  ```python
  class DocRetrievalError(Exception):
      kind: Literal["transient","fatal","user_action_required","mfa_timeout","rate_limited","selector_drift","auth_failed"]
      retryable: bool
      user_message: str  # shown to broker
      ...
  ```
- Subclasses with appropriate defaults:
  - `TransientError(retryable=True, kind="transient")` — network blips, 5xx
  - `RateLimitedError(retryable=True, kind="rate_limited")` — carrier returned 429 or known throttle page
  - `SelectorDriftError(retryable=False, kind="selector_drift")` — `listing_selector_spec` doesn't match the live page
  - `AuthFailedError(retryable=False, kind="auth_failed")` — bad creds
  - `MfaTimeoutError(retryable=False, kind="mfa_timeout")` — HIL didn't respond before `hil_timeout_seconds`
  - `UserActionRequiredError(retryable=False, kind="user_action_required")` — broker must reconfigure carrier connection
  - `FatalAdapterError(retryable=False, kind="fatal")` — anything else
- Modify: [backend/services/doc_retrieval/playwright_adapter.py](../../backend/services/doc_retrieval/playwright_adapter.py) — raise typed errors at the right points (e.g., timeout on `wait_for_selector` → `SelectorDriftError`; login form submission with bad creds → `AuthFailedError`).
- Modify: [backend/services/doc_retrieval/orchestrator.py](../../backend/services/doc_retrieval/orchestrator.py) — catch typed errors and persist `error_kind`, `retryable`, `user_message` on the run row. Add migration if needed for extra columns on `doc_retrieval_runs`.

**Acceptance**:
- Force a selector drift (e.g., point the mock at a wrong selector) → run ends `status=failed` with `error_kind="selector_drift"`, `retryable=false`.
- Force a network error during download → run ends with `error_kind="transient"`, `retryable=true`.
- `pytest` covers each error class is raised from the right adapter codepath.

---

## Task 11 — Structured logging implementation (May 29 → May 30)

**Goal**: Replace ad-hoc `logging.exception(...)` and `print(...)` with structlog JSON output that carries `run_id`, `carrier_id`, `user_id`, `step`, `event_name` on every line. Easy to ship to Azure Log Analytics later.

**Files**:
- Modify: [backend/requirements.txt](../../backend/requirements.txt) — add `structlog==24.4.0`.
- Create: `backend/services/observability/logging.py` — `configure_logging()` called from [backend/main.py](../../backend/main.py) startup. Uses `structlog.processors.JSONRenderer()` in prod, `ConsoleRenderer(colors=True)` when `settings.app_env in {"dev","local"}`.
- Modify: `backend/services/observability/events.py` — `emit()` switches from plain `logging` to `structlog.get_logger("doc_retrieval").info(event.name, **event.payload, run_id=...)`.
- Modify: every `logging.getLogger(__name__)` call in `backend/services/doc_retrieval/` to use `structlog.get_logger(...)` instead. Bind run context at the top of `execute_run` so all child loggers carry `run_id` automatically (`log = log.bind(run_id=..., carrier_id=...)`).

**Acceptance**:
- An e2e run produces ≥ 8 JSON lines on stdout in prod-mode, each with `run_id`, `event`, `level`. Example:
  ```
  {"event":"doc_retrieval.run.started","run_id":"abc-123","carrier_id":"mock_travelers","level":"info","timestamp":"2026-05-29T..."}
  ```
- Dev-mode shows colored, single-line console output with same fields.

---

## Task 12 — Captcha/MFA/OTP HIL integration (email_link + captcha_hil) (May 29 → May 30)

**Goal**: The two hardest HIL flavors work end-to-end. Worker parks the Playwright session, posts a prompt event, UI shows a modal with the prompt (image for captcha, "check your email" for email_link), broker submits a response, worker resumes Playwright in the SAME session.

**Files**:

*Mock-side support (extends Task 6 mocks):*
- Modify: [mock-carriers/liberty/main.py](../../mock-carriers/liberty/main.py) (created in Task 6) — `mfa_kind=email_link`. After login, send a magic-link URL to `/__test__/last-email-link` (test-only endpoint). The link is `http://localhost:8004/mfa/confirm?token=...`. The worker must navigate Playwright to that token URL.
- Modify: [mock-carriers/nationwide/main.py](../../mock-carriers/nationwide/main.py) — `mfa_kind=captcha_hil`. After login, serve a captcha image at `/mfa` (use a tiny PNG generator — render the expected text in a static colored PNG); POST `/mfa` with the text resolves the challenge.

*Backend orchestrator:*
- Modify: [backend/services/doc_retrieval/mfa.py](../../backend/services/doc_retrieval/mfa.py) — add `email_link` and `captcha_hil` handlers. Each returns `HilPending(prompt_payload)` instead of a string code. Add a new union type `MfaResult = str | HilPending`.
- Modify: [backend/services/doc_retrieval/orchestrator.py](../../backend/services/doc_retrieval/orchestrator.py): when `solve(...)` returns `HilPending`, set `runs.status=awaiting_mfa`, persist `runs.metadata.mfa_prompt = prompt_payload`, emit `mfa_required` event, **park the Playwright session in memory** (keep `BrowserContext` alive in a process-local registry keyed by `run_id`), return. The background task ends here.
- Create: `backend/services/doc_retrieval/hil_registry.py` — in-process dict `{run_id: (BrowserContext, Page, asyncio.Event)}` with TTL = `carriers.hil_timeout_seconds`. Background watcher fires `MfaTimeoutError` on expiry.
- Add route: `POST /api/agents/doc_retrieval_v0/runs/{run_id}/mfa-response` in [backend/routers/agents.py](../../backend/routers/agents.py) — accepts `{response: str}`. Looks up the parked session, completes the MFA step in Playwright (for `email_link`: navigate the existing page to the token URL; for `captcha_hil`: fill the captcha input + submit), then resumes the orchestrator at the post-MFA step via `asyncio.Event.set()`.

*Frontend HIL modal:*
- Create: `frontend/components/playground/MfaPromptDialog.tsx` — given a `prompt_payload`, renders:
  - For `email_link`: "Check your inbox at <email> and click the link. We'll resume automatically." with a poll on `/runs/{run_id}` (no broker input needed beyond clicking — the WORKER drives the URL nav).
  - For `captcha_hil`: shows the captcha image (`<img src={prompt_payload.image_url} />`) + text input + Submit button. Submit POSTs to `/runs/{run_id}/mfa-response`.
- Modify: [frontend/components/playground/DocumentRetrievalUI.tsx](../../frontend/components/playground/DocumentRetrievalUI.tsx) — when poll observes `status="awaiting_mfa"`, mount `<MfaPromptDialog />` with the run's prompt_payload.

**Acceptance**:
- Run against `mock_liberty` (email_link): orchestrator pauses, UI shows the email-link prompt, posting `{response: ""}` to the mfa-response endpoint (or letting the worker auto-poll the test-only endpoint) resolves the MFA, run completes.
- Run against `mock_nationwide` (captcha_hil): orchestrator pauses, UI shows the captcha image, broker submits the correct text, run completes.
- `runs.status` transitions: `running → awaiting_mfa → running → completed`. Events emitted in correct order.

**Risk**: parked sessions hold ~200 MB each per [doc_retrieval.md](doc_retrieval.md) (email_link polling spec section). For local dev / one user that's fine. Production concurrency cap is a separate sprint.

---

## Task 13 — Retry handling (May 30 → May 30)

**Goal**: Retryable errors (transient, rate_limited) retry with exponential backoff. Non-retryable errors fail fast. All retries logged as events.

**Files**:
- Modify: [backend/requirements.txt](../../backend/requirements.txt) — add `tenacity==9.0.0`.
- Create: `backend/services/observability/retry.py` — `@retry_doc_retrieval_step` decorator:
  - `wait=tenacity.wait_exponential(multiplier=1, min=1, max=30)`
  - `stop=tenacity.stop_after_attempt(4)` (so 3 retries total)
  - `retry=tenacity.retry_if_exception(lambda e: isinstance(e, DocRetrievalError) and e.retryable)`
  - `before_sleep=lambda rs: emit_event("doc_retrieval.run.step_entered", ...retry_count=rs.attempt_number)`
- Modify: [backend/services/doc_retrieval/orchestrator.py](../../backend/services/doc_retrieval/orchestrator.py) — wrap each step (Authenticate, List, Filter, Download) with the retry decorator. Classify + File are NOT retried in v1.

**Acceptance**:
- Inject a `TransientError` on the first call to the download step (mock the failure once) → adapter retries, second attempt succeeds, run ends `status=completed`. Event log shows `step_entered` with `retry_count=2`.
- Inject a `SelectorDriftError` → no retries, run ends `status=failed`, single `step_entered` event.

---

## End-to-end verification (run this when the sprint closes)

From `backend/` with venv active and mocks running:

```powershell
$env:PYTHONIOENCODING="utf-8"
.\venv\Scripts\Activate.ps1

# 1. All 6 carriers seeded
python -c "from services.doc_retrieval import store; [print(store.get_carrier(c).carrier_id) for c in ['mock_travelers','mock_hartford','mock_chubb','mock_liberty','mock_nationwide','mock_progressive']]"

# 2. Auto-solve MFA paths (4 carriers)
foreach ($c in @('mock_travelers','mock_chubb','mock_progressive')) {
  python -m scripts.run_doc_retrieval_e2e --carrier $c --policy POL-2025-12345 --doc-type policy_renewal
}

# 3. Hartford email_otp HIL — exits at awaiting_mfa, then external POST to /mfa-response, then completes
# 4. Liberty email_link HIL — same shape with auto-poll
# 5. Nationwide captcha_hil — same shape with broker input

# 6. Backend boots cleanly
python -c "import main; print('routes:', len([r for r in main.app.routes if hasattr(r,'path')]))"

# 7. Frontend type-checks
cd ..\frontend; npx tsc --noEmit
```

Frontend smoke (against http://localhost:3000):
- Admin: navigate to `/admin/carriers` and `/admin/ams-targets` — edit a row, verify persistence.
- Broker: navigate to the Document Retrieval pod, pick a carrier+policy, click "Retrieve & Attach" → real PDF rendered. Pick a HIL carrier → modal appears → submit response → run completes.

---

## Risks & known issues

| Risk | Mitigation |
|---|---|
| Staging branch/creds not ready by May 25 EOD | Task 2 is deferred to a checkpoint, not a blocker. Downstream tasks run locally against Supabase / local mocks. |
| Parked Playwright sessions consume ~200 MB each (HIL) | Single-user dev is fine; document the concurrency cap for the production sprint. |
| Azure Blob requires connection string | Code falls back to local FS when `AZURE_BLOB_CONNECTION_STRING` is empty — preserves local dev. |
| `email_otp` NOT in this sprint's MFA scope per user choice (only email_link + captcha_hil) | Hartford mock keeps working with `mfa_kind=email_otp` but its end-to-end loop is left unfinished. Add `email_otp` handler in a fast-follow if the Hartford path needs to close — it's a trivial subclass of the HIL pattern. |
| Selector drift on the 4 new mocks | Each mock controls its own DOM, so this is only a risk if the mock templates change later. Pin the selector_spec in seed_registries.py and treat the seed file as the contract. |
| structlog binding gotcha | `log.bind()` returns a new logger; assign back (`log = log.bind(...)`). Don't `log.bind(...)` for the side effect — common bug. |
