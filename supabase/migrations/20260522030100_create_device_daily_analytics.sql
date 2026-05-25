-- public.device_daily_analytics — daily rollup per device
-- Replaces old device_analytics table; UNIQUE (device_id, date) for upsert safety.
-- See: backend/docs/pod_structure.md §3 Group 5

CREATE TABLE public.device_daily_analytics (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       UUID        NOT NULL,  -- FK to devices added in migration 20260523000400 (devices created later)
  date            DATE        NOT NULL DEFAULT CURRENT_DATE,
  run_count       INT         NOT NULL DEFAULT 0,
  token_usage     INT         NOT NULL DEFAULT 0,
  cpu_load_avg    DECIMAL(5,2),
  gpu_load_avg    DECIMAL(5,2),
  error_count     INT         NOT NULL DEFAULT 0,
  sync_count      INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, date)
);

CREATE INDEX dda_device_id_idx ON public.device_daily_analytics (device_id);
CREATE INDEX dda_date_idx      ON public.device_daily_analytics (date DESC);

ALTER TABLE public.device_daily_analytics ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER device_daily_analytics_updated_at
  BEFORE UPDATE ON public.device_daily_analytics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
