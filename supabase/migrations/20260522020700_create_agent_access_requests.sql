-- public.agent_access_requests — marketplace agent access requests
-- For existing Fideon marketplace agents only. For user-built custom agents → custom_agent_requests.
-- On approval: admin sets is_active=true in user_agents for this user+agent pair.
-- See: backend/docs/pod_structure.md §3 Group 1

CREATE TABLE public.agent_access_requests (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  agent_id         UUID        NOT NULL REFERENCES public.agents(id),
  model_name       TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'submitted'
                   CHECK (status IN ('submitted','approved','rejected')),
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      UUID        REFERENCES public.users(id),
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX aar_user_id_idx  ON public.agent_access_requests (user_id);
CREATE INDEX aar_agent_id_idx ON public.agent_access_requests (agent_id);
CREATE INDEX aar_status_idx   ON public.agent_access_requests (status);

ALTER TABLE public.agent_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY aar_user ON public.agent_access_requests
  FOR SELECT USING (user_id = auth.uid());
