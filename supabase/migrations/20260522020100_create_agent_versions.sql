-- public.agent_versions — versioned prompts, schemas, and rules per agent
-- Never mutate an existing row; add a new version row instead.
-- See: backend/docs/pod_structure.md §3 Group 1

CREATE TABLE public.agent_versions (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                  UUID        NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  version                   TEXT        NOT NULL,
  prompt_template           TEXT,
  narrative_prompt_template TEXT,
  pydantic_rules_template   TEXT,
  input_schema              JSONB,
  output_schema             JSONB,
  is_active                 BOOLEAN     NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, version)
);

CREATE INDEX agent_versions_agent_id_idx ON public.agent_versions (agent_id);

ALTER TABLE public.agent_versions ENABLE ROW LEVEL SECURITY;

-- Back-pointer FK: agents.current_version_id → agent_versions(id)
ALTER TABLE public.agents
  ADD CONSTRAINT agents_current_version_id_fkey
    FOREIGN KEY (current_version_id) REFERENCES public.agent_versions(id);
