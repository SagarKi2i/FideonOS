# Fideon OS — Alignment Status & Remaining Work (handoff)

**Last updated:** 2026-05-24

This file is the single source of truth for *what is aligned* and *what each remaining
person needs to build*. The canonical schema is `supabase/migrations/` +
`backend/docs/pod_structure.md` + `backend/docs/Auth_Module_Plan.md`.

---

## 1. The canonical schema = 24 tables

`supabase/migrations/` creates **only** these tables. If a feature's table is not
here, that feature is **not yet real** — it needs a migration before it can work.

```
auth:    users, user_roles, user_devices, invites, otp_codes, refresh_tokens,
         password_reset_tokens, password_history, audit_logs, electron_service_tokens
agents:  agents, agent_versions, agent_dashboard_templates, user_agents,
         user_agent_stats, agent_access_requests, agent_runs, agent_run_approvals,
         custom_agents (stub), custom_agent_requests
devices: devices, device_sync_logs, device_model_allocations, device_daily_analytics
```

---

## 2. Domain status

| Domain | Has tables? | Backend | Frontend | Status |
|--------|-------------|---------|----------|--------|
| **Auth** | ✅ | ✅ correct | ✅ | **ALIGNED** |
| **Agents / pods** | ✅ | ✅ correct | ✅ (agentsApi) | **ALIGNED** |
| **Model allocation (admin)** | ✅ (user_agents) | ✅ built 2026-05-24 | ✅ Devices.tsx, ModelAllocationSection | **ALIGNED** |
| **Devices** | ✅ | ✅ built 2026-05-24 | ✅ DeviceDetails/AdminDashboard/PendingDevices | **ALIGNED** |
| **Marketplace** | ✅ (agents) | ✅ agentsApi | ✅ Marketplace.tsx migrated 2026-05-24 | **ALIGNED** (see note) |
| **Governance** | ❌ no tables | ⚠️ `governance.py` targets non-existent `decision_records`/`decision_events`/`decision_exports`/`model_versions` | views on same | **BLOCKED — needs tables** |
| **Workflows** | ❌ no tables | ⚠️ `workflows.py` targets non-existent `workflows`/`runs`/`run_steps` | views on `agent_pipelines`/`workflow_runs` | **BLOCKED — needs tables** |
| **Schedules** | ❌ no `agent_schedules` | — none | `AgentSchedules.tsx` | **BLOCKED — needs table + backend** |
| **Inbox / review** | ❌ no `inbox_items`/`decision_reviews` | partial (`approvals.py`) | Inbox/Work/Today/ReviewQueue/ApprovalsPanel | **BLOCKED — needs tables** |
| **Documents** | ❌ no `documents` | — none | `PolicyComparison.tsx` | **BLOCKED — needs table + backend** |
| **Custom agents (full)** | stub only | — none beyond requests | AgentBuilder/MyModels | **BLOCKED — stub only by design** |
| **Pods (legacy module)** | ❌ never existed | — none | `lib/pods.ts` + consumers | **DEAD — remove when consumers migrated** |

---

## 3. What "running" means today

- **Backend boots** and the 3 aligned domains work end-to-end.
- **Frontend compiles** (`tsconfig`: `strict:false`, `noUnusedLocals:false`).
- **`frontend/integrations/supabase/types.ts` is intentionally NOT regenerated.**
  It still declares the pre-conversion tables (`activated_models`, `pod_*`,
  `device_models`, `decision_records`, `workflows`, …). This is **load-bearing**:
  ~17 not-yet-migrated views still import those types, so trimming `types.ts` now
  would break the build. Regenerate it **only after** all consumers below are migrated.
- Pages for BLOCKED domains will **error at runtime** (their tables don't exist)
  until the owning person builds them. That is expected and isolated.

---

## 4. Per-domain handoff (what each owner must do)

For every BLOCKED domain the pattern is the same:
**(a)** add migration(s) creating the table(s) per a new `pod_structure.md` section →
**(b)** point the backend router at real columns →
**(c)** add typed `apiFetch` methods in `frontend/lib/api.ts` →
**(d)** migrate the frontend views off the supabase client to those methods →
**(e)** delete the dead table from `types.ts`.

### 4.1 Governance — owner: ___
- Tables to create: `decision_records`, `decision_events`, `decision_exports`, `model_versions`.
- Backend already written (`routers/governance.py`) — verify columns match new migrations.
- Frontend (already typed via `governanceApi` in api.ts; just swap the supabase calls):
  `views/governance/Decisions.tsx`, `DecisionDetail.tsx`, `AuditLog.tsx`, `Exports.tsx`, `ModelVersions.tsx`.

### 4.2 Workflows — owner: ___
- Tables: `workflows`, `workflow_steps`, `runs`, `run_steps`, `langgraph_checkpoints` (see pod_structure.md §3 Group 4).
- Backend `routers/workflows.py` + `workflow_ai.py` exist — align to migrations.
- Frontend uses legacy `agent_pipelines` + `workflow_runs`: `Workflows.tsx`, `WorkflowBuilder.tsx`,
  `AgentWorkflows.tsx`, `Automations.tsx`, `Overview.tsx`, `components/pipeline/AgentConfigForm.tsx`.
  Map `agent_pipelines` → `workflows`, `workflow_runs` → `runs` and call `workflowsApi`.

### 4.3 Inbox / Review queue — owner: ___
- Tables: `inbox_items`, `decision_reviews`, `training_examples` (or fold into `approvals`/`notifications` from pod_structure.md Group 4).
- `approvalsApi` partially exists. Frontend: `Inbox.tsx`, `Work.tsx`, `Today.tsx`, `ReviewQueue.tsx`,
  `components/approvals/ApprovalsPanel.tsx`, `components/playground/SendToReviewButton.tsx`,
  `components/inbox/seedInbox.ts`, `lib/reviewQueueDemoSeed.ts`, `components/workflows/runtime/runSeed.ts`.

### 4.4 Schedules — owner: ___
- Table: `agent_schedules` (none today). No backend. Frontend: `AgentSchedules.tsx`.

### 4.5 Documents — owner: ___
- Table: `documents` (none today). No backend. Frontend: `PolicyComparison.tsx`.

### 4.6 Custom agents (full) — owner: ___
- `custom_agents` is a **stub** by design (see pod_structure.md §3 Group 2). Full schema +
  CRUD endpoints are a separate workstream. Frontend `AgentBuilder.tsx`, `MyModels.tsx` (custom sections).

### 4.6b Marketplace — DONE, with caveats
`views/Marketplace.tsx` now uses `agentsApi` (myAgents / agentRequests / marketplace / createAgentRequest).
The rich catalog still renders from the static `lib/agentCatalog.ts`; **activation works only for
agents that exist in the DB `agents` table** (mapped catalog `id` → `agents.keyword` → real UUID).
Coming-soon catalog agents show "Notify me" and cannot be activated (correct). The "Built for you by
Fideon" custom-agents section is hidden until the full `custom_agents` table ships (§4.6).
STILL pending in this domain: `RequestPod.tsx` (custom_pod_requests) and `AgentDetail.tsx`
(`/marketplace/:id`, imports `pods.ts`) — migrate alongside §4.7.

### 4.7 Pods legacy module — owner: ___ (cleanup, not build)
- `frontend/lib/pods.ts` targets tables that **never existed in this architecture**
  (`pod_definitions/installations/runtimes/runs`) and a removed `pod-provision` Edge Function.
  Consumers: `MyModels.tsx`, `Marketplace.tsx`, `AgentWorkflows.tsx`, `AgentDetail.tsx`,
  `McpConnections.tsx`, `components/pods/InstallPodDialog.tsx`, `components/pod-run/PodRunWorkspace.tsx`.
  → Re-implement each on `agentsApi` (the agents are the new "pods"), then **delete `pods.ts`**.

---

### 4.8 Integrations (carrier/AMS) — DONE 2026-05-24, GLOBAL/ADMIN-managed
- `carrier_connections` + `ams_connections` exist (`20260522020850_create_integrations.sql`).
- **Design: credentials are GLOBAL and ADMIN-SET** — one row per `carrier_id`/`ams_id` (no `user_id`;
  `set_by` = admin). An admin sets them once and they apply to **all users automatically**.
- Backend: `settings.py` reads open to any authed user (global), writes `require_admin`.
  `agents.py` doc-retrieval-config likewise (global read, admin write, `extra` merged).
- Frontend migrated to `settingsApi`/`agentsApi` (no direct Supabase). Non-admins see read-only
  "Connected/Not connected" status + an "administrator-managed" notice; only admins get Connect/Configure.
- Credentials sent to the API as `password`/`api_key`; backend stores them in
  `password_ciphertext`/`api_key_ciphertext` (encrypt at the API layer — currently stored as-is, TODO encrypt).

### Backend crash-safety (2026-05-24)
All 16 still-missing tables (workflows, governance, chat, mcp, training, federated — see
`backend/docs/pending_tables.md`) now return **HTTP 501**, not 500, via the global
`main.py` `_missing_table_handler`. The backend boots and stays up regardless.

## 5. Known accepted deviations
- `backend/services/anthropic.py` calls the cloud Anthropic API (chat/help/mcp/workflow_ai).
  Violates the self-hosted-SLM constraint; **kept intentionally** pending the SLM swap. Owner: ___
- `types.ts` regeneration is the **final** step (§3) — do it last.

---

## 6. Definition of done (per domain)
A domain is "aligned" when: its tables exist in `supabase/migrations`, `pod_structure.md`
documents them, the backend router queries only those columns, the frontend calls
`apiFetch`/`*Api` (no `@/integrations/supabase/client`), and its stale tables are removed
from `types.ts`. Auth, Agents, and Devices meet this today.
