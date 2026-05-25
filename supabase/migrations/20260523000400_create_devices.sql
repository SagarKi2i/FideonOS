-- public.devices — Electron desktop devices registered with Fideon OS.
-- Authenticated via X-Device-Token header (get_device dependency).
-- Managed by admin: pending → active → suspended.

CREATE TABLE public.devices (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_token  TEXT        NOT NULL UNIQUE,
  os_type       TEXT,
  app_version   TEXT,
  hostname      TEXT,
  status        TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','active','suspended')),
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX devices_token_idx  ON public.devices (device_token);
CREATE INDEX devices_status_idx ON public.devices (status);

CREATE TRIGGER devices_updated_at
  BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY devices_service ON public.devices
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- public.device_sync_logs — check-in and sync event log per device.

CREATE TABLE public.device_sync_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   UUID        NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  sync_type   TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'success'
              CHECK (status IN ('success','failure')),
  details     JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX dsl_device_id_idx ON public.device_sync_logs (device_id);
CREATE INDEX dsl_created_at_idx ON public.device_sync_logs (created_at DESC);

ALTER TABLE public.device_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY dsl_service ON public.device_sync_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- device_model_allocations.device_id FK was deferred until devices existed
ALTER TABLE public.device_model_allocations
  ADD CONSTRAINT dma_device_id_fkey
  FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;

-- device_daily_analytics.device_id FK was deferred until devices existed
ALTER TABLE public.device_daily_analytics
  ADD CONSTRAINT dda_device_id_fkey
  FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;
