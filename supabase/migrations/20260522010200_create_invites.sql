-- public.invites — invite-only signup gate
-- Raw token only in the email link; DB stores SHA-256 hash only.
-- See: backend/docs/Auth_Module_Plan.md §2.3

CREATE TABLE public.invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  TEXT        NOT NULL UNIQUE,
  email       TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'PENDING'
              CHECK (status IN ('PENDING','ACCEPTED','EXPIRED','REVOKED')),
  invited_by  UUID        REFERENCES public.users(id),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '48 hours',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX invites_token_hash_idx ON public.invites (token_hash);
CREATE INDEX invites_email_idx      ON public.invites (email);
CREATE INDEX invites_status_idx     ON public.invites (status);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
