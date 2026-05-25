-- Create user_roles if it doesn't exist (fresh self-hosted Supabase won't have it).
-- Then re-point user_id FK from auth.users → public.users.
-- Schema: one role per user, enforced by UNIQUE(user_id).
-- See: backend/docs/Auth_Module_Plan.md §2.4

CREATE TABLE IF NOT EXISTS public.user_roles (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID  NOT NULL,
  role       TEXT  NOT NULL DEFAULT 'user'
             CHECK (role IN ('user','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON public.user_roles (user_id);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Drop old data (auth.users UUIDs won't match public.users)
TRUNCATE public.user_roles;

-- Drop old constraints if migrating from previous Supabase auth setup
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_unique;

-- Add FK to public.users
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- One role per user
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);

-- Drop old RLS policies
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles"    ON public.user_roles;

-- Only service_role (FastAPI backend) may read or write roles
DROP POLICY IF EXISTS user_roles_service ON public.user_roles;
CREATE POLICY user_roles_service ON public.user_roles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
