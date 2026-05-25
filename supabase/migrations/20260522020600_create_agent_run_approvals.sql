-- public.agent_run_approvals — HITL approval detail (separate from run row)
-- agent_runs.human_in_the_loop is a flag only; full approval state lives here.
-- See: backend/docs/pod_structure.md §3 Group 1

CREATE TABLE public.agent_run_approvals (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID        NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.users(id),
  hitl_status TEXT        NOT NULL DEFAULT 'pending'
              CHECK (hitl_status IN ('pending','approved','rejected','escalated')),
  decision    TEXT,
  reviewer_id UUID        REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ara_run_id_idx  ON public.agent_run_approvals (run_id);
CREATE INDEX ara_user_id_idx ON public.agent_run_approvals (user_id);
CREATE INDEX ara_status_idx  ON public.agent_run_approvals (hitl_status);

ALTER TABLE public.agent_run_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY ara_user ON public.agent_run_approvals
  FOR SELECT USING (user_id = auth.uid());

CREATE TRIGGER agent_run_approvals_updated_at
  BEFORE UPDATE ON public.agent_run_approvals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
