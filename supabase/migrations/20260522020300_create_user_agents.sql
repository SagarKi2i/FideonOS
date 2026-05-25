-- public.user_agents — which users have access to which agents (activations)
-- Replaces the old activated_models table (different name, different schema).
-- See: backend/docs/pod_structure.md §3 Group 1

CREATE TABLE public.user_agents (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  agent_id           UUID        NOT NULL REFERENCES public.agents(id),
  current_version_id UUID        REFERENCES public.agent_versions(id),
  model_name         TEXT        NOT NULL,
  domain             TEXT        NOT NULL,
  activated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active          BOOLEAN     NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE INDEX user_agents_user_id_idx  ON public.user_agents (user_id);
CREATE INDEX user_agents_agent_id_idx ON public.user_agents (agent_id);

ALTER TABLE public.user_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_agents_user ON public.user_agents
  FOR ALL USING (user_id = auth.uid());

CREATE TRIGGER user_agents_updated_at
  BEFORE UPDATE ON public.user_agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
