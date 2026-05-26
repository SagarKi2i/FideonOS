# Doc Retrieval — Architecture Reference

> **Visual source of truth:** [doc_retrieval_architecture.drawio](doc_retrieval_architecture.drawio) — three pages: **1. Runtime Flow** · **2. Auth, MFA and Encryption** · **3. Infrastructure, Data & Events**
> **Diagram status:** APPLIED on 2026-05-21
> **Purpose of this file:** Compact architecture reference for future Claude Code sessions. This is *not* an implementation roadmap — it is a map of how the system is designed.
> **Scope note:** Doc Retrieval's responsibilities end at **classification and validation**. Content extraction is a separate downstream concern and is intentionally outside the scope of this document and of the drawio diagram.

---

## At a glance

Doc Retrieval is the agent that logs into each insurance carrier's portal on behalf of a broker, downloads the documents the broker has configured (policy renewals, endorsements, loss runs, invoices, memos, declarations, cancellations), **classifies** each document (assigns it to a `doc_type`) and **validates** it (confirms it is well-formed and matches the expected document for that carrier / broker), and files the validated, classified result into the broker's AMS — surfacing the outcome in the Mailbox / Today view. It runs asynchronously: the API call returns immediately with a `run_id`, and the UI subscribes to status updates via Supabase realtime.

Before the run starts, the broker picks a carrier, a target AMS, an attach-to category, a document type, and enters a policy number + insured name.

---

## User input — what the broker provides before a run

The broker walks through six selections in the Web client before the run is triggered. These selections become the body of the `POST /api/agents/doc_retrieval_v0/run` payload and are persisted as columns on the `runs` row (see Data model below).

1. **Carrier** — pick from the `carriers` registry.
2. **Target AMS** — pick from the `ams_targets` registry.
3. **Attach-to category** — one of `policy` / `activity` / `accounts` / `unrouted`. Tells the AMS connector where to file the document on the destination side.
4. **Document type** (`doc_type`) — one of `policy_renewal` · `cancellation` · `endorsement` · `memo` · `invoice` · `certificate` · `deck_page` · `loss_run`.
5. **Policy number** — free-text, used to narrow the carrier-side document listing in step 4 (Download).
6. **Insured name** — free-text, used together with the policy number for matching and for the classify + validate step.

Then the broker clicks **Trigger** — the run is enqueued and the UI immediately starts following the Status Stream.

---

## Runtime flow (Page 1)

The happy path, end-to-end:

1. **User** completes the pre-flight selections (see the **User input** section above) and triggers Doc Retrieval from the Web client.
2. **Client → Backend** over HTTPS via Azure App Gateway.
3. **Run Endpoint** (`POST /api/agents/doc_retrieval_v0/run`) inserts a row into the `runs` table, enqueues the job, and returns **`202 Accepted + run_id`** immediately — no blocking on Playwright or MFA.
4. **Worker** (async background process running on **Valkey**, co-located with self-hosted Supabase on the Azure VM) picks the job from the queue and executes the orchestrator.
5. The **orchestrator** runs the 6-step pipeline (see next section).
6. The **Worker** updates `runs.status` at each step transition. The UI is subscribed to that row via Supabase realtime — that subscription is the **Status Stream**.
7. **Result** flows out via the Event Flow chain (Page 3): `events.py → notifications`.

Optional path: an **External Workflow Chain Runtime** can dispatch directly into the Run Endpoint instead of a client trigger.

---

## Orchestrator steps (the 6 boxes on Page 1)

| # | Step | Notes |
|---|------|-------|
| 1 | Authenticate (login + MFA) | Uses Auth Layer + MFA Plugin Registry (Page 2). |
| 2 | List Documents | Uses Adapter Layer / Playwright (Page 2). |
| 3 | Filter by doc_types | Filters the carrier-side listing down to the user-selected `doc_type`. |
| 4 | Download Documents | Uses Adapter Layer / Playwright. Narrows by the user-entered `policy_number` and `insured_name`. |
| 5 | **Classify + validate** | Assigns a `doc_type` and confirms the downloaded document is well-formed and matches the user-selected `doc_type` plus the entered `policy_number` / `insured_name`. Records a confidence score on the run. |
| 6 | File in AMS | Files into the user-selected `ams_target` under the user-selected `attach_to` category (`policy` / `activity` / `accounts` / `unrouted`). **Stub in v0.** Real connectors land later. |

--- 

## Auth, MFA & Encryption (Page 2)

### Auth Layer
A data-driven registry maps each `auth_kind` (e.g. `password`, `api_key`, …) to its implementation. The orchestrator picks the right one at runtime. Credentials are read only via the data-encryption wrapper (see Encryption below) — the layer never sees plaintext from anywhere else. The `session_store` handles carrier session cache and refresh. MFA challenges are handed off to the MFA Plugin Registry.

### Adapter Layer
**One generic Playwright adapter for every carrier — no per-carrier files.** It reads `CarrierConfig` at runtime from the `carriers` table:

- `login_url`
- `listing_selector_spec` (JSON)
- `auth_kind`, `mfa_kind`
- `hil_timeout_seconds`

Playwright drives login form submission, MFA prompt detection, doc list scraping, and PDF download link discovery. **Azure egress caveat:** traffic exits via Azure IPs — carriers may rate-limit or block.

### MFA Plugin Registry — the sole canonical MFA list
Two tiers, both registered against `mfa_kind`:

**Auto-Solve Tier**
- `totp_rfc6238` — generates the 6-digit code from the stored seed.
- `captcha_bypass` — sends a carrier-issued bypass token in the login request header. Falls through to `captcha_hil` if the carrier rejects it.

**HIL (Human-in-Loop) Tier**
- `email_link` — see polling spec below.
- `email_otp` — prompt + paste.
- `sms_otp` — prompt + paste.
- `captcha_hil` — prompt with image.

HIL flow: Worker captures the challenge → sets `runs.status = awaiting_mfa` → emits prompt event → UI shows modal → user posts response → Worker resumes Playwright.

**`email_link` polling spec (important for memory budgeting):**
- Keep the **same** Playwright session warm — the carrier flips state only on redirect within that session.
- Poll cookies every 2 s for the first 20 s, then every 5 s.
- ~200 MB memory per parked session → Worker concurrency cap is mandatory.
- Timeout = `carriers.hil_timeout_seconds`.
- On timeout: emit `doc_retrieval.failed` (reason: `mfa_timeout`), tear down the session, free memory.

### Encryption — per-tenant DEK wrapped by KEK
- Sensitive columns (suffixed `_encrypted`) are wrapped with a per-tenant **DEK** (data encryption key).
- The DEK is itself wrapped by a **KEK** (master key) which lives in **Azure Key Vault**.
- Backend fetches the KEK at startup, unwraps the DEK, decrypts at use, **never persists plaintext**. KEK access is audit-logged.
- **No production keystore path exists** — the Electron client is dev-only and uses a dev KEK scoped to dev only.

---

## Data model (Page 3)

All tables live in the self-hosted Supabase Postgres on the Azure VM.

| Table | Role |
|---|---|
| `runs` | Job state for each Doc Retrieval execution. Status: `queued → running → awaiting_mfa → completed | failed`. UI subscribes to changes for the Status Stream. Carries the user's pre-flight selections as columns: `carrier_id`, `ams_target_id`, `attach_to`, `doc_type`, `policy_number`, `insured_name`. |
| `carrier_connections` | Per-broker credentials and session tokens (all sensitive columns encrypted). Includes `totp_secret_encrypted` for the service-account auto-solve model. |
| `carriers` | Data-driven carrier registry. `login_url`, `listing_selector_spec` (JSON), `auth_kind`, `mfa_kind`, `hil_timeout_seconds`. Adding a real carrier = INSERT row, no code change. |
| `ams_targets` | Data-driven AMS connector registry. Per-tenant or global, with `connector_kind` and encrypted `connector_config`. |
| `doc_types` | Free-string registry of document types. Canonical 8: `policy_renewal`, `cancellation`, `endorsement`, `memo`, `invoice`, `certificate`, `deck_page`, `loss_run`. The classify step in the orchestrator picks from this list and the value lands on `runs.doc_type`. |
| `attach_to` (enum, stored on `runs`) | Where the AMS connector files the document on the destination side. Four values: `policy` / `activity` / `accounts` / `unrouted`. Not its own table — it is a column on `runs`, set from the user's pre-flight selection. |


**Access pattern (the hard rule):** The backend is the **sole** Supabase caller. It reaches the self-hosted Supabase stack (Postgres + GoTrue + PostgREST + Storage) on the Azure VM via the Azure App Gateway, routed by Kong internally. There is **no public Supabase endpoint**. The `SUPABASE_SERVICE_ROLE_KEY` is synced into App Service per environment at deploy. **DB migrations apply via SSH tunnel into the VM** (not PostgREST).  **Clients never hold a service-role key.** The browser only talks to the backend.

---

## Build & deploy infrastructure (Page 3, Section I)

The pieces of Section I that are in scope for Doc Retrieval:

| Component | Role |
|---|---|
| **Azure Container Registry** (`neurapodacr.azurecr.io`) | Holds Backend and Frontend images. Pulled by App Service. Per-environment tag: `dev` / `staging` / `production`. |
| **SonarQube** (self-hosted, **dev-only**) | Static code-quality scans on `v1-dev` only. Non-blocking. **Not part of the runtime data plane** — informational only. |
| **Environment Gates** | `dev`: auto-deploy on push to `v*-dev`. `staging`: auto-deploy on push to `v*-staging`. `production`: **MANUAL** workflow_dispatch only — `deploy_to_production=true` on branch `v1`. DB migrations to production require additional reviewer approval. |

---

## Key constraints & known trade-offs

- **Electron is built but NOT deployed.** It is a dev-only tool for local engineering/QA builds. There is no production keystore path.
- **Backend Playwright runs from Azure egress IPs** — carriers may rate-limit. There is **no Desktop production fallback**.
- **TOTP seed in DB = service-account automation, not user 2FA.** Document this explicitly to security review. If 2FA non-bypassability is a hard requirement for a given carrier, that carrier must NOT be enabled with TOTP auto-solve.
- **Captcha-bypass header is enabled in the production code path.** Bypass tokens are encrypted at rest and fall through to `captcha_hil` on carrier rejection.
- **Worker concurrency cap is mandatory** because parked Playwright sessions for `email_link` MFA consume ~200 MB each.
- **Three Azure environments**: `dev` / `staging` / `production`, each with its own App Service slot, ACR tag, and synced secrets. Production deploys are **manual** only.
- **One generic Playwright adapter** for every carrier. No per-carrier code files. New carriers are added by INSERTing a row into `carriers`.
- **Backend is the SOLE Supabase caller.** Clients never hold a service-role key.
- **Doc Retrieval stops at classification and validation.** Anything downstream (content extraction, field-level parsing, ACORD form processing) is a separate service and is out of scope for this agent.

---

## Where it lives in the codebase today

The architecture above is partially implemented. **Pointers below are for reference only — they are not a task list.**

**Already in code:**

| Concern | Location |
|---|---|
| Config storage table (`document_retrieval_configs`) | [supabase/migrations/20260516100000_document_retrieval_config.sql](../../supabase/migrations/20260516100000_document_retrieval_config.sql) |
| Config schema (`DocRetrievalConfigUpsert`) | [backend/models/schemas.py](../../backend/models/schemas.py) (lines 117–122) |
| Config endpoints (`GET / PUT /api/agents/doc-retrieval-config`) | [backend/routers/agents.py](../../backend/routers/agents.py) (lines 108–132) |
| Frontend config UI | [frontend/app/(app)/pod/document-retrieval/configure/page.tsx](../../frontend/app/(app)/pod/document-retrieval/configure/page.tsx) |
| Frontend API client (`agentsApi.docRetrievalConfig`, `upsertDocRetrievalConfig`) | [frontend/lib/api.ts](../../frontend/lib/api.ts) (lines 58–63) |
| Auth layer (JWT validation, `get_current_user`, `require_admin`) | [backend/auth/dependencies.py](../../backend/auth/dependencies.py) |
| Related supporting tables already present | `carrier_connections`, `ams_connections`, `workflow_runs`, `custom_agents` (has `playwright_script` column), |

**Described in the diagram but not yet in code** (listed for completeness, *not* as TODOs):

- Tables: `runs`, `carriers`, `ams_targets`, `doc_types`.
- The Valkey-backed worker / job runner.
- The MFA Plugin Registry (Auto-Solve and HIL tiers).
- The generic Playwright adapter executor.
- The captcha-bypass resolver.
- The classify + validate step of the orchestrator.
- KEK / DEK encryption wiring against Azure Key Vault.
- `events.py`, `notifications.py` modules.

---

## Out of scope (for this document)

- **Content extraction, ACORD form parsing, field-level data lifting.** Those belong to a separate service.
- CI/CD pipeline architecture — that has its own diagram.
- Other `.drawio` files in the repository.
- Implementation instructions, build order, or task lists — this file is a reference, not a roadmap.
