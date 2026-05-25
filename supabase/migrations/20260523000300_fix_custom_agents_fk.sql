-- custom_agent_requests.custom_agent_id references public.custom_agents(id)
-- but the custom_agents table was not created before custom_agent_requests.
-- Fix: create custom_agents now, then restore the FK on custom_agent_requests.

CREATE TABLE IF NOT EXISTS public.custom_agents (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL,
  description  TEXT,
  status       TEXT        NOT NULL DEFAULT 'building'
               CHECK (status IN ('building','testing','live','deprecated')),
  created_by   UUID        REFERENCES public.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER custom_agents_updated_at
  BEFORE UPDATE ON public.custom_agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.custom_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY custom_agents_service ON public.custom_agents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- custom_agent_id column already exists from migration 020800 (no FK yet).
-- Now that custom_agents exists, add the FK constraint.
ALTER TABLE public.custom_agent_requests
  ADD CONSTRAINT custom_agent_requests_custom_agent_id_fkey
  FOREIGN KEY (custom_agent_id) REFERENCES public.custom_agents(id);
