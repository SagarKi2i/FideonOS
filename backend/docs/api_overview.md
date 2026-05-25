# API Overview

> **Master endpoint index — single source of truth for all FastAPI routes.**  
> Update this file before building any endpoint. Keep in sync with `backend/routers/`.  
> All routes prefixed `/api`. Detailed request/response contracts → `api_contracts.md`.

---

## Format

| Column | Values |
|--------|--------|
| **Auth** | `Public` · `JWT` · `JWT+Admin` · `Bearer` · `Cookie` · `Device` · `OTC` · `MCP` |
| **Priority** | `P0` MVP · `P1` Full production · `P2` Enhancement |
| **Status** | `Built` (router + handler exist) · `501` (built but its DB table isn't provisioned — returns HTTP 501) · `Planned` (not implemented) · `Deprecated` |

> **Implementation status (2026-05-24):** Auth, Admin, Marketplace, Agents, Runs, Agent/Custom
> requests, Devices, Settings (carriers/AMS), Workflow AI, Help, and System health are **Built &
> working**. Workflows (§9), Governance (§11), Training (§15), MCP (§16), Chat (§17), and the
> review-queue parts of Approvals (§8) are **Built in code but return HTTP 501** until their
> tables exist (see `pending_tables.md`). Notifications (§13) is **Planned** — no router yet.

**Auth legend:**

| Value | Mechanism | Used by |
|-------|-----------|---------|
| `Public` | No auth | Unauthenticated flows |
| `JWT` | RS256 access_token HttpOnly cookie | Next.js frontend |
| `JWT+Admin` | JWT + `role=admin` + `mfa_verified=true` | Admin panel |
| `Bearer` | `Authorization: Bearer <service_token>` | Electron main process |
| `Cookie` | `refresh_token` HttpOnly cookie | Token refresh only |
| `Device` | `x-device-token` header | Electron edge device |
| `OTC` | One-time code in request body | Electron OTC exchange |
| `MCP` | MCP token issued via `POST /api/mcp/tokens` | MCP tool execution |

---

## 1. Auth — `/api/auth` — `routers/auth.py`

> User identity, OTP sign-in, session lifecycle, and Electron service token handoff.

### Sign-in & Account

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `POST` | `/api/auth/invite` | JWT+Admin | P0 | Built | Send invite email to new user |
| `POST` | `/api/auth/invite/validate` | Public | P0 | Built | Validate invite token before showing signup form |
| `POST` | `/api/auth/signup` | Public | P0 | Built | Create account from valid invite token |
| `POST` | `/api/auth/login` | Public | P0 | Built | Password check → dispatch OTP to email |
| `POST` | `/api/auth/otp/verify` | Public | P0 | Built | Verify OTP → issue JWT + refresh cookies |
| `POST` | `/api/auth/otp/resend` | Public | P0 | Built | Resend OTP within active session (max 3) |
| `POST` | `/api/auth/token/refresh` | Cookie | P0 | Built | Rotate refresh token → new access + refresh cookies |
| `POST` | `/api/auth/logout` | JWT | P0 | Built | Revoke refresh token + clear cookies |

### Profile & Password

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/auth/me` | JWT / Bearer | P0 | Built | Current user profile |
| `PATCH` | `/api/auth/me` | JWT | P1 | Built | Update own profile — full_name, phone |
| `POST` | `/api/auth/password/forgot` | Public | P0 | Built | Send reset link — always 200, no email enumeration |
| `POST` | `/api/auth/password/reset` | Public | P0 | Built | Set new password via reset token |
| `POST` | `/api/auth/password/change` | JWT | P1 | Built | Change password while authenticated — requires current password |

### Session Management

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/auth/sessions` | JWT | P1 | Built | List all active sessions for current user |
| `DELETE` | `/api/auth/sessions/{id}` | JWT | P1 | Built | Revoke a specific session |

### Electron Handoff

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `POST` | `/api/auth/electron/otc` | JWT | P0 | Built | Issue 90-second one-time code for Electron |
| `POST` | `/api/auth/electron/token` | OTC | P0 | Built | Exchange OTC → long-lived service token |
| `POST` | `/api/auth/electron/token/refresh` | Bearer / Cookie | P0 | Built | Silent renewal of Electron service token — Bearer (main process) or Cookie (renderer recovery) |

---

## 2. Admin — `/api/admin` — `routers/admin.py`

> Internal admin operations. All routes require `role=admin` AND `mfa_verified=true`.

### Dashboard & Users

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/admin/stats` | JWT+Admin | P0 | Built | Admin dashboard KPIs — users, runs, requests, devices |
| `GET` | `/api/admin/users` | JWT+Admin | P0 | Built | List all users |
| `GET` | `/api/admin/users/{id}` | JWT+Admin | P1 | Built | Single user detail |
| `PATCH` | `/api/admin/users/{id}` | JWT+Admin | P1 | Built | Update user — role, status (active/suspended) |

### Invites

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/admin/invites` | JWT+Admin | P0 | Built | List all invites + status |

### Agent Requests

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/admin/agent-requests` | JWT+Admin | P0 | Built | All marketplace agent access requests |
| `PATCH` | `/api/admin/agent-requests/{id}` | JWT+Admin | P0 | Built | Approve or reject — body: `{ status, rejection_reason? }` |
| `GET` | `/api/admin/custom-agent-requests` | JWT+Admin | P1 | Built | All custom agent build requests |
| `PATCH` | `/api/admin/custom-agent-requests/{id}` | JWT+Admin | P1 | Built | Update build pipeline status |

### Devices

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/admin/devices` | JWT+Admin | P1 | Built | List all registered devices |
| `GET` | `/api/admin/devices/pending` | JWT+Admin | P1 | Built | List devices awaiting approval |
| `GET` | `/api/admin/devices/{id}` | JWT+Admin | P1 | Built | Single device detail |
| `GET` | `/api/admin/devices/{id}/models` | JWT+Admin | P1 | Built | Models allocated to a device |
| `PATCH` | `/api/admin/devices/{id}` | JWT+Admin | P1 | Built | Update device status |
| `POST` | `/api/admin/devices/{id}/models` | JWT+Admin | P1 | Built | Allocate model to device |

---

## 3. Marketplace — `/api/marketplace` — `routers/agents.py`

> Browse available agents from the catalog. Read-only.

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/marketplace` | JWT | P0 | Built | All available agents — `agents` where `status = 'live'` |

---

## 4. Agents — `/api/agents` — `routers/agents.py` · `routers/agent_runs.py`

> Activated agent management and all dashboard data.  
> `{agent_keyword}` = kebab-case from `agents.keyword`, e.g. `policy-comparison`.  
> FastAPI resolves keyword → UUID internally. User identity always from JWT, never from URL.

### Collection

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/agents` | JWT | P0 | Built | User's activated agents + live stats |
| `POST` | `/api/agents` | JWT | P0 | Built | Activate agent — body: `{ agent_id, model_name, domain }` |

### Individual Agent

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/agents/{agent_keyword}` | JWT | P0 | Built | Agent detail + version check |
| `PATCH` | `/api/agents/{agent_keyword}` | JWT | P1 | Built | Update agent config — display name, notification prefs |
| `DELETE` | `/api/agents/{agent_keyword}` | JWT | P0 | Built | Deactivate agent |

### Dashboard & Analytics

> All dashboard sub-routes are separate fetches — never bundled on page load.

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/agents/{agent_keyword}/dashboard` | JWT | P0 | Built | Full dashboard — stats + widget config (Q1) |
| `GET` | `/api/agents/{agent_keyword}/stats` | JWT | P0 | Built | KPI tiles refresh — O(1), no GROUP BY (Q2) |
| `POST` | `/api/agents/{agent_keyword}/stats/refresh` | JWT | P1 | Built | Recompute pre-aggregated stats — on-demand or post-run correction |
| `GET` | `/api/agents/{agent_keyword}/runs` | JWT | P0 | Built | Activity tab — paginated run history (Q3) |
| `GET` | `/api/agents/{agent_keyword}/breakdown` | JWT | P1 | Built | Breakdown tab — doc types, carrier split (Q4) |
| `GET` | `/api/agents/{agent_keyword}/narrative` | JWT | P1 | Built | AI Insights tab — Claude-generated narrative (Q5) |
| `GET` | `/api/agents/{agent_keyword}/trends` | JWT | P1 | Built | Trends chart — daily rollup, 90-day window (Q7) |
| `GET` | `/api/agents/{agent_keyword}/versions` | JWT | P1 | Built | Version history for this agent — which model version is live |

### Run Trigger

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `POST` | `/api/agents/{agent_keyword}/runs` | JWT | P0 | Built | Trigger agent run — returns `{ run_id, status, started_at }` |

---

## 5. Runs — `/api/runs` — `routers/agent_runs.py`

> Single run lifecycle. `{run_id}` is a UUID. User scope enforced by JWT — never from URL.

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/runs/{run_id}` | JWT | P0 | Built | Full run detail — input, output, metrics, schemas (Q6) |
| `GET` | `/api/runs/{run_id}/status` | JWT | P0 | Built | Poll run status while `status = 'running'` |
| `PATCH` | `/api/runs/{run_id}` | JWT | P1 | Built | Update run metadata — notes, labels, review flags |
| `PATCH` | `/api/runs/{run_id}/metrics` | JWT | P1 | Built | Correct run metrics after human review — confidence, extracted values |
| `POST` | `/api/runs/{run_id}/result` | Device | P0 | Built | GPU/RunPod worker submits completed output + raw metrics — marks run complete or failed |
| `POST` | `/api/runs/{run_id}/cancel` | JWT | P1 | Built | Cancel a running agent run |
| `POST` | `/api/runs/{run_id}/retry` | JWT | P1 | Built | Retry a failed run — enqueues new execution with same input |
| `POST` | `/api/runs/{run_id}/approve` | JWT | P0 | Built | Submit HITL approval — body: `{ decision, notes }` |
| `GET` | `/api/runs/{run_id}/download` | JWT | P1 | Built | Download run output — structured file (PDF/JSON) |
| `GET` | `/api/runs/{run_id}/comments` | JWT | P1 | Built | List reviewer comments on a run |
| `POST` | `/api/runs/{run_id}/comments` | JWT | P1 | Built | Add reviewer comment — audit trail for E&O compliance |

---

## 6. Agent Access Requests — `/api/agent-requests` — `routers/agents.py`

> User requests access to an existing marketplace agent. Distinct from custom agent builds.

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/agent-requests` | JWT | P0 | Built | User's marketplace agent access requests |
| `POST` | `/api/agent-requests` | JWT | P0 | Built | Submit access request — body: `{ agent_id, model_name }` |

---

## 7. Custom Agent Requests — `/api/custom-agent-requests` — `routers/agents.py`

> User requests Fideon build a brand-new custom agent from their SOP.

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/custom-agent-requests` | JWT | P1 | Built | User's custom agent build requests |
| `POST` | `/api/custom-agent-requests` | JWT | P1 | Built | Submit custom agent build request |

---

## 8. Approvals — `/api/approvals` — `routers/approvals.py`

> HITL decision review queue. All approval decisions are logged immutably for E&O compliance.

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/approvals` | JWT | P1 | Built | List pending approvals for current user |
| `GET` | `/api/approvals/{id}` | JWT | P1 | Built | Single approval — full context for review |
| `PATCH` | `/api/approvals/{id}` | JWT | P1 | Built | Submit decision — body: `{ decision, notes }` |

---

## 9. Workflows — `/api/workflows` — `routers/workflows.py`

> Workflow definition and execution. Multi-step agent orchestration.

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/workflows` | JWT | P1 | Built | List user's workflows |
| `POST` | `/api/workflows` | JWT | P1 | Built | Create workflow |
| `GET` | `/api/workflows/{id}` | JWT | P1 | Built | Workflow detail |
| `PUT` | `/api/workflows/{id}` | JWT | P1 | Built | Update workflow |
| `DELETE` | `/api/workflows/{id}` | JWT | P1 | Built | Delete workflow |
| `POST` | `/api/workflows/{id}/runs` | JWT | P1 | Built | Trigger workflow run |
| `GET` | `/api/workflows/{id}/runs` | JWT | P1 | Built | Workflow run history |

---

## 10. Workflow AI — `/api/workflow-ai` — `routers/workflow_ai.py`

> AI-assisted workflow authoring from SOP documents.

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `POST` | `/api/workflow-ai/sop/parse` | JWT | P1 | Built | Parse SOP document → structured workflow steps |
| `POST` | `/api/workflow-ai/step/assist` | JWT | P1 | Built | AI assistance for a single workflow step |
| `POST` | `/api/workflow-ai/automation/compile` | JWT | P2 | Built | Compile Playwright automation script from step |

---

## 11. Governance — `/api/governance` — `routers/governance.py`

> AI decision audit trail. Required for E&O compliance and carrier dispute resolution.  
> All entries are append-only — no updates or deletes.

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/governance/decisions` | JWT | P1 | Built | AI decisions log — paginated |
| `GET` | `/api/governance/decisions/{id}` | JWT | P1 | Built | Single decision detail — full context for audit review |
| `POST` | `/api/governance/decisions` | JWT | P1 | Built | Log a manual AI decision |
| `GET` | `/api/governance/audit` | JWT | P1 | Built | Full audit log — all agent, run, and approval events |
| `GET` | `/api/governance/agent-versions` | JWT | P1 | Built | Agent version history — which version ran each decision |
| `POST` | `/api/governance/agent-versions` | JWT | P1 | Built | Register new agent version |
| `GET` | `/api/governance/exports` | JWT | P2 | Built | Export audit data as CSV/JSON for regulators |

---

## 12. Settings — `/api/settings` — `routers/settings.py`

> Carrier portal and AMS credentials. Credentials stored encrypted via Supabase Vault (AES-256-GCM, AWS KMS).

### Carrier Portals

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/settings/carriers` | JWT | P0 | Built | List carrier connections + status |
| `POST` | `/api/settings/carriers` | JWT | P0 | Built | Add carrier connection |
| `PUT` | `/api/settings/carriers/{id}` | JWT | P0 | Built | Update carrier credentials or config |
| `DELETE` | `/api/settings/carriers/{id}` | JWT | P1 | Built | Remove carrier connection |
| `POST` | `/api/settings/carriers/{id}/test` | JWT | P0 | Built | Test carrier portal login — required before any run |

### AMS

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/settings/ams` | JWT | P0 | Built | List AMS connections + status |
| `POST` | `/api/settings/ams` | JWT | P0 | Built | Add AMS connection |
| `PUT` | `/api/settings/ams/{id}` | JWT | P0 | Built | Update AMS credentials or config |
| `DELETE` | `/api/settings/ams/{id}` | JWT | P1 | Built | Remove AMS connection |
| `POST` | `/api/settings/ams/{id}/test` | JWT | P1 | Built | Test AMS connection |

---

## 13. Notifications — `/api/notifications` — `routers/notifications.py` *(NOT IMPLEMENTED)*

> In-app notifications for run completions, approval requests, and system alerts.
> **`routers/notifications.py` does not exist and is not mounted in `main.py`.** Planned.

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/notifications` | JWT | P1 | Planned | List notifications — paginated, newest first |
| `PATCH` | `/api/notifications/{id}` | JWT | P1 | Planned | Mark notification as read |
| `POST` | `/api/notifications/read-all` | JWT | P1 | Planned | Mark all notifications as read |

---

## 14. Devices — `/api/devices` — `routers/devices.py`

> Electron desktop device registration and lifecycle.

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/devices` | JWT | P1 | Built | List user's registered devices |
| `POST` | `/api/devices` | JWT | P1 | Built | Register a new device |
| `GET` | `/api/devices/{id}` | JWT | P1 | Built | Single device detail — name, status, last seen |
| `PATCH` | `/api/devices/{id}/status` | JWT | P1 | Built | Update device status — active/suspended |
| `DELETE` | `/api/devices/{id}` | JWT | P1 | Built | Remove a device |
| `POST` | `/api/devices/checkin` | Device | P0 | Built | Device heartbeat + sync state check-in |

---

## 15. Training — `/api/training` — `routers/training.py`

> Federated learning and run feedback from edge devices.

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `POST` | `/api/training/feedback` | Device | P2 | Built | Submit run feedback for model improvement |
| `GET` | `/api/training/feedback` | JWT | P2 | Built | List feedback submissions — admin/analyst review |
| `GET` | `/api/training/stats` | JWT | P2 | Built | Training pipeline stats — rounds, participation, accuracy |
| `GET` | `/api/training/jobs` | Device | P2 | Built | List training jobs |
| `POST` | `/api/training/jobs` | Device | P2 | Built | Submit training job |
| `GET` | `/api/training/federated/rounds` | JWT | P2 | Built | List federated learning rounds — status and device participation |
| `POST` | `/api/training/federated/gradient` | Device | P2 | Built | Submit federated learning gradient update |

---

## 16. MCP — `/api/mcp` — `routers/mcp.py`

> Model Context Protocol token management and tool execution.

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/mcp/tokens` | JWT | P2 | Built | List MCP tokens |
| `POST` | `/api/mcp/tokens` | JWT | P2 | Built | Issue MCP token |
| `DELETE` | `/api/mcp/tokens/{id}` | JWT | P2 | Built | Revoke MCP token |
| `GET` | `/api/mcp/tools` | JWT | P2 | Built | List available MCP tools and their schemas |
| `POST` | `/api/mcp/tools/{tool_name}` | MCP | P2 | Built | Execute MCP tool |

---

## 17. Chat — `/api/chat` — `routers/chat.py`

> SSE streaming for agent run execution and interactive chat.

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/chat/conversations` | JWT | P1 | Built | List chat conversation history — paginated |
| `POST` | `/api/chat/conversations` | JWT | P1 | Built | Create a new chat conversation context |
| `POST` | `/api/chat/stream` | JWT | P1 | Built | SSE streaming chat reply via Anthropic Claude |

---

## 18. Help — `/api/help` — `routers/help.py`

> In-app contextual help assistant.

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `POST` | `/api/help/stream` | JWT | P1 | Built | Help assistant SSE stream |

---

## 19. System — `routers/system.py`

> Infrastructure and monitoring. No business logic.

| Method | Path | Auth | Priority | Status | Purpose |
|--------|------|------|----------|--------|---------|
| `GET` | `/api/health` | Public | P0 | Built | Health check — Azure load balancer probe |

---

## Summary

| Priority | Count | Meaning |
|----------|-------|---------|
| **P0** | 35 | Must be live before any user touches the system |
| **P1** | 63 | Required for full production — build in sprint 2+ |
| **P2** | 16 | Enhancements — schedule post-launch |
| **Total** | **120** | |

---

## Notes

- **Sensitive data:** All carrier/AMS credentials encrypted via Supabase Vault (AES-256-GCM, keys in AWS KMS, rotated 90 days)
- **Audit trail:** All P0/P1 agent, run, and approval events write to `audit_logs` — required for E&O compliance
- **Rate limiting:** All `Public` endpoints are rate-limited — limits and headers documented in `api_contracts.md §7`
- **User scope:** User identity always comes from the JWT — never trusted from the URL or request body
- **`{agent_keyword}`:** kebab-case, e.g. `policy-comparison` — resolved to UUID by FastAPI via `agents.keyword` (one indexed lookup)
- **`{run_id}`:** UUID — RLS-enforced in every query; user cannot access another user's run by guessing a UUID
- **Admin guard:** `require_admin` FastAPI dependency checks `role=admin` AND `mfa_verified=true` — both required
- **Electron Bearer:** Pod Monitor and Cloud Sync use `Authorization: Bearer <service_token>` — JWT cookie is not accessible from Electron main process

---

## Frontend Migration — Old Paths → New Paths

> The current frontend codebase uses old API paths from the React+Vite+Supabase era. These must be updated to match the paths in this document before backend builds begin.

| Old frontend path | New correct path | Section |
|-------------------|-----------------|---------|
| `/api/agents/my-models` | `GET /api/agents` | §4 |
| `/api/agents/pod/:podId` | `GET /api/agents/{agent_keyword}/dashboard` | §4 |
| `/api/agents/pod/:podId/stats` | `GET /api/agents/{agent_keyword}/stats` | §4 |
| `/api/agents/pod/:podId/runs` | `GET /api/agents/{agent_keyword}/runs` | §4 |
| `/api/governance/model-versions` | `GET /api/governance/agent-versions` | §11 |
| `/api/governance/audit-log` | `GET /api/governance/audit` | §11 |
| `/api/devices/:id` (missing) | `GET /api/devices/{id}` | §14 |
| `/api/training/federated` | `POST /api/training/federated/gradient` | §15 |
| `/api/training/stats` (missing) | `GET /api/training/stats` | §15 |
| `/api/training/federated/rounds` (missing) | `GET /api/training/federated/rounds` | §15 |
| `/api/mcp/tools` (missing) | `GET /api/mcp/tools` | §16 |
| `/api/chat/conversations` (missing) | `GET/POST /api/chat/conversations` | §17 |

> **Note:** Path params changed from numeric IDs / UUIDs in URL to `{agent_keyword}` (kebab-case). Frontend must stop passing `pod_id` as path param and use keyword instead.

---

*Update this file before building any endpoint. Breaking changes require a new path or version bump.  
Cross-team interface changes require a PR with sign-off from backend and frontend leads.*
