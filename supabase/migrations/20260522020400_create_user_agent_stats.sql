-- public.user_agent_stats — pre-aggregated KPI stats per user per agent
-- Written by the FastAPI runner on every run completion. Read is always O(1).
-- Never run GROUP BY at read time; aggregate only at write time.
-- See: backend/docs/pod_structure.md §3 Group 1 + §5 Write Path

CREATE TABLE public.user_agent_stats (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_agent_id UUID        NOT NULL UNIQUE REFERENCES public.user_agents(id) ON DELETE CASCADE,
  stats         JSONB       NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_agent_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY uas_user ON public.user_agent_stats
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_agents ua
      WHERE ua.id = user_agent_id AND ua.user_id = auth.uid()
    )
  );
