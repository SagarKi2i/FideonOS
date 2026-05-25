# Fideon OS — Agent Structure & Dashboard Architecture

**Version:** 1.0  
**Created:** 2026-05-22  
**Status:** Approved  
**Architecture Reference:** `Fideon_Architecture_Review_v3.html`  
**Stack:** Next.js 15 → FastAPI (Python) → Self-Hosted Supabase PostgreSQL  
**Related:** `Auth_Module_Plan.md` · `api_overview.md` · `api_contracts.md`

> **Architecture decision:** Agent dashboards are driven entirely by database-stored configuration.
> Adding a new agent requires zero frontend code changes — only a DB insert into `agents`,
> `agent_versions`, and `agent_dashboard_templates`. The frontend renders whatever the DB says.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Agent Identity — what is agent_id?](#2-agent-identity--what-is-agent_id)
3. [Database Tables — Full Schema](#3-database-tables--full-schema)
4. [Seven Data Layers — Document Retrieval Example](#4-seven-data-layers--document-retrieval-example)
5. [Write Path — On Every Run Complete](#5-write-path--on-every-run-complete)
6. [Sample Queries](#6-sample-queries)
7. [API Endpoints](#7-api-endpoints)
8. [Pydantic Schemas](#8-pydantic-schemas)
9. [Migration — Changes from Current Code](#9-migration--changes-from-current-code)
10. [Agent Catalog Reference](#10-agent-catalog-reference)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                   BROWSER / ELECTRON (Tier 1)                     │
│                                                                    │
│  Admin Panel        Marketplace + My Agents  Agent Dashboard       │
│  ─ manage users     ─ agents            ─ KPI tiles from     │
│  ─ review requests  ─ user_agents         user_agent_stats.stats
│  ─ manage devices   ─ agent_access_requests ─ Activity from agent_runs │
│                     ─ custom_agents           ─ HITL from agent_run_approvals │
└──────────────────────────────┬───────────────────────────────────┘
                               │  RS256 JWT cookie / Bearer service token
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    FASTAPI BACKEND (Tier 2)                        │
│                                                                    │
│  routers/agent_runs.py       ← agent dashboard, run trigger, analytics  │
│  routers/agents.py     ← marketplace, my-agents, activation       │
│  routers/admin.py      ← agent requests, stats, user management   │
│  routers/chat.py       ← SSE streaming for agent run execution    │
│  services/agent_stats.py ← aggregation helper (2 writes per run)    │
└──────────────────────────────┬───────────────────────────────────┘
                               │  supabase-py (service role key)
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│            SELF-HOSTED SUPABASE POSTGRESQL (Tier 3)               │
│                                                                    │
│  Group 1 — Agent Catalog & Access (10 tables)                     │
│    agents · agent_versions · agent_dashboard_templates          │
│    user_agents · user_agent_stats                        │
│    agent_access_requests · agent_runs · agent_run_approvals           │
│                                                                    │
│  Group 2 — Custom Agents (2 tables)                               │
│    custom_agents · custom_agent_requests                             │
│                                                                    │
│  Group 3 — Integrations (2 tables)                                │
│    carrier_connections · ams_connections                           │
│                                                                    │
│  Group 4 — Automations & Workflows (7 tables)                     │
│    workflows · workflow_steps · runs · run_steps                   │
│    langgraph_checkpoints · approvals · notifications               │
│                                                                    │
│  Group 5 — Devices & Edge (5 tables)                              │
│    devices · device_model_allocations · device_sync_logs          │
│    device_usage_logs · device_daily_analytics                     │
│                                                                    │
│  Group 6 — Platform Audit (1 table)                               │
│    audit_logs                                                      │
└──────────────────────────────────────────────────────────────────┘
```

### Core Design Principles

- **KPI tiles are always O(1).** `user_agent_stats.stats` is a pre-aggregated JSONB blob written at run completion. Dashboard page load never runs a GROUP BY.
- **Widget config lives in the DB.** `agent_dashboard_templates.widgets` is a JSONB array that drives every KPI tile — header, footer, field name, delta format, color thresholds. Zero frontend code changes per new agent.
- **Two writes per run.** On completion: (1) write per-run detail to `agent_runs.metrics` + `agent_runs.activity`; (2) lock and recompute running totals into `user_agent_stats.stats`.
- **Lazy loading for expensive tabs.** Activity feed, Trends chart, Breakdown, and AI Insights tabs all fire separate queries on tab click, never on page load.

---

## 2. Agent Identity — What is agent_id?

`agent_id` is a UUID primary key from the `agents` table. It is the canonical identity of an agent and is used as a foreign key in every agent-related table.

The six live agents and their keywords (used in API paths and the frontend catalog):

| Agent Name | keyword | `agents.id` |
|----------|----------|------------------|
| Document Retrieval | `document-retrieval` | UUID in `agents` |
| Loss Run Reporting | `loss-run-reporting` | UUID in `agents` |
| Policy Comparison Engine | `policy-comparison` | UUID in `agents` |
| Quote Generation Agent | `quote-generation` | UUID in `agents` |
| Coverage Validation | `coverage-validation` | UUID in `agents` |
| Renewal Review | `renewal-review` | UUID in `agents` |

**How keyword and user identity work together:**

```
URL: /api/agents/policy-comparison/dashboard
         ↓ Next.js useParams() → keyword = "policy-comparison"
         ↓ GET /api/agents/policy-comparison/dashboard  (Cookie: access_token=<jwt>)
                │                                │
          keyword (URL)                   user_id (JWT)
         which agent?                     which user?
                └──────────┬─────────────────┘
                    FastAPI combines both:
                    SELECT ... FROM user_agents
                    WHERE ag.keyword = 'policy-comparison'   ← agent from URL
                      AND ua.user_id = jwt_user_id           ← user from token
                    Returns: that user's stats for that agent only
```

> **keyword is the API path identity.** `agents.keyword` (kebab-case, UNIQUE) is used in all
> agent API paths. FastAPI resolves keyword → UUID internally (one indexed lookup, ~20 rows max).
> User identity always comes from the JWT — never from the URL. Same keyword, different JWT = different data.

---

## 3. Database Tables — Full Schema

### Group 1 — Agent Catalog & Access (10 tables)

---

#### `agents` — Agent catalog (Marketplace only)

```sql
CREATE TABLE public.agents (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword              TEXT        NOT NULL UNIQUE,   -- kebab-case API path identity, e.g. "policy-comparison"
  name                 TEXT        NOT NULL,
  description          TEXT,
  domain               TEXT        NOT NULL,          -- "insurance" | "banking" | ...
  tagline              TEXT,                          -- short marketplace headline
  icon_asset_file_name TEXT,
  current_version_id   UUID        REFERENCES public.agent_versions(id),
                                                      -- pointer to active version; avoids per-call lookup
  status               TEXT        NOT NULL DEFAULT 'coming_soon'
                       CHECK (status IN ('live','beta','coming_soon','deprecated')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agents_keyword_idx ON public.agents (keyword);
CREATE INDEX agents_domain_idx  ON public.agents (domain);
CREATE INDEX agents_status_idx  ON public.agents (status);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
-- Read: all authenticated users (marketplace); Write: service role only
```

---

#### `agent_versions` — Versioned prompts and schemas

```sql
CREATE TABLE public.agent_versions (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                      UUID        NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  version                     TEXT        NOT NULL,   -- e.g. "1.0.0", "1.1.0"
  prompt_template             TEXT,                   -- single source of truth, versioned
  narrative_prompt_template   TEXT,                   -- Jinja template; Claude generates narrative post-run
  pydantic_rules_template     TEXT,                   -- output validation rules, versioned alongside prompt
  input_schema                JSONB,                  -- what a run must supply (see §4 Layer 5)
  output_schema               JSONB,                  -- what a run produces (see §4 Layer 6)
  is_active                   BOOLEAN     NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, version)
);

CREATE INDEX agent_versions_agent_id_idx ON public.agent_versions (agent_id);

ALTER TABLE public.agent_versions ENABLE ROW LEVEL SECURITY;
-- Read: all authenticated users; Write: service role only
-- Adding a field to input_schema or output_schema requires a new version row.
-- Old runs stay valid on their version — never mutate a version row.
```

---

#### `agent_dashboard_templates` — Per-agent widget config (one row per agent)

```sql
CREATE TABLE public.agent_dashboard_templates (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                UUID        NOT NULL UNIQUE REFERENCES public.agents(id) ON DELETE CASCADE,
  widgets               JSONB       NOT NULL DEFAULT '[]',
                                    -- Array of widget configs. Each widget:
                                    -- { id, type, field, format, header, footer,
                                    --   delta_field, delta_format, trend, invert,
                                    --   criteria: {good, warn, danger},
                                    --   color_indicator: {good, warn, danger} }
  tabs                  JSONB,      -- Array of tab objects: [{id, label, widgets[]}]
                                    -- Only for multi-tab agents (e.g. Loss Run Reporting).
                                    -- NULL for single-scroll agents.
  comparison_period_days INT        NOT NULL DEFAULT 30,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_dashboard_templates ENABLE ROW LEVEL SECURITY;
-- Read: all authenticated users; Write: service role only (admin edits in DB)
-- Zero frontend code changes needed to modify or add KPI tiles — edit this row.
```

**Widget config shape:**

```jsonc
// widgets[] entry — all fields:
{
  "id": "documents_synced",        // stable identifier — must match stats key
  "type": "kpi_tile",
  "field": "documents_synced",     // key in user_agent_stats.stats
  "format": "number",              // number | percent | currency | seconds | score
  "header": "Documents Synced",    // display label shown above the value
  "footer": "Last 30 days",        // sub-text shown below the value
  "delta_field": "documents_synced_delta_pct",  // key in stats for delta value (null if none)
  "delta_format": "percent",       // percent | absolute_pts | absolute | absolute_usd | label
  "trend": true,                   // show trend arrow
  "invert": false,                 // if true, down = green (e.g. failed_pulls, avg_time)
  "criteria": {
    "good":   { "gte": 2000 },     // threshold — gte | lte | lt | gt | eq_field
    "warn":   { "gte": 1000 },
    "danger": { "lt":  1000 }
  },
  "color_indicator": {
    "good":   "#15803d",
    "warn":   "#d97706",
    "danger": "#dc2626"
  }
}
```

**Tabs config shape (Loss Run Reporting only):**

```jsonc
// tabs[] entry:
{
  "id": "renewal_book",
  "label": "Renewal book",
  "widgets": [ /* same widget shape as above, rendered for this tab only */ ]
}
```

---

#### `user_agents` — Who has access to which agent

```sql
CREATE TABLE public.user_agents (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  agent_id             UUID        NOT NULL REFERENCES public.agents(id),
  current_version_id UUID        REFERENCES public.agent_versions(id),
                                 -- pinned version for this activation; NULL = always latest
  model_name         TEXT        NOT NULL,   -- denormalized for display without JOIN
  domain             TEXT        NOT NULL,
  activated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active          BOOLEAN     NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE INDEX user_agents_user_id_idx ON public.user_agents (user_id);
CREATE INDEX user_agents_agent_id_idx  ON public.user_agents (agent_id);

ALTER TABLE public.user_agents ENABLE ROW LEVEL SECURITY;
-- service_role only — user identity is enforced in FastAPI WHERE clauses, not by RLS.
-- (auth.uid() is unavailable under custom RS256 auth; see migration 20260523000200.)
CREATE POLICY user_agents_service ON public.user_agents
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

> **Change from current code:** `model_id TEXT` → `agent_id UUID` (FK to `agents`).
> `current_version_id` and `activated_at` columns added. See §9 Migration — migration `015_alter_user_agents.sql`.

---

#### `user_agent_stats` — Live KPI stats (runner writes only)

```sql
CREATE TABLE public.user_agent_stats (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_agent_id  UUID        NOT NULL UNIQUE REFERENCES public.user_agents(id) ON DELETE CASCADE,
  stats               JSONB       NOT NULL DEFAULT '{}',
                                  -- Pre-aggregated KPI values + deltas.
                                  -- Written by runner on every run completion.
                                  -- Read O(1) — no GROUP BY ever at read time.
                                  -- Shape: { <field>: value, <field>_delta: value,
                                  --          completed_today: N, last_activity_at: ts,
                                  --          narrative: { headline, summary, highlights[], recommendations[] } }
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_agent_stats ENABLE ROW LEVEL SECURITY;
-- service_role only (read + write). User scoping enforced in FastAPI.
CREATE POLICY uas_service ON public.user_agent_stats
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

> **New table** — does not exist in current code. Row is inserted when a model is activated.
> Stats JSONB is initialized as `{}` and populated on first run completion.

---

#### `agent_access_requests` — Marketplace agent access requests

User requests access to an existing marketplace agent Fideon provides. `agent_id` is always required (FK to `agents`) — this table is for marketplace agents only. For custom agent builds, see `custom_agent_requests` in Group 2.

```sql
CREATE TABLE public.agent_access_requests (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  agent_id           UUID        NOT NULL REFERENCES public.agents(id),
  model_name       TEXT        NOT NULL,   -- denormalized for display without JOIN
  status           TEXT        NOT NULL DEFAULT 'submitted'
                   CHECK (status IN ('submitted','approved','rejected')),
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      UUID        REFERENCES public.users(id),
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX aar_user_id_idx    ON public.agent_access_requests (user_id);
CREATE INDEX aar_agent_id_idx   ON public.agent_access_requests (agent_id);
CREATE INDEX aar_status_idx     ON public.agent_access_requests (status);

ALTER TABLE public.agent_access_requests ENABLE ROW LEVEL SECURITY;
-- service_role only; user + admin scoping enforced in FastAPI.
CREATE POLICY aar_service ON public.agent_access_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

> **Distinct from `custom_agent_requests`:** This table is only for existing Fideon marketplace agents.
> When approved, admin sets `is_active = true` in `user_agents` for this user+agent pair.

---

#### `agent_runs` — Per-run execution log

```sql
CREATE TABLE public.agent_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.users(id),
  agent_id          UUID        NOT NULL REFERENCES public.agents(id),
  version_used    UUID        REFERENCES public.agent_versions(id),
                              -- which version was active at run time
  status          TEXT        NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','complete','failed')),
  input           JSONB,      -- run input payload (matches agent_versions.input_schema)
  output          JSONB,      -- raw run output
  confidence      DECIMAL(5,2),
  metrics         JSONB,      -- per-run KPIs (see §4 Layer 3); written at completion
  activity        JSONB,      -- Activity tab feed entry (see §4 Layer 4); written at completion
  human_in_the_loop BOOLEAN   NOT NULL DEFAULT false,
                              -- flag only; full approval detail in agent_run_approvals
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,  -- NULL while status = 'running'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agent_runs_user_agent_started_idx ON public.agent_runs (user_id, agent_id, started_at DESC);
-- Covers: Activity tab (Q3), Trends tab (Q7), write path pre-flight
CREATE INDEX agent_runs_agent_id_idx ON public.agent_runs (agent_id);
CREATE INDEX agent_runs_status_idx ON public.agent_runs (status);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
-- service_role only; user scoping enforced in FastAPI WHERE clauses.
CREATE POLICY agent_runs_service ON public.agent_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

> **New table** — replaces the hardcoded mock data in `AgentAnalyticsDashboard.tsx`.
> Written by the FastAPI runner, not by the SSE chat stream directly.

---

#### `agent_run_approvals` — HITL approval detail (separate from run)

```sql
CREATE TABLE public.agent_run_approvals (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID        NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES public.users(id),
  hitl_status  TEXT        NOT NULL DEFAULT 'pending'
               CHECK (hitl_status IN ('pending','approved','rejected','escalated')),
  decision     TEXT,        -- reviewer's decision text
  reviewer_id  UUID        REFERENCES public.users(id),
  reviewed_at  TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ara_run_id_idx    ON public.agent_run_approvals (run_id);
CREATE INDEX ara_user_id_idx   ON public.agent_run_approvals (user_id);
CREATE INDEX ara_status_idx    ON public.agent_run_approvals (hitl_status);

ALTER TABLE public.agent_run_approvals ENABLE ROW LEVEL SECURITY;
-- service_role only; user scoping enforced in FastAPI.
CREATE POLICY ara_service ON public.agent_run_approvals
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

> **New table** — pulled out of `agent_runs` so approval state doesn't pollute the run row.
> `agent_runs.human_in_the_loop` is a boolean flag only; full detail is here.

---

### Group 2 — Custom Agents (2 tables)

#### `custom_agents` — User-built agents

> **⚠️ Implemented reality:** migration `20260523000300_fix_custom_agents_fk.sql`
> currently creates only a **minimal stub** (`id, title, description, status,
> created_by, created_at, updated_at`) to satisfy the FK from `custom_agent_requests`.
> The full schema below is the **target design** and is NOT yet implemented — its
> functionality is owned by a separate workstream. No backend code reads the extra
> columns today. Treat the block below as the spec to build toward.

```sql
CREATE TABLE public.custom_agents (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  description       TEXT,
  icon              TEXT,
  category          TEXT,
  job_lane          TEXT,
  sop_text          TEXT,
  parsed_steps      JSONB,
  status            TEXT        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','live','archived')),
  is_active         BOOLEAN     NOT NULL DEFAULT false,
  mcp_tool_name     TEXT,
  automation_status TEXT,
  automation_targets JSONB,
  playwright_script TEXT,
  last_run_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY custom_agents_service ON public.custom_agents
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

#### `custom_agent_requests` — User's own custom agent build requests

User requests that Fideon build them a **brand-new custom agent** they designed themselves (not a marketplace agent). Carries the full build pipeline lifecycle from submission through installation.

```sql
CREATE TABLE public.custom_agent_requests (
  id                           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title                        TEXT        NOT NULL,   -- user-provided name for the custom agent
  sop_text                     TEXT,                   -- user-provided SOP / workflow description
  sop_file_url                 TEXT,                   -- uploaded SOP document
  target_carriers              TEXT[],                 -- carriers this agent should support
  priority                     TEXT        NOT NULL DEFAULT 'normal'
                               CHECK (priority IN ('low','normal','high','urgent')),
  expected_outcome             TEXT,
  phone_no                     TEXT,
  desired_by                   DATE,
  status                       TEXT        NOT NULL DEFAULT 'submitted'
                               CHECK (status IN ('submitted','in_review','building','testing','installed')),
  status_history               JSONB       NOT NULL DEFAULT '[]',
                                            -- Append-only log: [{status, changed_at, changed_by, note}]
                                            -- NOT for querying current state — use status column
  assigned_admin_id            UUID        REFERENCES public.users(id),
  reviewed_at                  TIMESTAMPTZ,
  reviewed_by                  UUID        REFERENCES public.users(id),
  rejection_reason             TEXT,
  custom_agent_id              UUID        REFERENCES public.custom_agents(id),
                                            -- set when Fideon creates the custom_agents row (build phase)
  installed_user_agent_id UUID        REFERENCES public.user_agents(id),
                                            -- set when the built agent is installed for this user
  installed_at                 TIMESTAMPTZ,
  requested_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX car_user_id_idx  ON public.custom_agent_requests (user_id);
CREATE INDEX car_status_idx   ON public.custom_agent_requests (status);

ALTER TABLE public.custom_agent_requests ENABLE ROW LEVEL SECURITY;
-- service_role only; user + admin scoping enforced in FastAPI.
CREATE POLICY car_service ON public.custom_agent_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

> **Distinct from `agent_access_requests`:** This table is for user-initiated custom agent builds.
> `agent_access_requests` is for requesting access to existing Fideon marketplace agents.

---

### Group 3 — Integrations (2 tables)

> **GLOBAL / ADMIN-MANAGED:** carrier & AMS credentials are set **once by an admin** and apply to
> **all users** automatically. One global row per `carrier_id` / `ams_id` — there is **no `user_id`**.
> `set_by` records the admin. Reads are open to any authenticated user; writes require admin
> (`require_admin`). Implemented in `20260522020850_create_integrations.sql` + `routers/settings.py`.

#### `carrier_connections` — Carrier portal credentials (global, admin-set)

```sql
CREATE TABLE public.carrier_connections (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id         TEXT        NOT NULL UNIQUE,   -- one global row per carrier
  set_by             UUID        REFERENCES public.users(id) ON DELETE SET NULL,  -- admin who set it
  username           TEXT,
  password_ciphertext TEXT,       -- encrypted at the app layer; never plaintext
  credential_token   TEXT,
  producer_codes     JSONB,
  extra              JSONB,       -- { portal_url, doc_types, sources, email_alias }
  status             TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','connected','error')),
  last_test_at       TIMESTAMPTZ,
  last_test_message  TEXT,
  last_synced_at     TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.carrier_connections ENABLE ROW LEVEL SECURITY;
-- service_role only; admin/global scoping enforced in FastAPI.
CREATE POLICY carrier_connections_service ON public.carrier_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

> **Doc-retrieval config lives in `extra`:** `{ sources, doc_types, email_alias }` — admin-set,
> global, managed via `PUT /api/agents/doc-retrieval-config/{carrier_id}` (merged into `extra`).
> The legacy per-user `document_retrieval_configs` table is deprecated.

#### `ams_connections` — AMS credentials (global, admin-set)

```sql
CREATE TABLE public.ams_connections (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ams_id            TEXT        NOT NULL UNIQUE,   -- one global row per AMS
  set_by            UUID        REFERENCES public.users(id) ON DELETE SET NULL,  -- admin who set it
  auth_method       TEXT        NOT NULL DEFAULT 'credentials'
                    CHECK (auth_method IN ('credentials','sdk')),
  username          TEXT,
  password_ciphertext TEXT,       -- encrypted at the app layer
  api_key_ciphertext TEXT,        -- SDK tab
  instance_url      TEXT,
  tenant_id         TEXT,
  credential_token  TEXT,
  extra             JSONB,        -- { db_name_sandbox, db_name_prod }
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','connected','error')),
  last_test_at      TIMESTAMPTZ,
  last_test_message TEXT,
  last_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ams_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY ams_connections_service ON public.ams_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

---

### Group 4 — Automations & Workflows (7 tables)

See existing `routers/workflows.py` and `routers/workflow_ai.py`. Tables:

| Table | Phase | Purpose |
|-------|-------|---------|
| `workflows` | BUILD | Workflow definition written on Save |
| `workflow_steps` | BUILD | Ordered agent steps in a workflow |
| `runs` | RUN | Execution record written on Run |
| `run_steps` | RUN | Per-step execution detail |
| `langgraph_checkpoints` | RUN | Managed by LangGraph PostgresSaver; `user_id` added for RLS |
| `approvals` | USER | Failure review queue |
| `notifications` | USER | Run event notifications |

> Full schema in the workflow implementation plan (to be created).

---

### Group 5 — Devices & Edge (5 tables)

Existing tables. Fully implemented in `routers/devices.py`:

| Table | Purpose |
|-------|---------|
| `devices` | Electron desktop devices — `/admin`, `/devices` |
| `device_model_allocations` | Models allocated to each device |
| `device_sync_logs` | Sync history — used in admin dashboard failure count |
| `device_usage_logs` | Usage telemetry per device |
| `device_daily_analytics` | Daily rollup per device — UNIQUE (device_id, date) |

---

### Group 6 — Platform Audit (1 table)

```sql
-- Already defined in Auth_Module_Plan.md §2.9
-- All agent events that require audit trail write to audit_logs with:
-- resource_type = 'agent' | 'agent_run' | 'agent_activation'
-- action = 'AGENT_RUN_STARTED' | 'AGENT_RUN_COMPLETED' | 'AGENT_RUN_FAILED'
--        | 'AGENT_ACTIVATED' | 'AGENT_DEACTIVATED' | 'AGENT_REQUEST_SUBMITTED'
--        | 'AGENT_REQUEST_APPROVED' | 'AGENT_REQUEST_REJECTED'
```

---

### Schema Relationship Map

```
public.agents (id)
  │
  ├──< public.agent_versions.agent_id                (1:N)
  │     └── agents.current_version_id → agent_versions (back-pointer)
  │
  ├──  public.agent_dashboard_templates.agent_id        (1:1 UNIQUE)
  │
  ├──< public.user_agents.agent_id               (1:N — one per user per agent)
  │     │
  │     ├──  public.user_agent_stats.user_agent_id  (1:1 UNIQUE)
  │     └──  user_agents.current_version_id → agent_versions
  │
  ├──< public.agent_access_requests.agent_id        (1:N — marketplace access requests)
  │
  └──< public.agent_runs.agent_id                       (1:N)

public.custom_agents (id)
  └──< public.custom_agent_requests.custom_agent_id   (N:1, nullable — set during build phase)
```

---

## 4. Seven Data Layers — Document Retrieval Example

Every agent dashboard is built from 7 data layers. The example below uses Document Retrieval (`keyword = "document-retrieval"`).

---

### Layer 1 — `agent_dashboard_templates.widgets` (shape only, no values)

Admin edits this in the DB. Frontend renders whatever is here.

```json
{
  "comparison_period_days": 30,
  "widgets": [
    {
      "id": "documents_synced",
      "type": "kpi_tile",
      "field": "documents_synced",
      "format": "number",
      "header": "Documents Synced",
      "footer": "Last 30 days",
      "delta_field": "documents_synced_delta_pct",
      "delta_format": "percent",
      "trend": true,
      "criteria": { "good": { "gte": 2000 }, "warn": { "gte": 1000 }, "danger": { "lt": 1000 } },
      "color_indicator": { "good": "#15803d", "warn": "#d97706", "danger": "#dc2626" }
    },
    {
      "id": "sync_success_rate",
      "type": "kpi_tile",
      "field": "sync_success_rate",
      "format": "percent",
      "header": "Sync Success Rate",
      "footer": "percentage of successful syncs",
      "delta_field": "sync_success_rate_delta_pts",
      "delta_format": "absolute_pts",
      "trend": true,
      "criteria": { "good": { "gte": 95 }, "warn": { "gte": 85 }, "danger": { "lt": 85 } },
      "color_indicator": { "good": "#15803d", "warn": "#d97706", "danger": "#dc2626" }
    },
    {
      "id": "avg_retrieval_time_s",
      "type": "kpi_tile",
      "field": "avg_retrieval_time_s",
      "format": "seconds",
      "header": "Avg. Retrieval Time",
      "footer": "Per document",
      "invert": true,
      "delta_field": "avg_retrieval_time_s_delta",
      "delta_format": "absolute",
      "trend": true,
      "criteria": { "good": { "lte": 15 }, "warn": { "lte": 30 }, "danger": { "gt": 30 } },
      "color_indicator": { "good": "#15803d", "warn": "#d97706", "danger": "#dc2626" }
    },
    {
      "id": "carriers_connected",
      "type": "kpi_tile",
      "field": "carriers_connected",
      "format": "number",
      "header": "Carriers Connected",
      "footer": "active carrier portals",
      "delta_field": "carriers_connected_delta",
      "delta_format": "absolute",
      "trend": false,
      "criteria": { "good": { "gte": 20 }, "warn": { "gte": 10 }, "danger": { "lt": 10 } },
      "color_indicator": { "good": "#15803d", "warn": "#d97706", "danger": "#dc2626" }
    },
    {
      "id": "failed_pulls",
      "type": "kpi_tile",
      "field": "failed_pulls",
      "format": "number",
      "header": "Failed Pulls",
      "footer": "lower is better",
      "invert": true,
      "delta_field": "failed_pulls_delta",
      "delta_format": "absolute",
      "trend": true,
      "criteria": { "good": { "lte": 20 }, "warn": { "lte": 50 }, "danger": { "gt": 50 } },
      "color_indicator": { "good": "#15803d", "warn": "#d97706", "danger": "#dc2626" }
    }
  ]
}
```

---

### Layer 2 — `user_agent_stats.stats` (live KPI tile values)

Pre-aggregated at write time. No GROUP BY at read time. Always O(1).

```json
{
  "documents_synced": 2847,
  "documents_synced_delta_pct": 18.2,
  "sync_success_rate": 98.4,
  "sync_success_rate_delta_pts": 1.2,
  "avg_retrieval_time_s": 11.7,
  "avg_retrieval_time_s_delta": -3.1,
  "carriers_connected": 24,
  "carriers_connected_delta": 3,
  "failed_pulls": 46,
  "failed_pulls_delta": -12,
  "ocr_confidence": 96.2,
  "portal_2fa_issues": 12,
  "completed_today": 12,
  "last_activity_at": "2026-05-19T14:08:00Z",
  "narrative": {
    "headline": "Strong week — retrieval time down 21%, syncs up 18%",
    "summary": "...",
    "highlights": ["..."],
    "recommendations": ["..."]
  }
}
```

> `ocr_confidence` and `portal_2fa_issues` are stored in `stats` but have no widget entry —
> they feed the narrative prompt (Layer 7) only.

---

### Layer 3 — `agent_runs.metrics` (this run only)

Written at run completion. Never aggregated at read time.

```json
{
  "documents_synced": 12,
  "sync_success": true,
  "retrieval_time_s": 11.7,
  "carriers_hit": 3,
  "failed": 0,
  "doc_types": { "renewal": 7, "endorsement": 3, "invoice": 2 }
}
```

---

### Layer 4 — `agent_runs.activity` (Activity tab feed entry)

One row per run. Lazy — fires only on Activity tab click.

```json
{
  "title": "12 docs synced from 3 carriers",
  "subtitle": "Travelers · Chubb · Hartford",
  "icon": "check",
  "status": "success",
  "duration_s": 11.7,
  "timestamp": "2026-05-19T10:42:00Z"
}
```

> `icon` maps to a Lucide icon name. Rendered as `<LucideIcon name={activity.icon} />`.

---

### Layer 5 — `agent_versions.input_schema` (what a run must supply)

Validated by FastAPI before the run starts. `carrier_ids` resolved against `carrier_connections`.

```json
{
  "carrier_ids":    { "type": "array",  "items": "string",  "required": true },
  "date_range":     { "type": "object",                     "required": true },
  "document_types": {
    "type": "array",
    "items": "string",
    "required": true,
    "enum": ["renewal", "endorsement", "cancellation"]
  },
  "email_alias":    { "type": "string", "required": false }
}
```

---

### Layer 6 — `agent_versions.output_schema` (what a run produces)

Per-run fields only — matches `agent_runs.metrics` (Layer 3). Deltas and aggregates live in `user_agent_stats` (Layer 2). Adding a field requires a new `agent_versions` row.

```json
{
  "documents_synced":  { "type": "number" },
  "sync_success":      { "type": "boolean" },
  "retrieval_time_s":  { "type": "number" },
  "carriers_hit":      { "type": "number" },
  "failed":            { "type": "number" },
  "doc_types":         { "type": "object" },
  "completed_at":      { "type": "timestamp" }
}
```

---

### Layer 7 — `agent_versions.narrative_prompt_template` (Jinja, admin edits in DB)

Claude generates the narrative using this template filled with Layer 2 stats. Admin tunes tone and focus without a deploy.

```
You are an insurance operations analyst reviewing a Document Retrieval agent
over the past {{ comparison_period_days }} days.

Agent metrics:
- Documents synced:   {{ documents_synced }} ({{ documents_synced_delta_pct }}% vs prior)
- Sync success rate:  {{ sync_success_rate }}% ({{ sync_success_rate_delta_pts }} pts)
- Avg retrieval time: {{ avg_retrieval_time_s }}s ({{ avg_retrieval_time_s_delta }}s)
- Carriers connected: {{ carriers_connected }} (+{{ carriers_connected_delta }})
- Failed pulls:       {{ failed_pulls }} ({{ failed_pulls_delta }})
- OCR confidence:     {{ ocr_confidence }}%
- Portal 2FA issues:  {{ portal_2fa_issues }}

Return JSON only:
{ "headline": "...", "summary": "...", "highlights": [...], "recommendations": [...] }
```

---

### KPI Tile Rendering (how Layers 1 + 2 produce the UI)

| KPI tile | Value | Delta | Rendered |
|----------|-------|-------|----------|
| Documents Synced | `stats.documents_synced` = 2,847 | `+18.2% ↑` | green (gte 2000) |
| Sync Success Rate | `stats.sync_success_rate` = 98.4% | `+1.2 pts ↑` | green (gte 95) |
| Avg. Retrieval Time | `stats.avg_retrieval_time_s` = 11.7s | `−3.1s ↓ good` | green (invert: lte 15) |
| Carriers Connected | `stats.carriers_connected` = 24 | `+3 this period` | green (gte 20) |
| Failed Pulls | `stats.failed_pulls` = 46 | `−12 ↓ good` | green (invert: lte 20) |

---

### Agent-Specific Stats Reference

Each agent's `user_agent_stats.stats` shape matches its `agent_dashboard_templates.widgets`:

| Agent | Key stats fields |
|-----|-----------------|
| **Document Retrieval** | `documents_synced`, `sync_success_rate`, `avg_retrieval_time_s`, `carriers_connected`, `failed_pulls` |
| **Loss Run Reporting** | `loss_runs_processed`, `avg_loss_ratio_pct`, `carriers_pulled`, `open_claims`, `avg_pull_time_s` + tab fields: `portfolio_renewals_due_30d/90d`, `prospects_count`, `loss_runs_received` |
| **Policy Comparison** | `comparisons_run`, `avg_coverage_score`, `coverage_gaps_found`, `avg_premium_delta_usd`, `recommendations_acted_pct` |
| **Quote Generation** | `quotes_generated`, `bind_rate_pct`, `avg_premium_usd`, `avg_turnaround_s`, `quoted_premium_usd` |
| **Coverage Validation** | `policies_checked`, `discrepancies_found`, `avg_check_time_s`, `auto_resolved`, `pending_review` |
| **Renewal Review** | `renewals_prepped`, `avg_premium_delta_pct`, `changes_flagged`, `client_emails_drafted`, `avg_prep_time_s` |

---

## 5. Write Path — On Every Run Complete

Two atomic writes happen when an agent run finishes. Never skip either.

```sql
-- Write 1: per-run detail (always first)
UPDATE agent_runs
SET
  status      = 'complete',
  metrics     = $metrics_jsonb,        -- Layer 3 shape: per-run numbers
  activity    = $activity_jsonb,       -- Layer 4 shape: { title, subtitle, icon, status, duration_s, timestamp }
  output      = $output_jsonb,
  confidence  = $confidence,
  finished_at = now()
WHERE id = $this_run_id;

-- Lock the stats row to prevent concurrent run overwrite for same user+agent
SELECT stats
FROM public.user_agent_stats uas
JOIN public.user_agents ua ON ua.id = uas.user_agent_id
WHERE ua.user_id = $jwt_user_id
  AND ua.agent_id  = $agent_id
FOR UPDATE;

-- Write 2: recompute and write running totals (atomic with the lock above)
UPDATE public.user_agent_stats
SET
  stats      = $new_stats_jsonb,       -- Layer 2 shape: aggregated + deltas + completed_today + last_activity_at
  updated_at = now()
WHERE user_agent_id = $user_agent_id;
```

**Aggregation logic (Python in `services/agent_stats.py`):**

```python
def recompute_stats(old_stats: dict, run_metrics: dict, comparison_period_days: int) -> dict:
    """
    Called after Write 1. Reads old_stats (from FOR UPDATE), applies run_metrics
    to produce new_stats for Write 2.

    Pattern:
    - Cumulative counts (documents_synced): old + this_run
    - Running averages (avg_retrieval_time_s): rolling average with run count
    - Delta vs prior period: requires reading agent_runs for the prior period window
      (SELECT SUM/AVG FROM agent_runs WHERE started_at >= now() - 2*period AND < now() - period)
      This is the ONLY GROUP BY that ever fires — once per run completion, not on reads.
    - completed_today: increments and resets at midnight UTC
    - last_activity_at: now()
    """
```

---

## 6. Sample Queries

All queries run via FastAPI (service role key). User identity always comes from the JWT — never from the request body.

**Keyword resolution (runs once per request, before any query below):**

```python
# FastAPI resolves keyword → UUID at the start of every agent handler
agent = await db.fetchrow(
    "SELECT id FROM public.agents WHERE keyword = $1", agent_keyword
)
if not agent:
    raise HTTPException(status_code=404, detail="Agent not found.")
agent_id = agent["id"]   # UUID used in all queries below
```

---

### Q1 — User Dashboard page load (all agents, 1 query)

```sql
SELECT
  ua.id               AS user_agent_id,
  ua.agent_id,
  ua.current_version_id,
  ua.is_active,
  ua.activated_at,
  uas.stats,
  ag.keyword,
  ag.name,
  ag.domain,
  ag.tagline,
  ag.icon_asset_file_name,
  pdt.widgets,
  pdt.tabs,
  pdt.comparison_period_days
FROM public.user_agents ua
JOIN public.user_agent_stats uas    ON uas.user_agent_id = ua.id
JOIN public.agents ag              ON ag.id = ua.agent_id
JOIN public.agent_dashboard_templates pdt ON pdt.agent_id = ua.agent_id
WHERE ua.user_id  = $jwt_user_id
  AND ua.is_active = true
ORDER BY ua.activated_at DESC;
-- Single JOIN, O(n agents), no aggregation. Frontend loops result.
```

---

### Q2 — Agent KPI tiles refresh (O(1), instant)

```sql
SELECT
  uas.stats,
  uas.updated_at,
  pdt.widgets,
  pdt.comparison_period_days
FROM public.user_agent_stats uas
JOIN public.user_agents ua         ON ua.id = uas.user_agent_id
JOIN public.agent_dashboard_templates pdt ON pdt.agent_id = ua.agent_id
WHERE ua.user_id = $jwt_user_id
  AND ua.agent_id  = $agent_id
LIMIT 1;
-- No GROUP BY, no SUM — always O(1).
-- Returns stats JSONB + widgets config together so frontend renders tiles immediately.
```

---

### Q3 — Activity tab (lazy — fires on tab click only)

```sql
SELECT
  ar.id          AS run_id,
  ar.activity,
  ar.metrics,
  ar.status,
  ar.started_at,
  ar.finished_at,
  ar.confidence,
  mv.version
FROM public.agent_runs ar
JOIN public.agent_versions mv ON mv.id = ar.version_used
WHERE ar.user_id = $jwt_user_id
  AND ar.agent_id  = $agent_id
ORDER BY ar.started_at DESC
LIMIT 20 OFFSET $offset;
-- Never on page load. Paginated. Index on (user_id, agent_id, started_at DESC) covers this.
```

---

### Q4 — Breakdown tab (doc types, carrier split — lazy)

```sql
SELECT
  ar.metrics->>'doc_types'         AS doc_types,
  ar.metrics->>'carriers_hit'      AS carriers_hit,
  ar.metrics->>'documents_synced'  AS docs,
  ar.metrics->>'failed'            AS failed,
  ar.started_at::date              AS run_date
FROM public.agent_runs ar
WHERE ar.user_id   = $jwt_user_id
  AND ar.agent_id    = $agent_id
  AND ar.started_at >= NOW() - INTERVAL '30 days'
  AND ar.status    = 'complete'
ORDER BY ar.started_at DESC;
-- Lazy on tab click. JSONB arrow operators extract fields.
-- Frontend aggregates for charts — no server-side GROUP BY needed.
```

---

### Q5 — AI Insights tab (narrative — lazy)

```sql
SELECT
  uas.stats->>'narrative' AS narrative,
  uas.updated_at
FROM public.user_agent_stats uas
JOIN public.user_agents ua ON ua.id = uas.user_agent_id
WHERE ua.user_id = $jwt_user_id
  AND ua.agent_id  = $agent_id
LIMIT 1;
-- Lazy on tab click. Narrative (2-3 KB) never returned on dashboard load.
-- Separate fetch keeps Q1 lean.
```

---

### Q6 — Single run detail (drill-down)

```sql
SELECT
  ar.id,
  ar.input,
  ar.output,
  ar.metrics,
  ar.activity,
  ar.status,
  ar.confidence,
  ar.started_at,
  ar.finished_at,
  ar.human_in_the_loop,
  mv.version,
  mv.input_schema,
  mv.output_schema
FROM public.agent_runs ar
JOIN public.agent_versions mv ON mv.id = ar.version_used
WHERE ar.id      = $run_id
  AND ar.user_id = $jwt_user_id;
-- user_id in WHERE = RLS-safe even for direct call.
-- Returns full input/output + schema for diff view.
```

---

### Q7 — Trends tab (daily rollup — lazy)

```sql
SELECT
  ar.started_at::date                                     AS day,
  COUNT(*)                                                AS runs,
  SUM((ar.metrics->>'documents_synced')::int)             AS docs_synced,
  AVG((ar.metrics->>'retrieval_time_s')::numeric)         AS avg_time_s,
  SUM((ar.metrics->>'failed')::int)                       AS total_failed
FROM public.agent_runs ar
WHERE ar.user_id   = $jwt_user_id
  AND ar.agent_id    = $agent_id
  AND ar.status    = 'complete'
  AND ar.started_at >= NOW() - INTERVAL '90 days'
GROUP BY ar.started_at::date
ORDER BY day DESC;
-- Lazy on tab click. GROUP BY only here — never on dashboard load.
-- Bounded by 90-day window. JSONB cast to numeric for AVG.
```

---

### Q8 — Version check (is user on latest?)

```sql
SELECT
  ua.current_version_id,
  ag.current_version_id        AS latest_version_id,
  mv_current.version           AS user_version,
  mv_latest.version            AS latest_version,
  (ua.current_version_id = ag.current_version_id) AS is_up_to_date
FROM public.user_agents ua
JOIN public.agents ag              ON ag.id = ua.agent_id
JOIN public.agent_versions mv_current  ON mv_current.id = ua.current_version_id
JOIN public.agent_versions mv_latest   ON mv_latest.id  = ag.current_version_id
WHERE ua.user_id = $jwt_user_id
  AND ua.agent_id  = $agent_id;
-- Shows banner if is_up_to_date = false.
-- Version upgrade = single UPDATE on user_agents.current_version_id.
```

---

### Q11 — Carrier connections pre-flight (before Document Retrieval run)

```sql
SELECT
  cc.carrier_id,
  cc.username,
  cc.password_ciphertext,    -- decrypted via Supabase Vault (AWS KMS) in FastAPI; never exposed to frontend
  cc.credential_token,
  cc.extra->>'portal_url'    AS portal_url,
  cc.extra->>'doc_types'     AS doc_types,
  cc.extra->>'email_alias'   AS email_alias,
  cc.status,
  cc.last_synced_at
FROM public.carrier_connections cc
WHERE cc.user_id    = $jwt_user_id
  AND cc.carrier_id = ANY($carrier_ids)
  AND cc.status     = 'connected';
-- ANY($carrier_ids) = batch lookup across all requested carriers.
```

---

### Q12 — Trigger run (insert + stats write path)

```sql
-- Step 1: insert run row (returns run_id for SSE stream)
INSERT INTO public.agent_runs
  (user_id, agent_id, version_used, status, input, started_at)
VALUES
  ($jwt_user_id, $agent_id, $version_id, 'running', $input_jsonb, NOW())
RETURNING id;

-- Step 2 (on completion): lock stats row
SELECT stats
FROM public.user_agent_stats uas
JOIN public.user_agents ua ON ua.id = uas.user_agent_id
WHERE ua.user_id = $jwt_user_id AND ua.agent_id = $agent_id
FOR UPDATE;

-- Step 3: write new totals atomically (see §5 Write Path)
UPDATE public.user_agent_stats
SET   stats = $new_stats_jsonb, updated_at = NOW()
WHERE user_agent_id = $user_agent_id;
```

---

## 7. API Endpoints

> **Single source of truth:** `backend/docs/api_overview.md` — 114 endpoints across 19 sections with priority, status, and auth for every route.
>
> All routes prefixed `/api`. Auth types: `JWT` (RS256 HttpOnly cookie) · `Bearer` (Electron service token) · `Device` (x-device-token) · `JWT+Admin` (role=admin + mfa_verified=true).

### Quick reference — agent and run routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/agents` | JWT | User's activated agents + live stats |
| `POST` | `/api/agents` | JWT | Activate agent |
| `GET` | `/api/agents/{agent_keyword}` | JWT | Agent detail + version check (Q8) |
| `PATCH` | `/api/agents/{agent_keyword}` | JWT | Update agent config |
| `DELETE` | `/api/agents/{agent_keyword}` | JWT | Deactivate agent |
| `GET` | `/api/agents/{agent_keyword}/dashboard` | JWT | Full dashboard — stats + widget config (Q1) |
| `GET` | `/api/agents/{agent_keyword}/stats` | JWT | KPI tiles — O(1) read (Q2) |
| `POST` | `/api/agents/{agent_keyword}/stats/refresh` | JWT | Recompute pre-aggregated stats |
| `GET` | `/api/agents/{agent_keyword}/runs` | JWT | Activity tab — paginated (Q3) |
| `POST` | `/api/agents/{agent_keyword}/runs` | JWT | Trigger agent run |
| `GET` | `/api/agents/{agent_keyword}/breakdown` | JWT | Breakdown tab — lazy (Q4) |
| `GET` | `/api/agents/{agent_keyword}/narrative` | JWT | AI Insights tab — lazy (Q5) |
| `GET` | `/api/agents/{agent_keyword}/trends` | JWT | Trends chart — 90-day rollup (Q7) |
| `GET` | `/api/agents/{agent_keyword}/versions` | JWT | Agent version history |
| `GET` | `/api/runs/{run_id}` | JWT | Full run detail — input, output, metrics (Q6) |
| `GET` | `/api/runs/{run_id}/status` | JWT | Poll run status |
| `POST` | `/api/runs/{run_id}/result` | Device | GPU/RunPod worker submits output + metrics |
| `PATCH` | `/api/runs/{run_id}` | JWT | Update run metadata |
| `PATCH` | `/api/runs/{run_id}/metrics` | JWT | Correct metrics after human review |
| `POST` | `/api/runs/{run_id}/cancel` | JWT | Cancel a running run |
| `POST` | `/api/runs/{run_id}/retry` | JWT | Retry a failed run |
| `POST` | `/api/runs/{run_id}/approve` | JWT | HITL approval decision |
| `GET` | `/api/runs/{run_id}/download` | JWT | Download output file |
| `GET` | `/api/runs/{run_id}/comments` | JWT | List reviewer comments |
| `POST` | `/api/runs/{run_id}/comments` | JWT | Add reviewer comment |

For all other routes (auth, admin, marketplace, settings, governance, workflows, devices, training, MCP, chat, help, system) — see `api_overview.md`.

---

## 8. Pydantic Schemas

Add to `backend/models/schemas.py`:

```python
from pydantic import BaseModel
from typing import Any
from uuid import UUID


# ── Agent Run ──────────────────────────────────────────────────────────────────

class AgentRunTrigger(BaseModel):
    """POST /api/agents/{agent_keyword}/runs — body must match agent_versions.input_schema."""
    input: dict[str, Any]


class AgentRunApproval(BaseModel):
    """POST /api/runs/{run_id}/approve"""
    decision: str            # "approved" | "rejected" | "escalated"
    notes: str | None = None


# ── Agent Activation ───────────────────────────────────────────────────────────

class ActivateAgentRequest(BaseModel):
    """POST /api/agents — body: { agent_id: UUID, model_name, domain }"""
    agent_id: UUID
    model_name: str          # denormalized for display
    domain: str


# ── Agent Activation Requests (marketplace) ────────────────────────────────────

class AgentActivationRequestCreate(BaseModel):
    """POST /api/agent-requests — request access to an existing marketplace agent"""
    agent_id: UUID
    model_name: str


class AgentActivationRequestUpdate(BaseModel):
    """PATCH /api/admin/agent-requests/{id} — admin approves or rejects"""
    status: str | None = None            # "approved" | "rejected"
    rejection_reason: str | None = None


# ── Custom Agent Requests (user's own build) ───────────────────────────────────

class CustomAgentRequestCreate(BaseModel):
    """POST /api/custom-agent-requests — request Fideon build a new custom agent"""
    title: str
    sop_text: str | None = None
    sop_file_url: str | None = None
    target_carriers: list[str] = []
    priority: str = "normal"
    expected_outcome: str | None = None
    phone_no: str | None = None
    desired_by: str | None = None   # ISO date string


class CustomAgentRequestUpdate(BaseModel):
    """PATCH /api/admin/custom-agent-requests/{id} — admin manages build pipeline"""
    status: str | None = None
    assigned_admin_id: str | None = None
    rejection_reason: str | None = None
    custom_agent_id: str | None = None
    installed_user_agent_id: str | None = None


# ── Admin Stats ────────────────────────────────────────────────────────────────

class AdminStatsResponse(BaseModel):
    """GET /api/admin/stats — extended from current"""
    total_devices: int
    active_devices: int
    pending_devices: int
    total_agent_requests: int
    total_users: int
    active_users_30d: int
    total_runs_today: int
    total_runs_week: int
    pending_approvals: int
```

---

## 9. Migration — Changes from Current Code

### Tables to create (new)

| Table | Priority | Blocker for |
|-------|----------|-------------|
| `agents` | P0 | Everything |
| `agent_versions` | P0 | Agent runs, versioning |
| `agent_dashboard_templates` | P0 | Real KPI tiles |
| `user_agent_stats` | P0 | Dashboard stats |
| `agent_runs` | P0 | Analytics chart (replaces mock data) |
| `agent_run_approvals` | P1 | HITL inbox |
| `agent_access_requests` | P1 | Marketplace agent access request queue |
| `custom_agent_requests` | P1 | Custom agent build request queue (replaces existing table) |

### Tables to alter (existing)

| Table | Change | Notes |
|-------|--------|-------|
| `user_agents` | Add `agent_id UUID FK → agents` | Replace `model_id TEXT` |
| `user_agents` | Add `current_version_id UUID FK → agent_versions` | New column, nullable |
| `user_agents` | Add `activated_at TIMESTAMPTZ` | Was missing |
| `carrier_connections` | Absorb `document_retrieval_configs` fields into `extra` JSONB | `sources`, `doc_types`, `email_alias` move to `extra` |

### Tables to deprecate

| Table | Replacement | Migration path |
|-------|-------------|----------------|
| `document_retrieval_configs` | `carrier_connections.extra` | Migrate rows, then drop |

### Router to create

```
backend/routers/agent_runs.py   ← new router for all agent dashboard, run, and analytics endpoints
```

Endpoints currently split across `agents.py` and `chat.py` that belong in `agent_runs.py`:
- `GET /api/agents/pod/{agent_id}` → move to `GET /api/agents/{agent_keyword}`
- `POST /api/chat/stream` → stays, but agent runs should log to `agent_runs` on start/complete

### Service to create

```
backend/services/agent_stats.py   ← recompute_stats() helper (Write 2 aggregation logic)
```

### Migration SQL files (run in order)

> **Canonical location: `supabase/migrations/` only.** All migrations — auth, agents,
> devices — live here as timestamped files. (The old `backend/migrations/` numbered
> tree was a duplicate and has been removed.)

```
supabase/migrations/
  20260522020000_create_agents.sql
  20260522020100_create_agent_versions.sql
  20260522020200_create_agent_dashboard_templates.sql
  20260522020300_create_user_agents.sql          ← base table (agent_id, current_version_id, activated_at)
  20260522020400_create_user_agent_stats.sql
  20260522020500_create_agent_runs.sql
  20260522020600_create_agent_run_approvals.sql
  20260522020700_create_agent_access_requests.sql  ← marketplace agent access requests
  20260522020800_create_custom_agent_requests.sql  ← title, sop_text, target_carriers, status_history, etc.
  20260522020900_migrate_carrier_connections.sql   ← absorb document_retrieval_configs
  20260522021000_seed_agents.sql                    ← insert the 6 live agents
  20260522021100_seed_agent_versions.sql            ← insert v1.0.0 for each agent
  20260522021200_seed_agent_dashboard_templates.sql ← insert widget configs for each agent
  20260523000200_fix_rls_custom_auth.sql            ← service_role-only RLS (custom auth)
  20260523000300_fix_custom_agents_fk.sql           ← custom_agents stub for FK
```

---

## 10. Agent Catalog Reference

The six live agents. Seed data for `agents`. `keyword` is the API path identity — used in all agent endpoint URLs:

| keyword | name | domain | status | MCP tool name |
|------|------|--------|--------|---------------|
| `document-retrieval` | Document Retrieval | insurance | live | `document_retrieval_pull` |
| `loss-run-reporting` | Loss Run Reporting | insurance | live | `loss_run_pull_report` |
| `policy-comparison` | Policy Comparison Engine | insurance | live | `policy_compare` |
| `quote-generation` | Quote Generation Agent | insurance | live | `quote_generation_fetch_quotes` |
| `coverage-validation` | Coverage Validation | insurance | live | `policy_check` |
| `renewal-review` | Renewal Review | insurance | live | `policy_renewal` |

### Dashboard tab layout by agent

| Agent | Has tabs? | Tab IDs |
|-----|-----------|---------|
| Document Retrieval | No | — (single-scroll) |
| Loss Run Reporting | **Yes** | `renewal_book`, `new_business` |
| Policy Comparison Engine | No | — |
| Quote Generation Agent | No | — |
| Coverage Validation | No | — |
| Renewal Review | No | — |

Loss Run Reporting is the only agent with a tabbed dashboard. Its `agent_dashboard_templates.tabs` holds two tab objects, each with their own `widgets[]`. The top-level `widgets[]` on the same row holds the 5 agent-level KPI tiles shared across both tabs.

---

*Changes to table schemas, widget configs, or API shapes require a PR + update to this file.
Adding a new agent requires only DB inserts (migrations 021–023 pattern) — no frontend code changes.*

*Last updated: 2026-05-22 — v1.0 Approved architecture (Fideon_Architecture_Review_v3)*
