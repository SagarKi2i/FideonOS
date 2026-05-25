-- public.agent_dashboard_templates — per-agent widget config (one row per agent)
-- widgets JSONB drives every KPI tile; zero frontend code changes to add/edit tiles.
-- tabs JSONB is non-null only for multi-tab agents (e.g. Loss Run Reporting).
-- See: backend/docs/pod_structure.md §3 Group 1

CREATE TABLE public.agent_dashboard_templates (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              UUID        NOT NULL UNIQUE REFERENCES public.agents(id) ON DELETE CASCADE,
  widgets               JSONB       NOT NULL DEFAULT '[]',
  tabs                  JSONB,
  comparison_period_days INT        NOT NULL DEFAULT 30,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_dashboard_templates ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER agent_dashboard_templates_updated_at
  BEFORE UPDATE ON public.agent_dashboard_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
