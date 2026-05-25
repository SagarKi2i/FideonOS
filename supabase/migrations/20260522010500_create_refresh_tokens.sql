-- public.refresh_tokens — JWT refresh token rotation
-- Raw token only in HttpOnly cookie; DB stores SHA-256 hash.
-- Replay detection: if revoked token is reused, revoke ALL user tokens.
-- See: backend/docs/Auth_Module_Plan.md §2.6

CREATE TABLE public.refresh_tokens (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash  TEXT    NOT NULL UNIQUE,
  jti         TEXT    NOT NULL UNIQUE,
  revoked     BOOLEAN NOT NULL DEFAULT false,
  expires_at  TIMESTAMPTZ NOT NULL,
  device_info JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX refresh_tokens_user_id_idx ON public.refresh_tokens (user_id);

ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;
