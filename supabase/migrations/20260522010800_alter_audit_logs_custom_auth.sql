-- Create audit_logs if it doesn't exist (fresh self-hosted Supabase won't have it).
-- Then re-point the user_id FK from auth.users → public.users.
-- See: backend/docs/Auth_Module_Plan.md §2.9

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID,
  action        TEXT        NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  details       JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx  ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx   ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx  ON public.audit_logs (created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Clear any existing rows (auth.users UUIDs won't match public.users)
TRUNCATE public.audit_logs;

ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id);

-- Enforce INSERT-only at the DB role level (run against the Supabase app role FastAPI uses)
-- REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticator;

-- Drop old RLS policies
DROP POLICY IF EXISTS "Admins can view all audit logs"      ON public.audit_logs;
DROP POLICY IF EXISTS "Users can view their own audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs"        ON public.audit_logs;

-- Only service_role (FastAPI backend) may read or write audit logs
DROP POLICY IF EXISTS audit_logs_service ON public.audit_logs;
CREATE POLICY audit_logs_service ON public.audit_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
