# Pod Deployment — Architecture Reference

> **Purpose:** Map the current pod activation/runtime model and propose an evolution path to real deployment.
> **Status:** DRAFT — 2026-05-22
> **Scope:** Pod as a unit of capability — how it is requested, activated, executed, and how it could be deployed as an isolated runtime in the future.

---

## At a glance

A **pod** in Fideon OS is the user-facing unit of AI capability — a packaged "agent" the broker activates and runs against real cases. Today a pod is **not deployed**: there is no per-pod process, container, or runtime. A pod is a row in `activated_models`, and "running" it means streaming a chat from the shared FastAPI `/api/chat/stream` endpoint through a single Anthropic model with a hard-coded domain prompt.

The current design is sufficient for a single-tenant, prompt-only product. It will not scale to per-pod tools, isolated execution, per-pod data scoping, or governance-bound rollout. This document describes both the present and a target architecture.

---

# Part 1 — Current state

## 1.1 What a pod is today

A pod is a row in `public.activated_models` with these meaningful columns (see [supabase/migrations/20260511000000_activated_models_is_active.sql](../../supabase/migrations/20260511000000_activated_models_is_active.sql) and the original schema referenced in [supabase/migrations/20260211105451_e1ad5a4d-556c-4343-8b30-1508a0fcba5c.sql](../../supabase/migrations/20260211105451_e1ad5a4d-556c-4343-8b30-1508a0fcba5c.sql)):

| Column | Meaning |
|---|---|
| `id` | Allocation row UUID |
| `user_id` | Owning broker |
| `model_id` | Logical pod identifier (e.g. `doc_retrieval_v0`, a row in the marketplace catalog) |
| `model_name` | Display name |
| `domain` | One of `insurance`, `healthcare`, `banking`, `legal`, `travel` — used **only** to pick a system prompt |
| `is_active` | Pause toggle; `false` keeps the row but hides it from the marketplace + run views |
| `activated_at` | Allocation timestamp |

There is **no** column for version, prompt, tool list, resource limits, runtime address, or health.

## 1.2 Pod lifecycle today

```
marketplace catalog (static frontend mock)
       │
       │  POST /api/agents/activate          ← user clicks "Activate"
       ▼
  activated_models row (is_active = true)
       │
       │  GET /api/agents/pod/{pod_id}       ← user opens pod page
       ▼
  PodDashboardPage  ──tab──▶  PodRunWorkspace
                                    │
                                    │  POST /api/chat/stream
                                    ▼
                         services/anthropic.py → Anthropic
                                    │
                                    │  text/event-stream (OpenAI-compatible)
                                    ▼
                                  Browser
```

Key files in the loop:

- [backend/routers/agents.py:29-58](../../backend/routers/agents.py#L29-L58) — `activate` / `deactivate` flip `is_active`.
- [backend/routers/agents.py:61-73](../../backend/routers/agents.py#L61-L73) — `GET /api/agents/pod/{pod_id}` returns the allocation row.
- [frontend/app/(app)/pod/[podId]/page.tsx](../../frontend/app/(app)/pod/%5BpodId%5D/page.tsx) — Overview / Run / Analytics tabs.
- [frontend/components/pod-run/PodRunWorkspace.tsx](../../frontend/components/pod-run/PodRunWorkspace.tsx) — chat workspace; streams from `/api/chat/stream`.
- [backend/routers/chat.py:11-36](../../backend/routers/chat.py#L11-L36) — single shared streaming endpoint.
- [backend/services/anthropic.py:16-46](../../backend/services/anthropic.py#L16-L46) — `DOMAIN_PROMPTS` dict + `stream_chat_as_openai_sse`.

## 1.3 Where the "pod personality" actually lives

The pod is essentially a **label**. All routing, prompting, and execution happens in shared code:

- The chat handler does **not** read `activated_models` at all. It takes a free-form `model_id` from the request, looks it up in the hard-coded `DOMAIN_PROMPTS` dict, and falls back to a generic prompt if nothing matches.
- Every pod the broker activates ends up running the same underlying Anthropic model (`settings.anthropic_model`, default `claude-sonnet-4-5`).
- No tools, no per-pod context window control, no per-pod safety overrides.

This is why the Marketplace + "Activate" flow feels real but the runtime is uniform.

## 1.4 Custom pod requests — the white-glove path

For non-catalog pods, brokers submit an SOP via `POST /api/agents/pod-requests`. The schema and lifecycle live in [supabase/migrations/20260514100000_custom_pod_requests.sql](../../supabase/migrations/20260514100000_custom_pod_requests.sql):

```
submitted → in_review → building → ready_to_install → installed
                                                    └── rejected
```

On `installed`, an `activated_models` row is created and its UUID is stored in `custom_pod_requests.installed_activated_model_id`. The actual "build" is manual — Fideon engineering writes carrier adapters or workflow definitions. The pod request table is a project-tracking artefact, not a deployment manifest.

Admin queue: [frontend/components/admin/PodActivationRequests.tsx](../../frontend/components/admin/PodActivationRequests.tsx) (note: this currently reads a separate `pod_activation_requests` table — see Gap G5 below).

## 1.5 Adjacent runtimes that are *not* the pod

These are sometimes confused with "pod deployment" but are orthogonal:

| System | What it is | Where it lives |
|---|---|---|
| **Workflows** | SOP-defined multi-step automations with their own runs table | [backend/routers/workflows.py](../../backend/routers/workflows.py), `workflows` + `workflow_runs` |
| **MCP** | Tool-execution surface used by external MCP clients via bearer tokens | [backend/routers/mcp.py](../../backend/routers/mcp.py) |
| **Training jobs** | On-device fine-tuning + federated rounds | [backend/routers/training.py](../../backend/routers/training.py) |
| **Devices** | On-prem inference targets, authenticated via `x-device-token` | [backend/routers/devices.py](../../backend/routers/devices.py) |

A future pod runtime will need to **compose** with each of these (workflows trigger pods, pods invoke MCP tools, pods can target on-device models). It does not replace them.

## 1.6 Gaps in the current model

| ID | Gap | Consequence |
|---|---|---|
| G1 | No version on `activated_models` | Cannot pin a broker to a known-good prompt; cannot roll back |
| G2 | Prompts hard-coded in `services/anthropic.py` | Editing a prompt requires a backend deploy |
| G3 | No tool binding per pod | Every pod is "chat only" — MCP tools must be wired one-off |
| G4 | `chat.py` ignores the pod | The pod page suggests isolation that the streaming endpoint does not enforce |
| G5 | Admin UI reads `pod_activation_requests`, backend writes `custom_pod_requests` | Two tables are tracking the same intent; admin queue is on the wrong one |
| G6 | `ModelAllocationSection` uses the Supabase JS client directly (`from('activated_models')`) | Violates the project rule that all DB access goes through FastAPI |
| G7 | No per-pod resource limits, rate limits, or audit scoping | One noisy broker can starve everyone on the shared Anthropic key |
| G8 | No pod "deployment record" | Cannot answer "what version of which pod handled this case?" |

G6 in particular contradicts the architecture stated in [CLAUDE.md](../../CLAUDE.md): *"The frontend never touches the database directly. All DB access goes through FastAPI."*

---

# Part 2 — Target deployment architecture

## 2.1 Design goals

1. **A pod is a versioned, deployable artifact** — not just a row toggle.
2. **The runtime is bound to a version** — the chat path resolves which prompt, tools, and model to use from data, not code.
3. **Pods compose with workflows, MCP, and devices** rather than duplicating them.
4. **Governance can answer "which pod version produced this decision?"** for every entry in `decision_records`.
5. **Per-broker isolation** at minimum at the rate-limit and budget level; ideally also at the execution worker level.

This document does **not** mandate containerization or k8s. Phase 3 keeps that option open but starts with in-process worker isolation.

## 2.2 Conceptual model

A pod has three layers:

```
┌──────────────────────────────────────────────┐
│  Pod Definition          (catalog row)       │   "What is this pod?"
│  ─ model_id, name, domain                    │
│  ─ default prompt template ref               │
│  ─ tool manifest                             │
│  ─ required capabilities                     │
└─────────────────┬────────────────────────────┘
                  │ has many
┌─────────────────▼────────────────────────────┐
│  Pod Version             (registry row)      │   "What's actually running?"
│  ─ version (semver)                          │
│  ─ prompt_template + prompt_hash             │
│  ─ rules_hash                                │
│  ─ rollout_state (draft|canary|active|...)   │
│  ─ canary_percentage                         │
└─────────────────┬────────────────────────────┘
                  │ allocated to
┌─────────────────▼────────────────────────────┐
│  Pod Allocation          (broker binding)    │   "Who can run it, and which version?"
│  ─ user_id                                   │
│  ─ pinned_version_id (nullable)              │
│  ─ is_active                                 │
│  ─ resource_profile_id                       │
└──────────────────────────────────────────────┘
```

`activated_models` becomes the **Pod Allocation** layer. The Pod Definition lives in a new `pod_definitions` table and Pod Version lives in `model_versions` (already created, currently unused — see the [model-registry-architecture.md](model-registry-architecture.md)).

## 2.3 Runtime flow (target)

```
broker hits "Run" on pod X
       │
       ▼
POST /api/pods/{pod_id}/sessions
       │   resolves allocation → version (canary or pinned)
       │   creates pod_session row (id, version_id, started_at)
       ▼
returns { session_id, version_id, capabilities }
       │
       ▼
POST /api/pods/sessions/{session_id}/messages   (SSE stream)
       │
       ├─ pulls prompt_template from model_versions
       ├─ pulls tool manifest from pod_definitions
       ├─ enforces per-broker rate budget
       ├─ streams via Anthropic OR routes to device (if pod requires on-device)
       └─ on completion, writes decision_record with model_version_id
```

Two things change versus today:

1. **Session-scoped** — every conversation belongs to a `pod_session`, which is bound to a specific `version_id`. This is the join key for governance, analytics, and rollback.
2. **Data-driven prompt + tools** — `DOMAIN_PROMPTS` in code is replaced by `model_versions.prompt_template`. The chat handler resolves the version, not the domain.

## 2.4 Proposed data model

New / modified tables (full DDL is in [pod-deployment-plan.md](pod-deployment-plan.md) Phase 1–2):

| Table | Status | Purpose |
|---|---|---|
| `pod_definitions` | **new** | Catalog of pods (today: hard-coded in `lib/insuranceMocks.ts`) |
| `model_versions` | exists, unused | Per-version prompt + rules; see registry doc |
| `activated_models` | modify | Add `pinned_version_id`, `resource_profile_id` |
| `pod_sessions` | **new** | One row per chat run; FK to `activated_models` + `model_versions` |
| `pod_resource_profiles` | **new** (Phase 3) | Per-broker rate + budget envelope |
| `pod_deployments` | **new** (Phase 3) | Where a pod runs — `local`, `device:{device_id}`, `worker:{worker_id}` |
| `custom_pod_requests` | exists | Unchanged — remains the white-glove intake |
| `pod_activation_requests` | **delete** | Duplicate of `custom_pod_requests`; admin UI rewires (G5) |

## 2.5 Proposed API surface

| Method + path | Purpose | Replaces |
|---|---|---|
| `GET /api/pods/catalog` | List pod definitions | The hard-coded marketplace mocks |
| `POST /api/pods/{pod_id}/allocate` | Allocate a pod to the calling user | `POST /api/agents/activate` |
| `DELETE /api/pods/{pod_id}/allocate` | Pause / remove allocation | `DELETE /api/agents/deactivate/{model_id}` |
| `POST /api/pods/{pod_id}/sessions` | Open a run session (resolves version) | — (new) |
| `POST /api/pods/sessions/{id}/messages` | Stream a message into a session | `POST /api/chat/stream` |
| `GET /api/pods/sessions/{id}` | Session metadata + chosen version | — (new) |
| `POST /api/admin/pods/{pod_id}/pin-version` | Admin override: pin a broker to a specific version | — (new) |

Old endpoints stay until everything is migrated; `/api/agents/*` and `/api/chat/stream` can be deprecated rather than removed.

## 2.6 Execution isolation tiers

| Tier | Description | When to ship |
|---|---|---|
| **T0 — Shared FastAPI worker** | Where we are today. One Anthropic key, one process. | Now |
| **T1 — Per-pod queue with budget envelope** | Pods enqueue to per-broker queues with rate + token budgets. Same process, but throttling is real. | Phase 2 |
| **T2 — Dedicated worker pool per high-traffic pod** | Worker pool (asyncio task group or Celery/Arq workers) routes by pod definition. | Phase 3 |
| **T3 — Out-of-process pod runtime** | Pods that need bespoke environments (Playwright, on-prem models) run as separate processes addressed via `pod_deployments`. | Phase 4, when there is a real customer asking for it |

We deliberately do **not** start at T3. The current shape of the product does not need container-per-pod isolation.

## 2.7 Governance hook

Every `decision_records` row gets `pod_session_id` + `model_version_id` populated by the chat handler at write time. This wires three things at once:

1. The current registry FK (`decision_records.model_version_id` — defined at [supabase/migrations/20260421224737_…sql:45](../../supabase/migrations/20260421224737_1ed6ef08-569f-41c7-9353-a03a33cd7ab1.sql#L45)) stops being null.
2. The Analytics tab on the pod page can show "decisions by version".
3. Rollback becomes a real operation: flip a version's `rollout_state` to `deprecated`, repin allocations, replay decisions if needed.

## 2.8 Out of scope (for this doc)

- The full design of `model_versions` rollout state machine — see [model-registry-architecture.md](model-registry-architecture.md).
- Per-pod billing, cost attribution, or token-economics — implicit in the resource profile but not specified here.
- Multi-tenant org isolation. Today this is single-tenant per `user_id`; a future org/team scope is a separate workstream.
- Replacing the hard-coded marketplace in `lib/insuranceMocks.ts` — this is implied by `pod_definitions` but tracked separately.

---

## Open questions

1. **Naming.** Today the code uses "pod", "agent", "model", and "activated_model" interchangeably. The target model collapses these to **Pod Definition / Pod Version / Pod Allocation / Pod Session**. Agreement before renames.
2. **Custom pods vs catalog pods** — should custom pods get their own `pod_definitions` row, or stay in `custom_pod_requests` until install? Leaning toward "promote on install".
3. **Domain field.** Once prompts are data-driven, `domain` becomes purely a tag. Keep it for UI filtering or drop?
4. **Workflows ↔ pods.** A workflow that fires a pod — does it open a `pod_session`, or call the pod-runtime directly without one? Affects governance lineage.
