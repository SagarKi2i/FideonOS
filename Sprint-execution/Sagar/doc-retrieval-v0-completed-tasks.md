# Doc Retrieval v0 — Completed Tasks Ledger

> **Snapshot as of 2026-05-22.** Backward-looking record of every task that produced Doc Retrieval v0. Pair with [doc-retrieval-v1-sprint-plan.md](doc-retrieval-v1-sprint-plan.md) (forward-looking) and [doc_retrieval.md](doc_retrieval.md) (architecture reference).

---

## Purpose & how to reuse this

This ledger captures the **tasks** that built the v0 single-carrier loop — mocks, backend subpackage, migration, HTTP routes, dev-env setup, and frontend import repair. Each task block has the same four fields so you can:

- **Resume** work after a break (snapshot tells you what's already done)
- **Replay** a task on a fresh checkout or a new machine (Replay block has the exact commands)
- **Reuse** a pattern in a new agent of similar shape (Reuse block tells you when to apply it)
- **Onboard** a teammate without rebuilding context (everything has file paths + verification commands)

Read this **after** [doc_retrieval.md](doc_retrieval.md) (which describes the target architecture); this ledger only describes what's been built so far, not what should exist.

---

## Snapshot

| # | Task | Status | Key file(s) | One-line replay |
|---|---|---|---|---|
| 1 | Mock carrier portals (Travelers + Hartford) | ✅ Done | [mock-carriers/](../../mock-carriers/) | `mock-carriers\scripts\start.ps1` |
| 2 | Backend `doc_retrieval` subpackage | ✅ Done | [backend/services/doc_retrieval/](../../backend/services/doc_retrieval/) | `python -m scripts.run_doc_retrieval_e2e` |
| 3 | Supabase migration for carriers + runs | ✅ Written, not applied | [20260522100000_carriers_and_runs.sql](../../supabase/migrations/20260522100000_carriers_and_runs.sql) | `supabase db push` (when staging ready) |
| 4 | HTTP routes for run + status | ✅ Done | [backend/routers/agents.py](../../backend/routers/agents.py) | `POST /api/agents/doc_retrieval_v0/run` |
| 5 | Seed + e2e scripts | ✅ Done | [backend/scripts/](../../backend/scripts/) | `python -m scripts.seed_mock_carriers` |
| 6 | Python 3.11 env setup | ✅ Done | `backend/venv/`, `mock-carriers/venv/` | See "Dev-environment recipe" below |
| 7 | Backend Settings strict-mode fix | ✅ Done | [backend/config.py](../../backend/config.py) | `python -c "import main"` (must succeed) |
| 8 | Frontend import repair | ✅ Done | (multiple — see Task 8) | `npx tsc --noEmit` (0 TS2307 errors) |
| 9 | v1 sprint plan written | ✅ Done | [doc-retrieval-v1-sprint-plan.md](doc-retrieval-v1-sprint-plan.md) | — |

---

## Tasks completed

### Task 1 — Mock carrier portals (Travelers + Hartford)

**Goal**: Provide two locally-runnable carrier broker portals with intentionally different DOM shapes so the generic Playwright adapter can be developed and tested without hitting real carrier sites.

**Files touched**:
- [mock-carriers/requirements.txt](../../mock-carriers/requirements.txt)
- [mock-carriers/shared/data.py](../../mock-carriers/shared/data.py), [pdf.py](../../mock-carriers/shared/pdf.py), [session.py](../../mock-carriers/shared/session.py)
- [mock-carriers/travelers/main.py](../../mock-carriers/travelers/main.py), [totp.py](../../mock-carriers/travelers/totp.py), templates
- [mock-carriers/hartford/main.py](../../mock-carriers/hartford/main.py), [email_otp.py](../../mock-carriers/hartford/email_otp.py), templates

**Acceptance met**:
- `Invoke-WebRequest http://localhost:8001/login` → 200
- `Invoke-WebRequest http://localhost:8002/login` → 200
- Manual login → MFA → docs → download confirmed on both portals; PDF magic bytes verified as `%PDF`

**Replay**:
```powershell
py -3.11 -m venv mock-carriers\venv
mock-carriers\venv\Scripts\python.exe -m pip install -r mock-carriers\requirements.txt
Start-Process -NoNewWindow mock-carriers\venv\Scripts\python.exe -ArgumentList "-m","uvicorn","travelers.main:app","--port","8001" -WorkingDirectory mock-carriers
Start-Process -NoNewWindow mock-carriers\venv\Scripts\python.exe -ArgumentList "-m","uvicorn","hartford.main:app","--port","8002" -WorkingDirectory mock-carriers
```

**Reuse**: This is the **mock vendor portal scaffold** pattern. Copy `mock-carriers/travelers/` to a new subdir whenever a new agent needs a browser-driven target portal — change the templates and the `data.py` fixtures, leave the FastAPI/Jinja2/session plumbing alone.

---

### Task 2 — Backend `doc_retrieval` subpackage

**Goal**: A standalone Python subpackage (depends only on `playwright` + `pyotp`) that implements the 6-step orchestrator pipeline + generic Playwright adapter + MFA registry described in [doc_retrieval.md](doc_retrieval.md).

**Files touched** (all new):
- [backend/services/doc_retrieval/__init__.py](../../backend/services/doc_retrieval/__init__.py)
- [backend/services/doc_retrieval/store.py](../../backend/services/doc_retrieval/store.py) — JSON-backed `Carrier`, `CarrierConnection`, `Run` repos
- [backend/services/doc_retrieval/mfa.py](../../backend/services/doc_retrieval/mfa.py) — MFA Plugin Registry, ships `totp_rfc6238`
- [backend/services/doc_retrieval/playwright_adapter.py](../../backend/services/doc_retrieval/playwright_adapter.py) — generic adapter driven by `listing_selector_spec`
- [backend/services/doc_retrieval/orchestrator.py](../../backend/services/doc_retrieval/orchestrator.py) — 6-step pipeline with status transitions

**Acceptance met**:
- `python -c "from services.doc_retrieval import store, mfa, playwright_adapter, orchestrator"` succeeds in `backend/venv`
- E2E run against Travelers mock: `status=completed`, `downloaded_count=1`, file on disk with `%PDF` magic
- Filter tests pass: policy-only (8 docs), insured+doc_type (1 doc), policy+doc_type (1 doc)

**Replay**:
```powershell
# Assumes Task 1 mocks are running on 8001/8002.
cd backend
.\venv\Scripts\Activate.ps1
python -m scripts.seed_mock_carriers
python -m scripts.run_doc_retrieval_e2e --policy POL-2025-12345 --doc-type policy_renewal
```

**Reuse**: This is the **agent subpackage shape** — `store.py` + `mfa.py` (or equivalent plug-registry) + `<vendor>_adapter.py` + `orchestrator.py`. Any agent that drives an external system through pluggable handlers should follow this layout. The standalone-deps property (no FastAPI/supabase at module load) makes the subpackage testable without booting the API.

---

### Task 3 — Supabase migration for `carriers` + `doc_retrieval_runs`

**Goal**: Canonical schema for the data-driven carrier registry + per-run state table the orchestrator and adapter read. Mirrors the architecture's `carriers` and `runs` tables.

**Files touched**:
- [supabase/migrations/20260522100000_carriers_and_runs.sql](../../supabase/migrations/20260522100000_carriers_and_runs.sql) — creates `carriers`, `doc_retrieval_runs`, ensures `carrier_connections.extra` column exists, adds `updated_at` trigger

**Acceptance met**:
- Migration file syntactically valid SQL (visual review — not yet applied to staging)
- The current JSON store (Task 2) matches the table column shapes 1:1, so the swap-in later is mechanical

**Replay**:
```powershell
# Local Supabase (when set up):
supabase db push

# Staging (per the v1 sprint plan, Task 2):
# Requires SSH tunnel to Azure VM Supabase + user-provided staging creds.
# psql -h localhost -U postgres -d postgres -f supabase/migrations/20260522100000_carriers_and_runs.sql
```

**Reuse**: For any new data-driven agent registry — create one migration that pairs the **registry table** (carriers-like, per-tenant config) with the **runs table** (per-execution state). Use `jsonb` for adapter selector specs so adding a new vendor is INSERT-only.

---

### Task 4 — HTTP routes for run + status

**Goal**: A broker-callable run endpoint that returns 202 + run_id immediately, plus a status-poll endpoint, plus a Pydantic schema set.

**Files touched**:
- [backend/routers/agents.py](../../backend/routers/agents.py) — added `POST /api/agents/doc_retrieval_v0/run` and `GET /api/agents/doc_retrieval_v0/runs/{run_id}` (with `BackgroundTasks` for async execution)
- [backend/models/schemas.py](../../backend/models/schemas.py) — added `DocRetrievalRunRequest`, `DocRetrievalRunResponse`

**Acceptance met**:
- `python -c "import main; print(len([r for r in main.app.routes if hasattr(r,'path')]))"` → 73 routes (includes the new two)
- Route accepts a JSON body with `carrier_id`, `attach_to`, `doc_type`, `policy_number`, `insured_name`; returns `{run_id, status}`
- 400 on unknown `carrier_id`, 400 if no `carrier_connection` for the user
- Status endpoint requires JWT (`get_current_user_id`); 404 on cross-user lookup

**Replay**:
```powershell
# With backend running on :8000:
$body = '{"carrier_id":"mock_travelers","attach_to":"policy","doc_type":"policy_renewal","policy_number":"POL-2025-12345"}'
curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d $body http://localhost:8000/api/agents/doc_retrieval_v0/run
```

**Reuse**: For any new long-running agent: return 202 + run_id, do real work via `BackgroundTasks` against the same orchestrator function the test script calls directly. Lets you ship the HTTP veneer and the test path on the same code without queue infra.

---

### Task 5 — Seed + end-to-end test scripts

**Goal**: One-command seeding of the JSON store with mock_travelers carrier + dev broker connection, plus a CLI that runs the full pipeline against a live mock and prints downloaded artifacts.

**Files touched**:
- [backend/scripts/seed_mock_carriers.py](../../backend/scripts/seed_mock_carriers.py) — upserts Travelers row + TOTP-seeded connection
- [backend/scripts/run_doc_retrieval_e2e.py](../../backend/scripts/run_doc_retrieval_e2e.py) — argparse CLI: `--policy`, `--insured`, `--doc-type`, `--headed`. Calls orchestrator directly (no JWT)
- [backend/scripts/__init__.py](../../backend/scripts/__init__.py) — empty (package marker)

**Acceptance met**:
- `python -m scripts.seed_mock_carriers` writes 1 carrier + 1 connection to JSON store
- `python -m scripts.run_doc_retrieval_e2e --policy POL-2025-12345 --doc-type policy_renewal` produces `status=completed, downloaded_count=1, %PDF magic`

**Replay**:
```powershell
cd backend
.\venv\Scripts\Activate.ps1
$env:PYTHONIOENCODING="utf-8"
python -m scripts.seed_mock_carriers
python -m scripts.run_doc_retrieval_e2e --policy POL-2025-12345 --doc-type policy_renewal
```

**Reuse**: For any orchestrator-style agent, ship a **direct-invocation test script** alongside the HTTP endpoint. It's the cheapest "does the loop work?" answer and survives JWT/auth refactors that would break a curl-based test.

---

### Task 6 — Python 3.11 environment setup

**Goal**: Both venvs (backend + mock-carriers) on Python 3.11.9 with all required deps + Playwright Chromium. Resolved Python 3.14 wheel incompatibilities for `greenlet` and `pydantic-core`.

**Files touched**:
- No source-tree changes — pure environment work
- `backend/venv/` rebuilt with Python 3.11.9
- `mock-carriers/venv/` rebuilt with Python 3.11.9
- Chromium installed under `%USERPROFILE%\AppData\Local\ms-playwright\chromium-1134`

**Acceptance met**:
- `py -3.11 --version` → `Python 3.11.9`
- `backend\venv\Scripts\python.exe -m pip show greenlet` → `Version: 3.5.1` (NOT 3.0.3)
- `from playwright.async_api import async_playwright` imports cleanly
- E2E test (Task 5) passes against the rebuilt venv

**Replay**: See "Dev-environment recipe" below for the full sequence.

**Reuse**: Whenever a fresh Windows dev box needs to come online, OR when a colleague hits a 3.14 wheel issue. The Gotchas section captures the specific failure modes that justified the 3.11 pin.

---

### Task 7 — Backend Settings strict-mode fix

**Goal**: Make the FastAPI app boot despite the multi-component `.env` file that contains ~100 fields unrelated to Fideon (ACORD/PDF-extractor settings leftover from another project).

**Files touched**:
- [backend/config.py](../../backend/config.py) — switched from `class Config: env_file = ".env"` to `model_config = SettingsConfigDict(env_file=".env", extra="ignore")`, made `anthropic_api_key` default to `""`

**Acceptance met**:
- `python -c "import main; print('routes:', len([r for r in main.app.routes if hasattr(r,'path')]))"` → 73 (previously crashed with 127 pydantic validation errors)
- All 17 backend routers import cleanly (`import routers.auth`, `import routers.agents`, etc.)
- E2E test still passes (no behavioral regression)

**Replay**: One-time edit; no replay command. The fix is in source control.

**Reuse**: Whenever a Fideon `.env` is shared across components, add `extra="ignore"` to the pydantic-settings `model_config` so the strict-mode default doesn't crash module import. **Don't** trim the `.env` itself — that breaks the other component.

---

### Task 8 — Frontend import repair

**Goal**: Zero "Cannot find module" / "Cannot find name" errors in `tsc --noEmit`. Repair all the missing imports that came from a partially-ported Vite codebase and a never-`npm install`-ed working tree.

**Files touched** (many — grouped):

*Package work:*
- `frontend/node_modules/` populated via `npm install --no-audit --no-fund --maxsockets=1`
- 4 new packages installed: `@radix-ui/react-context-menu`, `@radix-ui/react-aspect-ratio`, `react-day-picker`, `react-resizable-panels`

*Migrations (9 files from `react-router-dom` → `next/navigation`):*
- [frontend/components/inbox/ArtifactPanel.tsx](../../frontend/components/inbox/ArtifactPanel.tsx), [components/workflows/RunWorkflowDialog.tsx](../../frontend/components/workflows/RunWorkflowDialog.tsx), [components/shell/AssistantSidecar.tsx](../../frontend/components/shell/AssistantSidecar.tsx), [components/approvals/ApprovalsPanel.tsx](../../frontend/components/approvals/ApprovalsPanel.tsx), [components/playground/DocumentRetrievalUI.tsx](../../frontend/components/playground/DocumentRetrievalUI.tsx), [components/shell/CommandPalette.tsx](../../frontend/components/shell/CommandPalette.tsx), [components/playground/PolicyComparisonUI.tsx](../../frontend/components/playground/PolicyComparisonUI.tsx), [components/AppSidebar.tsx](../../frontend/components/AppSidebar.tsx), [components/NavLink.tsx](../../frontend/components/NavLink.tsx)
- Pattern: `useNavigate` → `useRouter`, `useLocation` → `usePathname`, `RouterNavLink` → Next.js `<Link>` + `usePathname` for active state

*New files (4 missing modules):*
- [frontend/next-env.d.ts](../../frontend/next-env.d.ts) — Next.js boilerplate (types for `*.png`, `next/image-types/global`)
- [frontend/hooks/use-toast.ts](../../frontend/hooks/use-toast.ts) — shadcn's standard hook
- [frontend/integrations/supabase/client.ts](../../frontend/integrations/supabase/client.ts) — re-export shim to `@/lib/supabaseClient`
- [frontend/components/inbox/inboxTypes.ts](../../frontend/components/inbox/inboxTypes.ts) — `InboxItem`, `InboxTypeMeta`, `InboxStatusMeta`, plus `INBOX_TYPE_META` and `STATUS_META` dicts

*Stub files (9 referenced but not yet written):*
- `frontend/components/pod-run/types.ts` + 6 renderer stubs under `frontend/components/pod-run/renderers/`
- `frontend/components/workflows/runtime/runSeed.ts` + `lossRunData.ts`

*Asset placeholders (6 × 67-byte transparent PNGs):*
- [frontend/assets/fideon-logo.png](../../frontend/assets/fideon-logo.png) + 5 under `frontend/assets/logos/`

*Other fixes:*
- [frontend/components/NavLink.tsx](../../frontend/components/NavLink.tsx) — rewrote the wrapper to use `next/link` + accept `to` prop without conflicting with Link's `href`
- [frontend/components/HelpAssistant.tsx](../../frontend/components/HelpAssistant.tsx) — added missing `import { supabase } from "@/lib/supabaseClient"`
- [frontend/components/shell/CommandPalette.tsx](../../frontend/components/shell/CommandPalette.tsx) — fixed `[navigate]` → `[router]` deps array regression from the migration

**Acceptance met**:
- `npx tsc --noEmit` → 0 TS2307 errors (was 13), 0 TS2304 errors (was 1), 0 TS2551/TS2552 errors (was 2)
- 50 type-correctness errors remain — these are pre-existing bugs (`unknown` not assignable to `ReactNode`, `import.meta.env`, etc.), explicitly out of scope as "not import issues"

**Replay**:
```powershell
$env:NPM_CONFIG_CACHE = "e:\Fideon-OS\FideonOS\frontend\.npm-cache"
cd frontend
npm install --no-audit --no-fund --maxsockets=1
# All the source-tree edits are in git history — no further replay needed.
npx tsc --noEmit  # confirm 0 TS2307
```

**Reuse**: When inheriting a Vite-era Next.js codebase, the import errors usually fall into the same 3 buckets:
1. `react-router-dom` → migrate to `next/navigation` + `next/link`
2. Missing `next-env.d.ts` → re-add it (it's auto-generated by `next dev` but only after first run)
3. `@/integrations/supabase/client` → create the shim or change imports to `@/lib/supabaseClient`

---

### Task 9 — v1 sprint plan written

**Goal**: Forward-looking execution plan for May 25–30 work (carriers admin UI, AMS targets, 4 more mocks, Azure Blob storage, HIL MFA, observability).

**Files touched**:
- [Sprint-execution/Sagar/doc-retrieval-v1-sprint-plan.md](doc-retrieval-v1-sprint-plan.md) — 13 tasks, dated, with per-task acceptance and verification

**Acceptance met**:
- File exists at the path
- User approved the plan via ExitPlanMode

**Replay**: Read the plan and execute its tasks one at a time. The plan itself is the replay.

**Reuse**: When writing a future sprint plan, mirror this shape — per-task `Goal / Files / Steps / Acceptance / Verify` blocks, a Conventions section up top, a Risks table at the bottom.

---

## Dev-environment recipe (replayable from scratch)

Run from repo root in PowerShell, in order. Takes ~8–15 minutes total depending on disk speed and Defender activity.

```powershell
# 1. Python 3.11 (user-scope, no admin required)
winget install --id Python.Python.3.11 --silent --accept-source-agreements --accept-package-agreements --scope user

# 2. Backend venv + deps
py -3.11 -m venv backend\venv
backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt playwright==1.47.0 pyotp==2.9.0
# Workaround for Gotcha #2 (greenlet 3.0.3 ships an unloadable .pyd):
backend\venv\Scripts\python.exe -m pip install --force-reinstall --no-cache-dir greenlet
backend\venv\Scripts\python.exe -m playwright install chromium

# 3. Mock-carriers venv + deps
py -3.11 -m venv mock-carriers\venv
mock-carriers\venv\Scripts\python.exe -m pip install -r mock-carriers\requirements.txt

# 4. Frontend deps (single-socket avoids Windows Defender file-locking race)
$env:NPM_CONFIG_CACHE = "e:\Fideon-OS\FideonOS\frontend\.npm-cache"
cd frontend
npm install --no-audit --no-fund --maxsockets=1
cd ..

# 5. Verify
$env:PYTHONIOENCODING="utf-8"
backend\venv\Scripts\python.exe -c "import sys; sys.path.insert(0,'backend'); import main; print('backend routes:', len([r for r in main.app.routes if hasattr(r,'path')]))"
# Expect: backend routes: 73
```

---

## Gotchas log

Surprises that actually cost time. Each has a one-line workaround.

- **Python 3.14 wheels missing** (greenlet, pydantic-core) → pin Python 3.11.9.
- **greenlet 3.0.3 `.pyd` is present but unloadable** under cp311 even with the right wheel → force-reinstall to `greenlet==3.5.1`.
- **`pydantic-settings` strict mode** rejects every `.env` field its model doesn't declare → use `SettingsConfigDict(env_file=".env", extra="ignore")` and give optional defaults to required fields.
- **Windows Defender races npm cache** — EBUSY on rename → `--maxsockets=1` plus a project-local `NPM_CONFIG_CACHE`.
- **`react-router-dom` in a Next.js app** → never. Use `useRouter` / `usePathname` from `next/navigation`, `<Link>` from `next/link`.
- **`import.meta.env`** is Vite syntax → Next.js uses `process.env.NEXT_PUBLIC_*` on the client; `process.env.*` on the server.
- **`WEBHOOK_SECRET_ENCRYPTION_KEY`** in `backend/.env` → leftover from a different component. Ignored by config; do not attempt to use webhooks.
- **PowerShell cp1252 can't print unicode** (`→`, `❌`, etc.) → `$env:PYTHONIOENCODING="utf-8"` before running scripts that print arrows/emojis. Or use ASCII in script output.
- **Default plan file path is private** (`C:\Users\...\.claude\plans\`) → if a plan should be shared/committed, copy it into `Sprint-execution/Sagar/` after approval.
- **`next-env.d.ts` is auto-generated by `next dev`** but absent in a fresh-cloned repo until first run → write it explicitly when running `tsc --noEmit` without booting the dev server.

---

## Reusable patterns

- **Data-driven Playwright adapter** — one generic body of code, JSON `listing_selector_spec` per target. New vendor = INSERT a row, no code change. See [backend/services/doc_retrieval/playwright_adapter.py](../../backend/services/doc_retrieval/playwright_adapter.py).
- **JSON store ↔ Supabase store swap** — start with [backend/services/doc_retrieval/store.py](../../backend/services/doc_retrieval/store.py) (file-backed), promote to Supabase when the schema settles. Keep the dataclass interface stable across both.
- **Mock vendor portal scaffold** — FastAPI + Jinja2 + reportlab + session middleware = a runnable mock in ~150 LOC. Copy [mock-carriers/travelers/](../../mock-carriers/travelers/) and edit templates + fixtures.
- **MFA plugin registry** — see [backend/services/doc_retrieval/mfa.py](../../backend/services/doc_retrieval/mfa.py). New `mfa_kind` = new function + dict entry. Callers stay generic.
- **FastAPI BackgroundTasks for v0 async** — looks like real async (POST returns 202 + run_id), zero queue infra. Promote to a Valkey worker later without changing the HTTP contract.
- **Direct-invocation e2e test script** — call the orchestrator function from Python (`backend/scripts/run_doc_retrieval_e2e.py`), no JWT plumbing. Same code path the HTTP `BackgroundTask` runs; survives auth refactors.
- **Per-task ledger shape (this doc)** — `Goal / Files touched / Acceptance met / Replay / Reuse`. Use the same five fields for any future ledger; predictable structure lets Ctrl-F find what you need.

---

## Forward links

- **Architecture target**: [doc_retrieval.md](doc_retrieval.md)
- **Next sprint (May 25 → May 30)**: [doc-retrieval-v1-sprint-plan.md](doc-retrieval-v1-sprint-plan.md)
- **Visual reference**: [doc_retrieval_architecture.drawio](doc_retrieval_architecture.drawio)
