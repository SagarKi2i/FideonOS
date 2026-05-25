-- Seed v1.0.0 for each of the 6 live agents.
-- After inserting versions, back-fill agents.current_version_id.
-- See: backend/docs/pod_structure.md §10

INSERT INTO public.agent_versions
  (id, agent_id, version, is_active,
   input_schema, output_schema)
VALUES
  -- document-retrieval v1.0.0
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '1.0.0', true,
    '{"carrier_ids":{"type":"array","items":"string","required":true},"date_range":{"type":"object","required":true},"document_types":{"type":"array","items":"string","required":true,"enum":["renewal","endorsement","cancellation","loss_run","invoice"]},"email_alias":{"type":"string","required":false}}',
    '{"documents_synced":{"type":"number"},"sync_success":{"type":"boolean"},"retrieval_time_s":{"type":"number"},"carriers_hit":{"type":"number"},"failed":{"type":"number"},"doc_types":{"type":"object"},"completed_at":{"type":"timestamp"}}'
  ),
  -- loss-run-reporting v1.0.0
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '1.0.0', true,
    '{"carrier_ids":{"type":"array","items":"string","required":true},"policy_numbers":{"type":"array","items":"string","required":false},"date_range":{"type":"object","required":true},"include_open_claims":{"type":"boolean","required":false}}',
    '{"loss_runs_processed":{"type":"number"},"avg_loss_ratio_pct":{"type":"number"},"carriers_pulled":{"type":"number"},"open_claims":{"type":"number"},"avg_pull_time_s":{"type":"number"},"completed_at":{"type":"timestamp"}}'
  ),
  -- policy-comparison v1.0.0
  (
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    '1.0.0', true,
    '{"policy_ids":{"type":"array","items":"string","required":true},"comparison_dimensions":{"type":"array","items":"string","required":false}}',
    '{"comparisons_run":{"type":"number"},"avg_coverage_score":{"type":"number"},"coverage_gaps_found":{"type":"number"},"avg_premium_delta_usd":{"type":"number"},"recommendations_acted_pct":{"type":"number"},"completed_at":{"type":"timestamp"}}'
  ),
  -- quote-generation v1.0.0
  (
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000004',
    '1.0.0', true,
    '{"carrier_ids":{"type":"array","items":"string","required":true},"risk_profile":{"type":"object","required":true},"effective_date":{"type":"string","required":true}}',
    '{"quotes_generated":{"type":"number"},"bind_rate_pct":{"type":"number"},"avg_premium_usd":{"type":"number"},"avg_turnaround_s":{"type":"number"},"quoted_premium_usd":{"type":"number"},"completed_at":{"type":"timestamp"}}'
  ),
  -- coverage-validation v1.0.0
  (
    '20000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000005',
    '1.0.0', true,
    '{"policy_ids":{"type":"array","items":"string","required":true},"client_requirements":{"type":"object","required":true}}',
    '{"policies_checked":{"type":"number"},"discrepancies_found":{"type":"number"},"avg_check_time_s":{"type":"number"},"auto_resolved":{"type":"number"},"pending_review":{"type":"number"},"completed_at":{"type":"timestamp"}}'
  ),
  -- renewal-review v1.0.0
  (
    '20000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000006',
    '1.0.0', true,
    '{"policy_ids":{"type":"array","items":"string","required":true},"renewal_window_days":{"type":"number","required":false}}',
    '{"renewals_prepped":{"type":"number"},"avg_premium_delta_pct":{"type":"number"},"changes_flagged":{"type":"number"},"client_emails_drafted":{"type":"number"},"avg_prep_time_s":{"type":"number"},"completed_at":{"type":"timestamp"}}'
  )
ON CONFLICT (id) DO NOTHING;

-- Back-fill agents.current_version_id
UPDATE public.agents SET current_version_id = '20000000-0000-0000-0000-000000000001' WHERE id = '10000000-0000-0000-0000-000000000001';
UPDATE public.agents SET current_version_id = '20000000-0000-0000-0000-000000000002' WHERE id = '10000000-0000-0000-0000-000000000002';
UPDATE public.agents SET current_version_id = '20000000-0000-0000-0000-000000000003' WHERE id = '10000000-0000-0000-0000-000000000003';
UPDATE public.agents SET current_version_id = '20000000-0000-0000-0000-000000000004' WHERE id = '10000000-0000-0000-0000-000000000004';
UPDATE public.agents SET current_version_id = '20000000-0000-0000-0000-000000000005' WHERE id = '10000000-0000-0000-0000-000000000005';
UPDATE public.agents SET current_version_id = '20000000-0000-0000-0000-000000000006' WHERE id = '10000000-0000-0000-0000-000000000006';
