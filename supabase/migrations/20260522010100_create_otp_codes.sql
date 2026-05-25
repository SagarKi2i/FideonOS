-- public.otp_codes — transient OTP state, separate from users
-- One row per user (UNIQUE). Deleted on successful verify, expiry, or max attempts.
-- See: backend/docs/Auth_Module_Plan.md §2.2

CREATE TABLE public.otp_codes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  otp_code_hash TEXT        NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  attempt_count INT         NOT NULL DEFAULT 0,
  resend_count  INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX otp_codes_user_id_idx ON public.otp_codes (user_id);

ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
