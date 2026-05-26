# Model Registry — Implementation Plan

> **Companion to:** [model-registry-architecture.md](model-registry-architecture.md)
> **Status:** DRAFT — 2026-05-22
> **Purpose:** Phased build-out from "table exists but unused" to a working registry with canary routing, lineage, and an admin UI.

---

## At a glance

Six phases. Phase 0 is the half-day bug fix that gets the existing endpoint reading the right table. Phase 1 makes the registry writable and seeds it with today's hard-coded prompts. Phase 2 wires every new decision back to its version. Phase 3 adds the rollout state machine and canary routing. Phase 4 ships the admin UI. Phase 5 opens the compliance export.

Phase 2 is the inflection point — once it ships, "which version produced this decision?" has a real answer.

| Phase | Goal | Est. | Schema delta | Coupled to pod plan? |
|---|---|---|---|---|
| 0 | Fix the bug | ½ d | none | no |
| 1 | Writer endpoints + seed | 2–3 d | none (the table already exists) | enables Pod Phase 1 |
| 2 | Lineage writes | 2 d | none | requires Pod Phase 1 |
| 3 | Rollout state machine + canary | 3–4 d | `rollout_state`, `canary_percentage`, `parent_version_id`, `model_version_promotions` | no |
| 4 | Admin UI | 3–4 d | none | no |
| 5 | Export hook | 1 d | none | no |

---

## Phase 0 — Fix the bug

**Goal:** `GET /api/governance/model-versions` returns rows from `model_versions`, not `activated_models`.

### 0.1 Code change

[backend/routers/governance.py:54-64](../../backend/routers/governance.py#L54-L64) — single line change:

```python
@router.get("/model-versions")
async def get_model_versions(user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = (
        sb.table("model_versions")          # was: "activated_models"
        .select("*")
        .order("created_at", desc=True)     # was: "updated_at"
        .execute()
    )
    return result.data
```

`model_versions` has no `user_id` column — the per-user filter was meaningless on the wrong table and is correctly absent here. The current RLS policy ([supabase/migrations/20260421224737_…sql:24-31](../../supabase/migrations/20260421224737_1ed6ef08-569f-41c7-9353-a03a33cd7ab1.sql#L24-L31)) already allows any authenticated user to SELECT.

### 0.2 Empty-state in the UI

[frontend/app/(app)/governance/model-versions/page.tsx](../../frontend/app/(app)/governance/model-versions/page.tsx) currently renders whatever the API returns. Today (post-fix) the table is empty — add a "No versions yet" state pointing the admin at the seeder coming in Phase 1.

### 0.3 Verification

- `curl localhost:8000/api/governance/model-versions -H "Authorization: Bearer …"` returns `[]`.
- Page loads, shows the empty state.

### 0.4 Rollback

Revert the one-line change.

---

## Phase 1 — Writers + seed

**Goal:** an admin can create a version. Today's hard-coded prompts exist as registry rows.

### 1.1 Pydantic schemas

Add to [backend/models/schemas.py](../../backend/models/schemas.py):

```python
class ModelVersionCreate(BaseModel):
    model_id: str
    model_name: str
    version: str           # semver enforced in API
    prompt_template: str
    rules_hash: str | None = None
    metadata: dict = {}

class ModelVersionUpdate(BaseModel):
    prompt_template: str | None = None
    rules_hash: str | None = None
    metadata: dict | None = None
```

### 1.2 Admin endpoints

In [backend/routers/admin.py](../../backend/routers/admin.py) (already has `require_admin`):

| Method + path | Handler |
|---|---|
| `POST /api/admin/model-versions` | Compute `prompt_hash = sha256(prompt_template)`, insert; reject if `(model_id, version)` exists |
| `PATCH /api/admin/model-versions/{id}` | Recompute `prompt_hash` if `prompt_template` changes; reject if version is not `draft` (Phase 3 enforces; Phase 1 has no state machine yet so accept all edits) |
| `DELETE /api/admin/model-versions/{id}` | Only if no decision_record references it AND state is `draft` |

Frontend wiring in [frontend/lib/api.ts](../../frontend/lib/api.ts) — add `adminApi.modelVersions.{list,get,create,update,delete}`.

### 1.3 Seed migration

`supabase/migrations/2026MMDD000000_seed_model_versions_from_domain_prompts.sql`:

```sql
-- Materialise the DOMAIN_PROMPTS dict from backend/services/anthropic.py as
-- one initial version per domain. After this lands, the chat handler in
-- Pod Phase 1 reads these instead of the in-code dict.
INSERT INTO public.model_versions (
  model_id, model_name, version, prompt_template, prompt_hash,
  metadata, is_active, created_at
) VALUES
  ('insurance',  'Insurance Domain v1',
   'v1.0.0',
   'You are an insurance domain expert. Help users analyze policies, compare coverage, identify exclusions, and answer insurance-related questions with accuracy and clarity.',
   encode(sha256('…same string…'::bytea), 'hex'),
   '{"seed": true, "source": "backend/services/anthropic.py DOMAIN_PROMPTS"}'::jsonb,
   true, now()),
  ('healthcare', 'Healthcare Domain v1',  'v1.0.0', '…', '…', '{"seed": true}'::jsonb, true, now()),
  ('banking',    'Banking Domain v1',     'v1.0.0', '…', '…', '{"seed": true}'::jsonb, true, now()),
  ('legal',      'Legal Domain v1',       'v1.0.0', '…', '…', '{"seed": true}'::jsonb, true, now()),
  ('travel',     'Travel Domain v1',      'v1.0.0', '…', '…', '{"seed": true}'::jsonb, true, now())
ON CONFLICT (model_id, version) DO NOTHING;

-- Synthetic "pre-registry" row for backfill of decision_records that predate
-- this migration. Hidden from default reads in Phase 3 (rollout_state='archived').
INSERT INTO public.model_versions (
  model_id, model_name, version, prompt_template, metadata, is_active
) VALUES (
  'unknown', 'Pre-registry decisions', 'pre-registry',
  '(prompt not captured)',
  '{"backfill": true}'::jsonb,
  false
) ON CONFLICT (model_id, version) DO NOTHING;
```

The seed text must exactly match the strings in [backend/services/anthropic.py:16-22](../../backend/services/anthropic.py#L16-L22) so the `prompt_hash` is meaningful.

### 1.4 Semver guard

Add a CHECK constraint:

```sql
ALTER TABLE public.model_versions
  ADD CONSTRAINT model_versions_semver_check
  CHECK (version ~ '^v?\d+\.\d+\.\d+([-+].+)?$' OR version = 'pre-registry');
```

The `pre-registry` literal escape lets the backfill row coexist.

### 1.5 Verification

- `GET /api/governance/model-versions` returns 6 rows (5 seeded + 1 backfill).
- `POST /api/admin/model-versions` with a new `(model_id, version)` succeeds; duplicate returns 409.
- `POST` with version `1.0` (no patch) returns 422 (semver violation).

### 1.6 Rollback

- Revert the admin routes; the seed rows are harmless.
- The CHECK constraint can be dropped if it interferes with manual inserts.

---

## Phase 2 — Lineage writes

**Goal:** every new `decision_records` row carries `model_version_id`. Existing decisions are backfilled to the synthetic row.

### 2.1 Decision creation refactor

Today decision creation is scattered — there is no single helper. Audit: `Grep` for `\.table\("decision_(records|reviews)"\)\.insert` in `backend/`. For each call site:

1. Take the `model_id` already passed.
2. Look up the active `model_versions.id` for that `model_id` (or the canary, see Phase 3).
3. Set `model_version_id` on the insert.

Add a helper in `backend/services/registry.py`:

```python
async def resolve_active_version(sb, model_id: str, user_id: str) -> dict:
    """Return the version row that should produce a decision for this (model_id, user_id)."""
    # In Phase 2: just return the row where is_active=true AND model_id=...
    # In Phase 3: this grows the canary logic.
```

The pod runtime (after [pod-deployment-plan.md](pod-deployment-plan.md) Phase 2) caches the resolved version on the `pod_sessions` row; downstream decision-writers read it from the session instead of resolving again.

### 2.2 Backfill

```sql
-- Single statement; idempotent.
UPDATE public.decision_records
SET model_version_id = (SELECT id FROM public.model_versions WHERE model_id='unknown' AND version='pre-registry')
WHERE model_version_id IS NULL;
```

### 2.3 Lineage read

`GET /api/governance/decisions/{id}` ([backend/routers/governance.py:22-38](../../backend/routers/governance.py#L22-L38)) currently joins `training_overrides`. Extend the response to include the version row via a join on `model_version_id`. The frontend decision-detail page gains a "Version" section with prompt + rules + a link to the registry detail page.

### 2.4 Verification

- Run a new chat → check `decision_records` rows created in that session have `model_version_id` populated.
- Old decisions all reference the `pre-registry` row.
- Decision detail page shows the version metadata.

### 2.5 Rollback

- The helper can default-return NULL if `REGISTRY_LINEAGE_ENABLED=false` env flag is set.
- Existing data continues to work (FK is `ON DELETE SET NULL`).

---

## Phase 3 — Rollout state machine + canary routing

**Goal:** versions have real lifecycle states, and a percentage-rolled canary actually splits traffic.

### 3.1 Migration

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

-- Backfill existing seeded rows to 'active' (they were is_active=true).
-- Synthetic backfill row goes to 'archived'.
UPDATE public.model_versions
SET rollout_state = CASE
  WHEN model_id = 'unknown' THEN 'archived'
  WHEN is_active THEN 'active'
  ELSE 'draft'
END,
promoted_at = CASE WHEN is_active THEN now() ELSE NULL END;

CREATE UNIQUE INDEX model_versions_one_active_idx
  ON public.model_versions (model_id)
  WHERE rollout_state = 'active';

CREATE INDEX model_versions_routing_idx
  ON public.model_versions (model_id, rollout_state, canary_percentage);

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

-- Keep is_active in sync until clients migrate off it.
CREATE OR REPLACE FUNCTION public.sync_model_versions_is_active() RETURNS TRIGGER AS $$
BEGIN
  NEW.is_active := NEW.rollout_state IN ('active','canary');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER model_versions_is_active_trigger
  BEFORE INSERT OR UPDATE OF rollout_state ON public.model_versions
  FOR EACH ROW EXECUTE FUNCTION public.sync_model_versions_is_active();
```

### 3.2 Promote endpoint

`POST /api/admin/model-versions/{id}/promote` body: `{ to_state, canary_percentage?, reason? }`.

Allowed transitions:

| From | To | Side effect |
|---|---|---|
| `draft` | `canary` | Sets `canary_percentage` (default 5 if omitted) |
| `draft` | `active` | Demotes current `active` for same `model_id` to `deprecated` |
| `canary` | `active` | Demotes current `active` to `deprecated`, sets `canary_percentage = 0` |
| `canary` | `draft` | Pull back (rare); `canary_percentage = 0` |
| `active` | `deprecated` | No new traffic. Lineage reads still work. |
| `deprecated` | `active` | **Rollback path.** Requires no other `active` row to exist. |
| `deprecated` | `archived` | Hidden from default reads. |

Every transition writes a `model_version_promotions` row in the same SQL transaction.

### 3.3 Routing logic

Extend `resolve_active_version` from Phase 2:

```python
async def resolve_active_version(sb, model_id: str, user_id: str) -> dict:
    rows = sb.table("model_versions").select("*") \
        .eq("model_id", model_id) \
        .in_("rollout_state", ["active", "canary"]) \
        .execute().data
    if not rows:
        raise HTTPException(503, f"No active version for {model_id}")

    canaries = sorted(
        [r for r in rows if r["rollout_state"] == "canary"],
        key=lambda r: r["created_at"], reverse=True,
    )
    active = next((r for r in rows if r["rollout_state"] == "active"), None)

    # Stable hash so the same broker keeps the same version for the same model_id
    bucket = int(hashlib.sha256(f"{user_id}:{model_id}".encode()).hexdigest(), 16) % 100
    cursor = 0
    for c in canaries:
        if cursor <= bucket < cursor + c["canary_percentage"]:
            return c
        cursor += c["canary_percentage"]
    if active:
        return active
    return canaries[0]  # all-canary edge case
```

Hash is stable across requests so a broker doesn't bounce between versions mid-session.

### 3.4 Canary percentage update

`PATCH /api/admin/model-versions/{id}/canary` body: `{ canary_percentage }`.

Validation: sum of all canary percentages for the same `model_id` must be ≤ 100. Writes a `model_version_promotions` row with `from_state=to_state='canary'` and the before/after values.

### 3.5 Verification

- Promote a draft to canary at 50% — sweep 100 distinct user_ids and confirm roughly half land on the canary (the hash is deterministic, so the exact split is reproducible).
- Promote the canary to active — old active becomes deprecated; the unique index prevents a second active.
- Rollback: promote a deprecated to active after demoting the current one. Confirm `model_version_promotions` reflects both transitions.
- Try `draft → active` directly — allowed for emergencies; the side effect deprecates the current active.

### 3.6 Rollback

- The state machine API endpoints can be disabled behind `REGISTRY_STATE_MACHINE_ENABLED=false`; existing `is_active` boolean still works because the trigger maintains it.
- Migrations are additive; columns can stay even when the feature is off.

---

## Phase 4 — Admin UI

**Goal:** the registry is usable without curl.

Routes added under [frontend/app/(app)/admin/](../../frontend/app/(app)/admin/):

| Path | Component | Purpose |
|---|---|---|
| `/admin/registry` | `RegistryHomePage` | Pod cards: active version, canary %, last promotion |
| `/admin/registry/[modelId]` | `PodVersionsPage` | Timeline of all versions for a pod; promote / canary % controls |
| `/admin/registry/[modelId]/[versionId]` | `VersionDetailPage` | Prompt + rules editor (draft only), diff vs another version, decisions table |

### 4.1 Reuse

- TanStack Query + `adminApi.modelVersions` from Phase 1.
- Existing `Card`, `Badge`, `Tabs`, KPI components.
- `Diff` view: use the `diff` npm package, render side-by-side.

### 4.2 Promotion flow UX

A draft has an "Edit" button. Once promoted to canary, the edit form becomes read-only; admins can only change `canary_percentage` or promote further. Hard rule: **promoted versions are immutable**. If you want to change them, create a new version.

A confirmation modal before any promote-to-active — show the diff against the version it would demote.

### 4.3 Decisions-by-version

Below the version detail, a paginated table from `GET /api/governance/model-versions/{id}/decisions`. Columns: timestamp, broker, domain, AI recommendation, final decision, agreement. Filterable by status. This is where "did this version perform better?" gets answered visually until proper A/B analytics ship.

### 4.4 Verification

- Walk through a full lifecycle in the UI: create draft → edit → promote canary 10% → bump to 50% → promote active. Confirm rows in `model_version_promotions` match each click.
- Open the version-detail page on the synthetic `pre-registry` row — confirm it renders without crashing (it has no prompt content of substance).

### 4.5 Rollback

- The pages are net new; deleting the route directory removes them. API endpoints stay.

---

## Phase 5 — Export hook

**Goal:** compliance can pull `model_versions` and `model_version_promotions` via the existing exports endpoint.

### 5.1 One-line change

[backend/routers/governance.py:67-75](../../backend/routers/governance.py#L67-L75):

```python
allowed = {
    "decision_reviews", "mcp_call_log", "workflow_runs", "training_overrides",
    "model_versions", "model_version_promotions",   # new
}
```

`model_versions` has no `user_id` column; the per-user filter `result = sb.table(table).select("*").eq("user_id", user_id)` would return nothing. Either:

- (a) special-case the new tables to skip the filter, or
- (b) require admin role for these tables only.

Recommendation: (b) — wrap the route in a soft check that 403s if the table is one of the new ones and the user isn't admin. Keeps the function simple and matches the registry's existing read policy (anyone can read; only admin can export).

### 5.2 Verification

- `GET /api/governance/exports?table=model_versions` as admin returns rows.
- Same call as non-admin returns 403.
- Existing exports (decision_reviews etc.) unchanged.

### 5.3 Rollback

- Remove the two table names from the allowlist.

---

## Cross-cutting

### Interleaving with the pod plan

See the dependency ladder at the bottom of [pod-deployment-plan.md](pod-deployment-plan.md). The minimum path to a working registry **without** waiting on the pod work:

1. Registry Phase 0 ✓ (no deps)
2. Registry Phase 1 ✓ (no deps)
3. Registry Phase 3 ✓ (no deps — can do before Phase 2)
4. Registry Phase 4 + 5 ✓

Phase 2 (lineage writes) is the only phase that benefits from Pod Phase 1 landing first — without it, the chat handler still uses `DOMAIN_PROMPTS` and the "active version" is conceptually right but operationally redundant. Doable independently; just less useful.

### Not in this plan

- Linking `model_versions.rules_hash` to actual workflow definitions. Defer.
- Per-version Anthropic model selection. Reserve `metadata.anthropic_model` slot; ignore at runtime for now.
- Automated training → draft-version proposal. Out of scope.
- Cross-environment promotion (staging → prod). The current single-Supabase deploy doesn't have this concept yet.

## Open questions

1. **Force-edit a promoted version in an emergency?** A "break glass" mode that re-opens a canary/active for edit. Lean no — create a new version is the answer. But the question will come up.
2. **Per-broker canary opt-out.** Should an admin be able to say "this broker never sees canaries"? Easy via `activated_models.pinned_version_id`; nothing new required, but worth a docs note.
3. **Decisions-by-version pagination cost.** `decision_records` will get large. Consider an index on `(model_version_id, created_at DESC)` once Phase 2 lands.
