# Pod Deployment — Implementation Plan

> **Companion to:** [pod-deployment-architecture.md](pod-deployment-architecture.md)
> **Status:** DRAFT — 2026-05-22
> **Purpose:** Phased build-out from the current "allocation-as-pod" model to a versioned, session-scoped pod runtime. Each phase ships independently and is reversible.

---

## At a glance

Five phases. Phase 0 is cleanup of two bugs that exist today. Phase 1 makes the pod's behaviour data-driven. Phase 2 introduces sessions and per-broker budgets. Phase 3 adds worker pools. Phase 4 is out-of-process runtimes for special cases.

Phase 1 is the inflection point: after it lands, the pod page meaningfully reflects which prompt + tools are running. Phase 2 is the second inflection: every decision is bound to a session, which is the join key governance has been missing.

Estimates are calendar days for one engineer with reviews. They assume the [model-registry-plan.md](model-registry-plan.md) ships in lockstep.

| Phase | Goal | Est. | Schema delta | Blocking on registry? |
|---|---|---|---|---|
| 0 | Fix G5 + G6 | 1–2 d | none | no |
| 1 | Data-driven prompt + tools | 4–6 d | `pod_definitions`, columns on `activated_models` | yes — registry Phase 1 |
| 2 | Sessions + budget | 4–5 d | `pod_sessions`, `pod_resource_profiles` | no |
| 3 | Worker pools | 5–7 d | `pod_deployments` | no |
| 4 | Out-of-process runtimes | unscheduled | (additive) | no |

---

## Phase 0 — Ground truth

**Goal:** before adding anything, fix two contradictions that make every later phase harder to reason about.

### 0.1 G5 — admin queue table mismatch

**Symptom:** [frontend/components/admin/PodActivationRequests.tsx:37](../../frontend/components/admin/PodActivationRequests.tsx#L37) reads from `pod_activation_requests`. But the only writer in the backend is [backend/routers/agents.py:91-103](../../backend/routers/agents.py#L91-L103) which writes to `custom_pod_requests`. The two tables track the same intent.

**Fix:**

1. Add `GET /api/admin/pod-requests` (admin-only) to `backend/routers/admin.py` that returns `custom_pod_requests` ordered by `requested_at DESC`.
2. Add `PATCH /api/admin/pod-requests/{id}` that mutates `status`, `status_notes`, `assigned_admin_id` — and, on `installed`, inserts the `activated_models` row + writes the new UUID into `installed_activated_model_id`.
3. Rewire `PodActivationRequests.tsx` to call the new admin endpoints via the FastAPI client.
4. Drop `pod_activation_requests` in a migration after confirming there is no production data (use `IF EXISTS`, but first run a select).

**Touched files:**
- [backend/routers/admin.py](../../backend/routers/admin.py)
- [backend/models/schemas.py](../../backend/models/schemas.py) — add `PodRequestStatusUpdate`
- [frontend/components/admin/PodActivationRequests.tsx](../../frontend/components/admin/PodActivationRequests.tsx)
- [frontend/lib/api.ts](../../frontend/lib/api.ts) — add `adminApi.podRequests*`
- New migration: `20260523000000_drop_pod_activation_requests.sql`

**Rollback:** drop the new admin routes; UI falls back to the old table. Do **not** drop `pod_activation_requests` until the new path is observed working for at least one full review cycle.

### 0.2 G6 — frontend bypasses FastAPI

**Symptom:** [frontend/components/admin/ModelAllocationSection.tsx:84-114](../../frontend/components/admin/ModelAllocationSection.tsx#L84-L114) uses the Supabase JS client to read and write `activated_models`. Contradicts the architecture in [CLAUDE.md](../../CLAUDE.md): *"The frontend never touches the database directly."*

**Fix:**

1. Add `GET /api/admin/users/{user_id}/allocations` and `POST /api/admin/users/{user_id}/allocations` to `backend/routers/admin.py`. The POST takes `{ model_id, model_name, domain }` and inserts into `activated_models` (or 409 on unique conflict).
2. Add `DELETE /api/admin/allocations/{allocation_id}` that deletes the row.
3. Replace the three `supabase.from('activated_models')` calls in `ModelAllocationSection.tsx` with the new typed `adminApi` calls.
4. Also replace the `fetch users` call ([line 60](../../frontend/components/admin/ModelAllocationSection.tsx#L60)) — it points at a Supabase Edge Function (`functions/v1/list-users`) that the project has migrated away from. Replace with the existing admin user-list endpoint if one exists, else add `GET /api/admin/users`.

**Touched files:**
- [backend/routers/admin.py](../../backend/routers/admin.py)
- [frontend/components/admin/ModelAllocationSection.tsx](../../frontend/components/admin/ModelAllocationSection.tsx)
- [frontend/lib/api.ts](../../frontend/lib/api.ts)

**Verification:**
- Allocate + deallocate via the admin UI, confirm `activated_models` rows change in Supabase.
- Confirm no `supabase.from(` calls remain in `frontend/components/admin/` (`Grep` for `supabase\.from\(`).

**Rollback:** revert the component; the Supabase RLS policies from [supabase/migrations/20260211105451_…sql](../../supabase/migrations/20260211105451_e1ad5a4d-556c-4343-8b30-1508a0fcba5c.sql) still allow admin direct writes, so reverting is safe.

---

## Phase 1 — Data-driven prompt + tools

**Goal:** the pod's personality moves from code into the database. After this phase, a non-engineer can author a new pod's prompt + tools without a deploy. This is the prerequisite for the registry's lineage write (registry Phase 2).

### 1.1 Schema

New table — `pod_definitions`:

```sql
CREATE TABLE public.pod_definitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id        TEXT NOT NULL UNIQUE,           -- matches activated_models.model_id
  name            TEXT NOT NULL,
  domain          TEXT NOT NULL,
  description     TEXT,
  default_version_id UUID REFERENCES public.model_versions(id),
  tool_manifest   JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_listed       BOOLEAN NOT NULL DEFAULT TRUE,   -- show in marketplace
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Columns added to `activated_models`:

```sql
ALTER TABLE public.activated_models
  ADD COLUMN pinned_version_id UUID REFERENCES public.model_versions(id),
  ADD COLUMN resource_profile_id UUID;   -- nullable until Phase 2
```

Seed migration: one `pod_definitions` row per current marketplace mock in [frontend/lib/insuranceMocks.ts](../../frontend/lib/insuranceMocks.ts), with `default_version_id` pointing at the matching domain row created by registry Phase 1.

### 1.2 Chat handler

[backend/routers/chat.py](../../backend/routers/chat.py) is rewritten to resolve a version before streaming:

```python
async def stream_chat(req: ChatRequest, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    alloc = (sb.table("activated_models")
        .select("model_id, pinned_version_id, pod_definitions!inner(default_version_id, tool_manifest)")
        .eq("user_id", user_id).eq("model_id", req.model_id)
        .maybe_single().execute())
    if not alloc.data:
        raise HTTPException(403, "Pod not allocated")

    version_id = alloc.data["pinned_version_id"] or alloc.data["pod_definitions"]["default_version_id"]
    version = sb.table("model_versions").select("prompt_template").eq("id", version_id).single().execute()
    # … pass version.data["prompt_template"] as system_prompt
```

`stream_chat_as_openai_sse` already accepts `system_prompt`; the hard-coded `DOMAIN_PROMPTS` dict in [backend/services/anthropic.py:16-22](../../backend/services/anthropic.py#L16-L22) becomes dead code and is removed once the seed migration has run.

### 1.3 Marketplace endpoint

Replace [backend/routers/agents.py:9-14](../../backend/routers/agents.py#L9-L14):

- Old: `GET /api/agents/marketplace` returns `activated_models` filtered by `is_active=true`. This is wrong — it returns *allocations*, not the *catalog*.
- New: returns `pod_definitions` where `is_listed=true`.

Frontend marketplace ([frontend/components/marketplace/](../../frontend/components/marketplace/)) consumes the new shape. The mock list in `lib/insuranceMocks.ts` can be deleted once the page renders from the API.

### 1.4 Verification

- Open a pod via `PodRunWorkspace`; the streamed response must reflect the new prompt template (change a token in `model_versions.prompt_template` and watch it appear).
- `GET /api/agents/marketplace` returns pod definitions with at least 5 rows seeded from current mocks.
- Pin a user to a non-default version with `pinned_version_id`; their chat uses that prompt.

### 1.5 Rollback

Three-step revert:

1. Restore `DOMAIN_PROMPTS` and the simple chat handler. The new tables are harmless if unused.
2. Restore the old marketplace endpoint, OR leave the new one — the response shape can be made backward-compatible by including `model_id`, `model_name`, `domain` fields the frontend already expects.
3. The `pod_definitions` table and the new columns on `activated_models` can stay (no destructive change).

---

## Phase 2 — Sessions + budget envelope

**Goal:** every chat run is a first-class row. Per-broker rate limits become real. The Analytics tab on the pod page gets a data backbone.

### 2.1 Schema

```sql
CREATE TABLE public.pod_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id     UUID NOT NULL REFERENCES public.activated_models(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL,
  version_id        UUID NOT NULL REFERENCES public.model_versions(id),
  conversation_id   UUID REFERENCES public.chat_conversations(id),
  status            TEXT NOT NULL DEFAULT 'open',    -- open | closed | killed
  tokens_in         INT NOT NULL DEFAULT 0,
  tokens_out        INT NOT NULL DEFAULT 0,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at         TIMESTAMPTZ
);

CREATE INDEX pod_sessions_user_started_idx
  ON public.pod_sessions (user_id, started_at DESC);

CREATE TABLE public.pod_resource_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL UNIQUE,    -- "trial", "standard", "enterprise"
  max_tokens_per_min INT NOT NULL,
  max_concurrent_sessions INT NOT NULL,
  daily_token_budget INT NOT NULL
);
```

Backfill `activated_models.resource_profile_id` to a `'standard'` row created in the same migration.

### 2.2 New endpoints

| Method + path | Behaviour |
|---|---|
| `POST /api/pods/{pod_id}/sessions` | Resolves allocation → version (canary or pinned), inserts `pod_sessions`, returns `{session_id, version_id, capabilities}` |
| `POST /api/pods/sessions/{id}/messages` | SSE stream; pulls prompt from `model_versions`; updates `tokens_in/out` on completion |
| `GET /api/pods/sessions/{id}` | Session metadata |
| `POST /api/pods/sessions/{id}/close` | Marks `status='closed'`, sets `closed_at` |

`/api/chat/stream` stays — it just becomes a thin shim that opens a session and forwards. Deprecation warning in the response header.

### 2.3 Budget enforcement

A FastAPI dependency `enforce_budget(allocation_id)`:

1. Sum `tokens_in + tokens_out` from `pod_sessions` where `user_id` matches and `started_at >= now() - interval '1 day'`. Compare to `daily_token_budget`.
2. Count `pod_sessions` with `status='open'` for this user. Compare to `max_concurrent_sessions`.
3. On breach return `429 Too Many Requests` with a JSON body naming the limit hit.

Per-minute rate: a Redis (or Supabase realtime presence) sliding window. **Not** in-memory — multi-process FastAPI won't have a shared view.

### 2.4 Frontend

[frontend/components/pod-run/PodRunWorkspace.tsx](../../frontend/components/pod-run/PodRunWorkspace.tsx) opens a session before its first message instead of calling `/api/chat/stream` directly. The session_id is held in component state and passed to a new `streamPodMessage()` in [frontend/lib/aiChat.ts](../../frontend/lib/aiChat.ts).

Analytics tab ([frontend/components/pod-dashboards/PodAnalyticsDashboard.tsx](../../frontend/components/pod-dashboards/PodAnalyticsDashboard.tsx)) gains a "Sessions today / tokens today" KPI row reading from a new `GET /api/pods/{pod_id}/analytics`.

### 2.5 Verification

- Open two pod chats in parallel for the same broker with `max_concurrent_sessions=1` — the second should 429.
- Set `daily_token_budget=100` and watch the third message 429.
- Confirm `pod_sessions` row exists per chat, with sensible `tokens_in/out` after closure.

### 2.6 Rollback

- Keep `/api/chat/stream` working throughout. Pointing the frontend back at the old endpoint is the rollback. The new tables can sit empty.
- Budget enforcement is configurable via a `BUDGETS_ENFORCED` env flag — turn it off without a deploy.

---

## Phase 3 — Worker pools

**Goal:** stop running every pod's traffic on the same FastAPI worker pool. Pods with different latency profiles (chat vs. tool-heavy vs. long-running) get their own pool.

### 3.1 Worker layout

Two options, pick one based on infra:

**Option A — asyncio task groups inside FastAPI**
- A `WorkerPool` per pod definition, sized by `pod_definitions.worker_concurrency` (new column).
- Cheap, no new infra. Limit: still one process per pod.

**Option B — Arq (or Celery) workers**
- A separate worker process per high-traffic pod. FastAPI enqueues; workers run the Anthropic calls.
- More moving parts. Worth it once a single pod's traffic dominates.

Start with Option A. Migrate hot pods to Option B as needed.

### 3.2 Schema

```sql
CREATE TABLE public.pod_deployments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_definition_id   UUID NOT NULL REFERENCES public.pod_definitions(id),
  runtime_kind        TEXT NOT NULL,         -- 'inline' | 'arq' | 'device' | 'external'
  runtime_address     TEXT,                  -- arq queue name, device_id, URL
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Session creation resolves the active `pod_deployments` row for the pod and routes accordingly.

### 3.3 Verification

- Create two pod definitions with different `worker_concurrency`. Saturate one — the other still responds.
- Switch a pod from `runtime_kind='inline'` to `'arq'` without dropping in-flight sessions (allow drain via `is_active=false` then create the new row).

### 3.4 Rollback

- `runtime_kind='inline'` is the default; flip all `pod_deployments` rows back and Phase 3 is functionally reverted.

---

## Phase 4 — Out-of-process runtimes

**Goal:** support pods that genuinely cannot run in-process — Playwright-driven carrier scrapers, on-device fine-tuned models, non-Anthropic LLMs.

Not scheduled. Triggered only when a real customer requires it. The `pod_deployments.runtime_kind = 'external'` row plus a documented HTTP contract (request body, SSE response, idempotency key) is the integration surface.

Note: `runtime_kind='device'` reuses the existing device infrastructure ([backend/routers/devices.py](../../backend/routers/devices.py)) — no new transport.

---

## Cross-cutting concerns

### Governance lineage

After Phase 2, every `decision_records` insert should include `pod_session_id` and `model_version_id` (the FK at [supabase/migrations/20260421224737_…sql:45](../../supabase/migrations/20260421224737_1ed6ef08-569f-41c7-9353-a03a33cd7ab1.sql#L45) finally gets populated). Tracked in [model-registry-plan.md](model-registry-plan.md) Phase 2.

### Migration ordering

The two plans interleave:

1. Registry Phase 0 (½ d) — fixes the wrong-table read
2. Pod Phase 0 (1–2 d) — fixes G5 + G6
3. Registry Phase 1 (2–3 d) — writer endpoints + seed
4. **Pod Phase 1 (4–6 d)** — depends on registry seed
5. Registry Phase 2 (2 d) — lineage writes, depends on Pod Phase 1 producing version_id at stream time
6. Pod Phase 2 (4–5 d)
7. Registry Phase 3 + 4 + 5
8. Pod Phase 3

### Things we are explicitly **not** doing

- Containerising pods. Out of scope until Phase 4.
- Replacing Anthropic. The registry's `model_id` field could in principle name an OpenAI or local model; we keep the door open but ship Anthropic-only.
- Multi-tenant org isolation. Today `user_id` is the broker; an `org_id` layer is a separate workstream.
- Replacing chat-conversations + chat-messages with sessions. `pod_sessions` is a parallel structure that *references* a conversation; we do not migrate the conversation history schema.

---

## Open questions

1. **Naming.** `pod_definitions` vs. `pods`? Today the code uses every variant of "pod / agent / model / activated_model"; the naming pass is a separate decision before Phase 1 starts.
2. **Concurrency model in Phase 3 Option A.** Per-pod `asyncio.Semaphore` vs. a real task-group queue. Settling this affects how we expose `worker_concurrency`.
3. **Budget granularity.** Daily token budget is coarse — we may want per-pod budgets so a runaway loop in one pod can't burn the broker's entire daily envelope. Defer to Phase 2 implementation.
