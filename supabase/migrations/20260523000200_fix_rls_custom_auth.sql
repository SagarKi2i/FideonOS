-- RLS policies on these tables used auth.uid() which only works with Supabase Auth.
-- Since we use zero Supabase Auth (custom FastAPI RS256), auth.uid() always returns NULL
-- and every policy would silently block all access.
--
-- Fix: drop the auth.uid()-based policies and replace with service_role-only access.
-- FastAPI connects as service_role via the service role key — identity is enforced at
-- the API layer by JWT validation, not at the DB layer for these tables.

-- ── user_agents ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS user_agents_user ON public.user_agents;
CREATE POLICY user_agents_service ON public.user_agents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── user_agent_stats ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS uas_user ON public.user_agent_stats;
CREATE POLICY uas_service ON public.user_agent_stats
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── agent_runs ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS agent_runs_user ON public.agent_runs;
CREATE POLICY agent_runs_service ON public.agent_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── agent_run_approvals ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS ara_user ON public.agent_run_approvals;
CREATE POLICY ara_service ON public.agent_run_approvals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── agent_access_requests ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS aar_user ON public.agent_access_requests;
CREATE POLICY aar_service ON public.agent_access_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── custom_agent_requests ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS car_user ON public.custom_agent_requests;
CREATE POLICY car_service ON public.custom_agent_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);
