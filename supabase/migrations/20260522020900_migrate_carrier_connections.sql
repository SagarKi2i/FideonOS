-- Absorb document_retrieval_configs into carrier_connections.extra JSONB.
-- carrier_connections already has an extra JSONB column; migrate sources, doc_types,
-- email_alias from document_retrieval_configs into it, then deprecate the old table.
-- See: backend/docs/pod_structure.md §9 Migration

-- NOTE: carrier_connections and document_retrieval_configs are NOT created in this
-- migration set — their schema/ownership is owned by a separate workstream (see
-- backend/docs/pending_tables.md). This migration is therefore guarded so a fresh DB
-- migrates cleanly when those tables are absent; it only runs the data move once both
-- tables actually exist.
-- NOTE: carrier_connections is now GLOBAL/admin-set (one row per carrier_id, no user_id);
-- doc-retrieval config lives in carrier_connections.extra. There is no per-user
-- document_retrieval_configs data to migrate. If a legacy table exists, just deprecate it.
DO $$
BEGIN
  IF to_regclass('public.document_retrieval_configs') IS NOT NULL THEN
    ALTER TABLE public.document_retrieval_configs
      RENAME TO document_retrieval_configs_deprecated;
  ELSE
    RAISE NOTICE 'No legacy document_retrieval_configs to deprecate.';
  END IF;
END $$;
