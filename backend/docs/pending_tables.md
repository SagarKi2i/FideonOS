# Pending Tables — referenced by backend routers but NOT in migrations

**Updated 2026-05-24.** The backend routers reference tables that the canonical
`supabase/migrations/` set does not create. This file is the accurate inventory
(previously it listed only 4 — it was out of date).

## Crash safety (already in place)
- **Global handler:** `main.py` `_missing_table_handler` turns any missing-table
  error (PostgREST `42P01`) into HTTP **501**, app-wide, instead of a 500.
- **Per-route guards:** `agents.py` and `approvals.py` also use
  `services.supabase.is_missing_table_error()` for read→`[]` / write→501.
- **Migration guard:** `20260522020900_migrate_carrier_connections.sql` is
  `to_regclass`-guarded.

When you implement a table: add a dated migration (with `service_role` RLS +
`set_updated_at` trigger where relevant), then the 501s for that feature disappear.

---

## ✅ Provisioned 2026-05-24
- **`carrier_connections`**, **`ams_connections`** — created in
  `20260522020850_create_integrations.sql` (authoritative DDL from pod_structure.md §3 Group 3).
  Used by `settings.py` (carriers/ams) and `agents.py` (doc-retrieval-config). No longer missing.

## ❌ Still missing — owned by other workstreams

No authoritative schema exists for these yet. **Do not invent columns** — get the
spec from the owning workstream first, then add the migration.

| Table(s) | Router(s) | Notes |
|----------|-----------|-------|
| `workflows`, `workflow_runs` | `workflows.py` | Workflow definitions + runs. pod_structure.md §3 Group 4 lists the intended set (`workflows`, `workflow_steps`, `runs`, `run_steps`, `langgraph_checkpoints`, `approvals`, `notifications`) but without DDL. |
| `decision_records`, `decision_events`, `decision_exports` | `governance.py` | Governance/audit decision ledger. No spec. |
| `decision_reviews` | `approvals.py`, `governance.py`, `demo.py` | Review queue. Columns referenced: `id, user_id, created_at` + `DecisionReviewUpdate`. |
| `training_examples` | `approvals.py` | `id, user_id, review_id(FK→decision_reviews), model_id, prompt, original_output, corrected_output, rating, feedback_type, metadata, created_at`. |
| `training_jobs`, `training_feedback`, `training_overrides` | `training.py`, `governance.py` | SLM training pipeline. No spec. |
| `federated_contributions`, `federated_rounds` | `training.py` | Federated learning. No spec. |
| `chat_conversations`, `chat_messages` | `chat.py` | Chat history. No spec. |
| `mcp_tokens`, `mcp_call_log` | `mcp.py`, `governance.py` | MCP tokens + call audit. No spec. |
| `document_retrieval_configs` | migration `020900` only | Legacy source table; absorbed into `carrier_connections.extra`. Only needed if pre-conversion data must be migrated; on a clean DB it is never created. |

See `ALIGNMENT_AND_REMAINING_WORK.md` for the per-owner frontend↔backend handoff.
