-- public.password_reset_tokens — forgot-password flow
-- 15-minute TTL. Token hash only stored; raw token only in the email link.
-- See: backend/docs/Auth_Module_Plan.md §2.7

CREATE TABLE public.password_reset_tokens (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reset_token_hash TEXT    NOT NULL UNIQUE,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '15 minutes',
  used             BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
