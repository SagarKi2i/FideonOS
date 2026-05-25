-- public.agents — agent catalog (marketplace)
-- current_version_id is set after agent_versions rows are inserted (see 022_seed_agent_versions).
-- See: backend/docs/pod_structure.md §3 Group 1

CREATE TABLE public.agents (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword              TEXT        NOT NULL UNIQUE,
  name                 TEXT        NOT NULL,
  description          TEXT,
  domain               TEXT        NOT NULL,
  tagline              TEXT,
  icon_asset_file_name TEXT,
  current_version_id   UUID,       -- FK added after agent_versions exists; see constraint below
  status               TEXT        NOT NULL DEFAULT 'coming_soon'
                       CHECK (status IN ('live','beta','coming_soon','deprecated')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agents_keyword_idx ON public.agents (keyword);
CREATE INDEX agents_domain_idx  ON public.agents (domain);
CREATE INDEX agents_status_idx  ON public.agents (status);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
