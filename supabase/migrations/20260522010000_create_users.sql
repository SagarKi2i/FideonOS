-- public.users — central identity table (replaces auth.users for all app logic)
-- FastAPI owns the entire auth layer; Supabase is DB-only.
-- See: backend/docs/Auth_Module_Plan.md §2.1

CREATE TABLE public.users (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT        NOT NULL UNIQUE,
  password_hash     TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('active','pending','locked','suspended')),
  email_verified_at TIMESTAMPTZ,
  failed_attempts   INT         NOT NULL DEFAULT 0,
  locked_until      TIMESTAMPTZ,
  full_name         TEXT,
  last_sign_in_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX users_email_idx  ON public.users (email);
CREATE INDEX users_status_idx ON public.users (status);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
