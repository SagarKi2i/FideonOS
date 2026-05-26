# Model Registry — Architecture Reference

> **Companion to:** [pod-deployment-architecture.md](pod-deployment-architecture.md) — pod-side concerns
> **Status:** DRAFT — 2026-05-22
> **Purpose:** Describe the registry that records *which* prompt + rules + model produced *which* decision, with first-class rollout state, canary routing, and rollback.

---

## At a glance

The registry's job is one sentence: **given any row in `decision_records`, reconstruct the exact prompt, rules, and model that produced it, and know whether that version is still live.**

Today the foundation for this exists structurally — the `model_versions` table is defined ([supabase/migrations/20260421224737_…sql:7-20](../../supabase/migrations/20260421224737_1ed6ef08-569f-41c7-9353-a03a33cd7ab1.sql#L7-L20)) and `decision_records.model_version_id` FKs into it ([same file, line 45](../../supabase/migrations/20260421224737_1ed6ef08-569f-41c7-9353-a03a33cd7ab1.sql#L45)) — but nothing in the runtime reads or writes it. This document proposes turning that vestigial structure into a working registry: writers, readers, a rollout state machine, A/B routing, and an admin UI.

---

# Part 1 — Current state

## 1.1 What exists

The `model_versions` table:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `model_id` | TEXT | Logical pod identifier (e.g. `insurance`, `doc_retrieval_v0`) |
| `model_name` | TEXT | Display name |
| `version` | TEXT | Free-text (semver expected) |
| `prompt_hash` | TEXT | Tamper check on `prompt_template` |
| `prompt_template` | TEXT | The system prompt |
| `rules_hash` | TEXT | Tamper check on associated rules |
| `metadata` | JSONB | Free-form |
| `is_active` | BOOL | Single boolean (insufficient — see §1.4) |
| `created_at` | TIMESTAMPTZ | |
| `created_by` | UUID | |
| UNIQUE (`model_id`, `version`) | | |

`decision_records.model_version_id` is a `REFERENCES public.model_versions(id) ON DELETE SET NULL`. Lineage is *possible*; nothing populates it.

## 1.2 What is broken

The single endpoint that mentions versions reads the wrong table:

```python
# backend/routers/governance.py:54-64
@router.get("/model-versions")
async def get_model_versions(user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = (
        sb.table("activated_models")        # ← should be "model_versions"
        .select("*")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data
```

Frontend consumer ([frontend/app/(app)/governance/model-versions/page.tsx](../../frontend/app/(app)/governance/model-versions/page.tsx)) therefore shows allocations under a "Model Versions" heading. This is the first thing to fix — see [model-registry-plan.md](model-registry-plan.md) Phase 0.

## 1.3 What "prompt + rules" actually means today

There is no DB-backed prompt anywhere in the running system:

- **Prompts** live in [backend/services/anthropic.py:16-22](../../backend/services/anthropic.py#L16-L22) as a `DOMAIN_PROMPTS: dict[str, str]` literal. Five domains, one prompt each. Changing a prompt is a backend deploy.
- **Rules** live in two places: workflow definitions ([backend/routers/workflows.py](../../backend/routers/workflows.py), `workflows.definition` JSONB) and SOP text inside `custom_pod_requests.sop_text`. Neither is hashed or versioned.

The registry has to absorb both. The seed migration in [model-registry-plan.md](model-registry-plan.md) Phase 1 materialises today's domain prompts as one `model_versions` row each.

## 1.4 Why `is_active` BOOLEAN is not enough

A single boolean conflates several states the product actually has:

| Real state | Today | Needed |
|---|---|---|
| Being authored, not exposed | (no row, or `is_active=false`) | `draft` |
| Live for some traffic, not all | ❌ no representation | `canary` with `canary_percentage` |
| Live for all traffic | `is_active=true` | `active` (exactly one per `model_id`) |
| Phased out but still queryable for audit | `is_active=false` | `deprecated` |
| Hidden from all reads except export | ❌ no representation | `archived` |

Concretely: today there is no way to say "this version is being canaried at 5% of brokers", or "this version is deprecated but a decision_record still points at it — preserve the prompt for audit".

## 1.5 Adjacent surfaces the registry doesn't replace

| Surface | Why it stays separate |
|---|---|
| `chat_conversations` / `chat_messages` | History of what was said. Registry tracks the version that said it. |
| `workflows.definition` | The orchestration graph. Registry tracks the prompt + rules referenced *by* the graph. |
| `training_jobs` / `federated_contributions` | Inputs to a future version. Registry stores the *output* — the version that came out. |
| `mcp_call_log` | Tool invocations. A future field can FK back to a `model_versions` row. Not in this design. |

---

# Part 2 — Target design

## 2.1 Lifecycle

```
   ┌────────┐    create    ┌────────┐  promote   ┌────────┐
   │ (none) │ ───────────▶ │ draft  │ ─────────▶ │ canary │
   └────────┘              └────────┘            └────────┘
                                                      │
                                                      │ promote
                                                      ▼
                              ┌────────────┐     ┌────────┐
                              │ deprecated │◀──  │ active │
                              └─────┬──────┘     └────────┘
                                    │ archive          ▲
                                    ▼                  │
                              ┌──────────┐             │ rollback
                              │ archived │  ◀──────────┘
                              └──────────┘
```

Invariants enforced in the API (not the DB):

- At most one `active` row per `model_id`.
- Promoting a `canary` to `active` automatically demotes the current `active` to `deprecated`.
- `archived` rows are read-only and excluded from default reads.
- `deprecated` rows remain readable so decision_records lineage survives.

Rollback is a transition: `deprecated → active` is allowed (the inverse of promotion) when no other `active` row exists.

## 2.2 Routing — how a request picks a version

When the pod runtime needs a version for `(user_id, model_id)`:

1. If the broker has `activated_models.pinned_version_id` set, use it. Stop.
2. Else, pick the `active` row for `model_id`.
3. If any `canary` rows exist for `model_id`, sample one based on `hash(user_id) mod 100 < canary_percentage`. Multiple canaries: order by `created_at DESC` and bucket non-overlapping (first canary gets 0..N, second gets N..N+M, etc.).
4. Cache the resolution at session start ([pod-deployment-architecture.md §2.3](pod-deployment-architecture.md)) — every message in a session uses the same version.

This is deliberately simple — no time-of-day rules, no per-domain canaries. We can extend later.

## 2.3 Schema additions

```sql
ALTER TABLE public.model_versions
  ADD COLUMN rollout_state TEXT NOT NULL DEFAULT 'draft'
    CHECK (rollout_state IN ('draft','canary','active','deprecated','archived')),
  ADD COLUMN canary_percentage INT NOT NULL DEFAULT 0
    CHECK (canary_percentage BETWEEN 0 AND 100),
  ADD COLUMN parent_version_id UUID REFERENCES public.model_versions(id),
  ADD COLUMN promoted_at TIMESTAMPTZ,
  ADD COLUMN promoted_by UUID,
  ADD COLUMN deprecated_at TIMESTAMPTZ;

-- Exactly one active version per model_id
CREATE UNIQUE INDEX model_versions_one_active_idx
  ON public.model_versions (model_id)
  WHERE rollout_state = 'active';

-- Routing lookup
CREATE INDEX model_versions_routing_idx
  ON public.model_versions (model_id, rollout_state, canary_percentage);
```

New table — `model_version_promotions` (audit log; immutable):

```sql
CREATE TABLE public.model_version_promotions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      UUID NOT NULL REFERENCES public.model_versions(id),
  from_state      TEXT NOT NULL,
  to_state        TEXT NOT NULL,
  actor_id        UUID NOT NULL,
  reason          TEXT,
  canary_percentage_before INT,
  canary_percentage_after  INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX model_version_promotions_version_idx
  ON public.model_version_promotions (version_id, created_at DESC);
```

`is_active` is **not** dropped — kept as a denormalised view (`rollout_state IN ('active','canary')`) for backward compatibility, populated by a trigger. A later cleanup migration can drop it once no client reads it.

## 2.4 API surface

| Method + path | Purpose | Auth |
|---|---|---|
| `GET /api/governance/model-versions` | List all versions visible to the user (admins see archived too) | JWT |
| `GET /api/governance/model-versions/{id}` | One version + promotion history | JWT |
| `GET /api/governance/model-versions/by-pod/{model_id}` | All versions for a pod, in lifecycle order | JWT |
| `POST /api/admin/model-versions` | Create a `draft` | JWT + admin |
| `PATCH /api/admin/model-versions/{id}` | Edit a `draft` (prompt, rules) — locked once promoted | JWT + admin |
| `POST /api/admin/model-versions/{id}/promote` | Transition: `draft→canary`, `canary→active`, `deprecated→active` (rollback) | JWT + admin |
| `POST /api/admin/model-versions/{id}/deprecate` | `active→deprecated` (rare — usually via promote-other) | JWT + admin |
| `POST /api/admin/model-versions/{id}/archive` | `deprecated→archived` | JWT + admin |
| `PATCH /api/admin/model-versions/{id}/canary` | Adjust `canary_percentage` (canary state only) | JWT + admin |
| `GET /api/governance/model-versions/{id}/decisions` | Decisions produced by this version (paged) | JWT |
| `GET /api/governance/model-versions/diff?a={id}&b={id}` | Field-by-field diff of two versions | JWT |

All `POST /api/admin/...` endpoints write a `model_version_promotions` row in the same transaction as the state change.

## 2.5 Lineage write — the most important runtime hook

Every place that creates a `decision_records` row must include `model_version_id` (and after [pod-deployment-plan.md](pod-deployment-plan.md) Phase 2, `pod_session_id`). The session resolves the version at start, holds it for the whole conversation, and every decision created from that session inherits it.

Today the decision-creation path is implicit — there is no single function. Tracked as a refactor in [model-registry-plan.md](model-registry-plan.md) Phase 2.

For backfill: a synthetic version row `(model_id='unknown', version='pre-registry', rollout_state='archived')` is created once, and existing decisions with NULL `model_version_id` are updated to point at it. This preserves the FK invariant without inventing fictional version data.

## 2.6 Admin UI

Lives at `frontend/app/(app)/admin/registry/`. Three pages:

| Page | Path | Purpose |
|---|---|---|
| Pod list | `/admin/registry` | One card per `pod_definitions` row; shows active version + canary % |
| Pod detail | `/admin/registry/[pod_id]` | All versions for a pod in a timeline; promote / rollback buttons |
| Version detail | `/admin/registry/[pod_id]/[version_id]` | Full prompt + rules + metadata; diff against another version; decisions table |

Reuses existing patterns: TanStack Query, `governanceApi` group in [frontend/lib/api.ts](../../frontend/lib/api.ts), the existing KPI-card and Tabs primitives.

## 2.7 Security model

- Reads (`GET /api/governance/model-versions*`): any authenticated user, but archived rows hidden unless `is_admin`.
- Writes (`POST /api/admin/model-versions*`): admin role only (`require_admin` dependency, already in [backend/auth/dependencies.py](../../backend/auth/dependencies.py)).
- Prompt content is **not** PII but is product-sensitive. Standard JWT auth is sufficient; no extra encryption-at-app-layer.
- `prompt_hash` and `rules_hash` are computed by the API on insert/update — a hash mismatch on read raises a tamper warning (logged, not blocking).

## 2.8 Export hook

The existing `/api/governance/exports` ([backend/routers/governance.py:67-75](../../backend/routers/governance.py#L67-L75)) gates exports by an allowlist:

```python
allowed = {"decision_reviews", "mcp_call_log", "workflow_runs", "training_overrides"}
```

Add `model_versions` and `model_version_promotions` to the set so compliance can pull the registry alongside decisions.

---

## Out of scope

- **Training-loop integration.** Eventually a successful training job should propose a new `draft` version. Out of scope here — covered when the training routers and the registry are unified.
- **Prompt templating variables.** The registry stores raw `prompt_template`. Variable substitution (`{{user_role}}`, `{{carrier_name}}`) is a chat-layer concern; the registry holds the source string.
- **Cross-environment promotion.** Today there is one Supabase project. A staging → prod promotion flow is a deploy concern, not a registry concern.
- **Model swap.** The registry pins prompt + rules per `model_id`; the underlying Anthropic model is still chosen by `settings.anthropic_model`. Per-version model selection (e.g. one canary on Opus, active on Sonnet) is a future addition — `metadata.anthropic_model` slot is reserved.
- **A/B statistical evaluation.** The diff + decisions-by-version UI tells you *what happened*. Pinning down "is canary better than active" with significance tests is a separate analytics workstream.

## Open questions

1. **Per-domain vs per-pod versions.** Today's `DOMAIN_PROMPTS` keys by domain (insurance, healthcare, ...). The marketplace pods often share a domain. Do we seed one version per domain, or per pod, or both? Decision: **per pod** — the pod is the unit users care about; domain is a tag.
2. **Versioning scheme.** Free-text `version` is permissive. Enforce semver (`vMAJOR.MINOR.PATCH`)? Lean yes, behind a CHECK constraint added in Phase 1.
3. **Workflow rules ↔ rules_hash.** The `rules_hash` field is currently empty by convention. Wire it to a stable hash of the linked workflow's `definition` JSONB? Or leave free-form until workflow versioning lands? Defer.
4. **Backfill of `decision_records.model_version_id`.** Synthetic `pre-registry` row is the cheapest option; alternative is leaving NULL and relaxing the FK semantics. Going with synthetic.
