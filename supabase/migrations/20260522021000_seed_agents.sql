-- Seed the 6 live agents into public.agents.
-- Stable UUIDs used so agent_versions and dashboard_templates seeds can reference them.
-- current_version_id left NULL here; updated in 022_seed_agent_versions.
-- See: backend/docs/pod_structure.md §10 Agent Catalog Reference

INSERT INTO public.agents (id, keyword, name, description, domain, tagline, status)
VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    'document-retrieval',
    'Document Retrieval',
    'Automatically retrieves loss runs, policies, endorsements, and renewals from carrier portals and email.',
    'insurance',
    'Pull documents from any carrier, automatically.',
    'live'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'loss-run-reporting',
    'Loss Run Reporting',
    'Pulls loss run data from carrier portals and generates structured reports for renewal and new-business workflows.',
    'insurance',
    'From carrier portal to structured report in seconds.',
    'live'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'policy-comparison',
    'Policy Comparison Engine',
    'Compares policy documents across carriers to surface coverage gaps, premium deltas, and recommendations.',
    'insurance',
    'Side-by-side coverage analysis, instantly.',
    'live'
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    'quote-generation',
    'Quote Generation Agent',
    'Fetches and structures quotes from multiple carriers for a given risk profile.',
    'insurance',
    'Multi-carrier quotes, structured and ready to present.',
    'live'
  ),
  (
    '10000000-0000-0000-0000-000000000005',
    'coverage-validation',
    'Coverage Validation',
    'Validates active policies against client requirements and flags discrepancies for review.',
    'insurance',
    'Catch coverage gaps before they become claims.',
    'live'
  ),
  (
    '10000000-0000-0000-0000-000000000006',
    'renewal-review',
    'Renewal Review',
    'Prepares renewal packages by analysing expiring policies, flagging premium changes, and drafting client emails.',
    'insurance',
    'Renewal prep, automated end-to-end.',
    'live'
  )
ON CONFLICT (id) DO NOTHING;
