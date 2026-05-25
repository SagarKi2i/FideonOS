-- public.custom_agent_requests — user-initiated custom agent build requests
-- Carries the full build pipeline lifecycle: submitted → in_review → building → testing → installed.
-- Distinct from agent_access_requests (marketplace agents) and custom_pod_requests (old table).
-- See: backend/docs/pod_structure.md §3 Group 2

CREATE TABLE public.custom_agent_requests (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title                    TEXT        NOT NULL,
  sop_text                 TEXT,
  sop_file_url             TEXT,
  target_carriers          TEXT[],
  priority                 TEXT        NOT NULL DEFAULT 'normal'
                           CHECK (priority IN ('low','normal','high','urgent')),
  expected_outcome         TEXT,
  phone_no                 TEXT,
  desired_by               DATE,
  status                   TEXT        NOT NULL DEFAULT 'submitted'
                           CHECK (status IN ('submitted','in_review','building','testing','installed')),
  status_history           JSONB       NOT NULL DEFAULT '[]',
  assigned_admin_id        UUID        REFERENCES public.users(id),
  reviewed_at              TIMESTAMPTZ,
  reviewed_by              UUID        REFERENCES public.users(id),
  rejection_reason         TEXT,
  custom_agent_id          UUID,  -- FK to custom_agents added in migration 20260523000300
  installed_user_agent_id  UUID        REFERENCES public.user_agents(id),
  installed_at             TIMESTAMPTZ,
  requested_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX car_user_id_idx ON public.custom_agent_requests (user_id);
CREATE INDEX car_status_idx  ON public.custom_agent_requests (status);

ALTER TABLE public.custom_agent_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY car_user ON public.custom_agent_requests
  FOR SELECT USING (user_id = auth.uid());

CREATE TRIGGER custom_agent_requests_updated_at
  BEFORE UPDATE ON public.custom_agent_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
