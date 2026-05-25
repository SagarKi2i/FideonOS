-- public.electron_service_tokens — long-lived service tokens for Electron main process
-- 30-day TTL. Stored in OS keychain (Windows Credential Manager / macOS Keychain).
-- Web logout does NOT revoke these — separate token family from JWT refresh tokens.
-- See: backend/docs/Auth_Module_Plan.md §2.10

CREATE TABLE public.electron_service_tokens (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  device_id  UUID    REFERENCES public.user_devices(id),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.electron_service_tokens ENABLE ROW LEVEL SECURITY;
