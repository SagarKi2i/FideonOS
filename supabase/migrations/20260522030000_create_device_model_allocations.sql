-- public.device_model_allocations — models allocated to each Electron device
-- Replaces old device_models table (different name; aligned with new architecture naming).
-- See: backend/docs/pod_structure.md §3 Group 5

CREATE TABLE public.device_model_allocations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id    UUID        NOT NULL,  -- FK to devices added in migration 20260523000400
  agent_id     UUID        REFERENCES public.agents(id),
  model_name   TEXT        NOT NULL,
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  allocated_by UUID        REFERENCES public.users(id),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX dma_device_id_idx ON public.device_model_allocations (device_id);
CREATE INDEX dma_agent_id_idx  ON public.device_model_allocations (agent_id);

ALTER TABLE public.device_model_allocations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER device_model_allocations_updated_at
  BEFORE UPDATE ON public.device_model_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
