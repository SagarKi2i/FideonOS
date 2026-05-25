-- public.user_devices — device fingerprinting and geo anomaly tracking
-- See: backend/docs/Auth_Module_Plan.md §2.5

CREATE TABLE public.user_devices (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  fingerprint_hash TEXT    NOT NULL,
  ip_address       TEXT,
  country_code     CHAR(2),
  user_agent       TEXT,
  is_trusted       BOOLEAN NOT NULL DEFAULT false,
  last_seen_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, fingerprint_hash)
);

CREATE INDEX user_devices_user_id_idx ON public.user_devices (user_id);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
