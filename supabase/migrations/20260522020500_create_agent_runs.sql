-- public.agent_runs — per-run execution log
-- metrics JSONB: per-run KPIs (Layer 3). activity JSONB: Activity tab feed entry (Layer 4).
-- Both written at run completion. human_in_the_loop flag only; detail in agent_run_approvals.
-- See: backend/docs/pod_structure.md §3 Group 1

CREATE TABLE public.agent_runs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES public.users(id),
  agent_id         UUID        NOT NULL REFERENCES public.agents(id),
  version_used     UUID        REFERENCES public.agent_versions(id),
  status           TEXT        NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running','complete','failed')),
  input            JSONB,
  output           JSONB,
  confidence       DECIMAL(5,2),
  metrics          JSONB,
  activity         JSONB,
  human_in_the_loop BOOLEAN    NOT NULL DEFAULT false,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Covers Activity tab (Q3), Trends tab (Q7), write-path pre-flight
CREATE INDEX agent_runs_user_agent_started_idx
  ON public.agent_runs (user_id, agent_id, started_at DESC);
CREATE INDEX agent_runs_agent_id_idx ON public.agent_runs (agent_id);
CREATE INDEX agent_runs_status_idx   ON public.agent_runs (status);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_runs_user ON public.agent_runs
  FOR ALL USING (user_id = auth.uid());

CREATE TRIGGER agent_runs_updated_at
  BEFORE UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
