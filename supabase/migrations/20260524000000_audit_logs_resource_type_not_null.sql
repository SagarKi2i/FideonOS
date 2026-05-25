-- Align audit_logs with Auth_Module_Plan.md §2.9:
--   - resource_type must be NOT NULL (every audit write categorizes its resource;
--     both writers — auth/dependencies.py and routers/auth.py._audit — always supply it).
--   - index renamed audit_logs_created_idx → audit_logs_created_at_idx to match spec.

-- Backfill any legacy NULLs so the NOT NULL constraint can be applied safely.
UPDATE public.audit_logs SET resource_type = 'unknown' WHERE resource_type IS NULL;

ALTER TABLE public.audit_logs
  ALTER COLUMN resource_type SET NOT NULL;

-- Spec-aligned index name.
ALTER INDEX IF EXISTS public.audit_logs_created_idx RENAME TO audit_logs_created_at_idx;
