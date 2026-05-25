-- Seed dashboard widget configs for all 6 live agents.
-- widgets[] drives KPI tiles; tabs[] is non-null only for Loss Run Reporting.
-- See: backend/docs/pod_structure.md §3 agent_dashboard_templates + §4 Layer 1

INSERT INTO public.agent_dashboard_templates
  (id, agent_id, comparison_period_days, widgets, tabs)
VALUES

-- ── Document Retrieval ────────────────────────────────────────────────────────
(
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  30,
  '[
    {"id":"documents_synced","type":"kpi_tile","field":"documents_synced","format":"number","header":"Documents Synced","footer":"Last 30 days","delta_field":"documents_synced_delta_pct","delta_format":"percent","trend":true,"invert":false,"criteria":{"good":{"gte":2000},"warn":{"gte":1000},"danger":{"lt":1000}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"sync_success_rate","type":"kpi_tile","field":"sync_success_rate","format":"percent","header":"Sync Success Rate","footer":"Percentage of successful syncs","delta_field":"sync_success_rate_delta_pts","delta_format":"absolute_pts","trend":true,"invert":false,"criteria":{"good":{"gte":95},"warn":{"gte":85},"danger":{"lt":85}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"avg_retrieval_time_s","type":"kpi_tile","field":"avg_retrieval_time_s","format":"seconds","header":"Avg. Retrieval Time","footer":"Per document","delta_field":"avg_retrieval_time_s_delta","delta_format":"absolute","trend":true,"invert":true,"criteria":{"good":{"lte":15},"warn":{"lte":30},"danger":{"gt":30}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"carriers_connected","type":"kpi_tile","field":"carriers_connected","format":"number","header":"Carriers Connected","footer":"Active carrier portals","delta_field":"carriers_connected_delta","delta_format":"absolute","trend":false,"invert":false,"criteria":{"good":{"gte":20},"warn":{"gte":10},"danger":{"lt":10}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"failed_pulls","type":"kpi_tile","field":"failed_pulls","format":"number","header":"Failed Pulls","footer":"Lower is better","delta_field":"failed_pulls_delta","delta_format":"absolute","trend":true,"invert":true,"criteria":{"good":{"lte":20},"warn":{"lte":50},"danger":{"gt":50}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}}
  ]',
  NULL
),

-- ── Loss Run Reporting (tabbed) ───────────────────────────────────────────────
(
  '30000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',
  30,
  '[
    {"id":"loss_runs_processed","type":"kpi_tile","field":"loss_runs_processed","format":"number","header":"Loss Runs Processed","footer":"Last 30 days","delta_field":"loss_runs_processed_delta_pct","delta_format":"percent","trend":true,"invert":false,"criteria":{"good":{"gte":500},"warn":{"gte":200},"danger":{"lt":200}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"avg_loss_ratio_pct","type":"kpi_tile","field":"avg_loss_ratio_pct","format":"percent","header":"Avg. Loss Ratio","footer":"Across processed runs","delta_field":"avg_loss_ratio_delta_pts","delta_format":"absolute_pts","trend":true,"invert":true,"criteria":{"good":{"lte":60},"warn":{"lte":80},"danger":{"gt":80}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"carriers_pulled","type":"kpi_tile","field":"carriers_pulled","format":"number","header":"Carriers Pulled","footer":"Active carrier sources","delta_field":"carriers_pulled_delta","delta_format":"absolute","trend":false,"invert":false,"criteria":{"good":{"gte":10},"warn":{"gte":5},"danger":{"lt":5}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"open_claims","type":"kpi_tile","field":"open_claims","format":"number","header":"Open Claims","footer":"Flagged for review","delta_field":"open_claims_delta","delta_format":"absolute","trend":true,"invert":true,"criteria":{"good":{"lte":50},"warn":{"lte":100},"danger":{"gt":100}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"avg_pull_time_s","type":"kpi_tile","field":"avg_pull_time_s","format":"seconds","header":"Avg. Pull Time","footer":"Per loss run","delta_field":"avg_pull_time_s_delta","delta_format":"absolute","trend":true,"invert":true,"criteria":{"good":{"lte":20},"warn":{"lte":45},"danger":{"gt":45}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}}
  ]',
  '[
    {"id":"renewal_book","label":"Renewal book","widgets":[
      {"id":"portfolio_renewals_due_30d","type":"kpi_tile","field":"portfolio_renewals_due_30d","format":"number","header":"Renewals Due (30d)","footer":"Policies expiring within 30 days","delta_field":null,"delta_format":null,"trend":false,"invert":false,"criteria":{"good":{"gte":0},"warn":{"gte":0},"danger":{"lt":0}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
      {"id":"portfolio_renewals_due_90d","type":"kpi_tile","field":"portfolio_renewals_due_90d","format":"number","header":"Renewals Due (90d)","footer":"Policies expiring within 90 days","delta_field":null,"delta_format":null,"trend":false,"invert":false,"criteria":{"good":{"gte":0},"warn":{"gte":0},"danger":{"lt":0}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
      {"id":"loss_runs_received","type":"kpi_tile","field":"loss_runs_received","format":"number","header":"Loss Runs Received","footer":"Ready for renewal review","delta_field":"loss_runs_received_delta_pct","delta_format":"percent","trend":true,"invert":false,"criteria":{"good":{"gte":100},"warn":{"gte":50},"danger":{"lt":50}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}}
    ]},
    {"id":"new_business","label":"New business","widgets":[
      {"id":"prospects_count","type":"kpi_tile","field":"prospects_count","format":"number","header":"Prospects","footer":"Active new-business prospects","delta_field":"prospects_count_delta","delta_format":"absolute","trend":true,"invert":false,"criteria":{"good":{"gte":20},"warn":{"gte":10},"danger":{"lt":10}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}}
    ]}
  ]'
),

-- ── Policy Comparison Engine ──────────────────────────────────────────────────
(
  '30000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000003',
  30,
  '[
    {"id":"comparisons_run","type":"kpi_tile","field":"comparisons_run","format":"number","header":"Comparisons Run","footer":"Last 30 days","delta_field":"comparisons_run_delta_pct","delta_format":"percent","trend":true,"invert":false,"criteria":{"good":{"gte":100},"warn":{"gte":50},"danger":{"lt":50}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"avg_coverage_score","type":"kpi_tile","field":"avg_coverage_score","format":"score","header":"Avg. Coverage Score","footer":"Out of 100","delta_field":"avg_coverage_score_delta","delta_format":"absolute","trend":true,"invert":false,"criteria":{"good":{"gte":80},"warn":{"gte":65},"danger":{"lt":65}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"coverage_gaps_found","type":"kpi_tile","field":"coverage_gaps_found","format":"number","header":"Coverage Gaps Found","footer":"Flagged across comparisons","delta_field":"coverage_gaps_found_delta","delta_format":"absolute","trend":true,"invert":true,"criteria":{"good":{"lte":10},"warn":{"lte":25},"danger":{"gt":25}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"avg_premium_delta_usd","type":"kpi_tile","field":"avg_premium_delta_usd","format":"currency","header":"Avg. Premium Delta","footer":"vs. prior period","delta_field":null,"delta_format":null,"trend":false,"invert":false,"criteria":{"good":{"gte":0},"warn":{"gte":0},"danger":{"lt":0}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"recommendations_acted_pct","type":"kpi_tile","field":"recommendations_acted_pct","format":"percent","header":"Recommendations Acted","footer":"Of total recommendations","delta_field":"recommendations_acted_delta_pts","delta_format":"absolute_pts","trend":true,"invert":false,"criteria":{"good":{"gte":70},"warn":{"gte":50},"danger":{"lt":50}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}}
  ]',
  NULL
),

-- ── Quote Generation Agent ────────────────────────────────────────────────────
(
  '30000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000004',
  30,
  '[
    {"id":"quotes_generated","type":"kpi_tile","field":"quotes_generated","format":"number","header":"Quotes Generated","footer":"Last 30 days","delta_field":"quotes_generated_delta_pct","delta_format":"percent","trend":true,"invert":false,"criteria":{"good":{"gte":200},"warn":{"gte":100},"danger":{"lt":100}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"bind_rate_pct","type":"kpi_tile","field":"bind_rate_pct","format":"percent","header":"Bind Rate","footer":"Quotes that converted","delta_field":"bind_rate_delta_pts","delta_format":"absolute_pts","trend":true,"invert":false,"criteria":{"good":{"gte":40},"warn":{"gte":25},"danger":{"lt":25}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"avg_premium_usd","type":"kpi_tile","field":"avg_premium_usd","format":"currency","header":"Avg. Premium","footer":"Per quoted risk","delta_field":"avg_premium_delta_usd","delta_format":"absolute_usd","trend":true,"invert":false,"criteria":{"good":{"gte":0},"warn":{"gte":0},"danger":{"lt":0}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"avg_turnaround_s","type":"kpi_tile","field":"avg_turnaround_s","format":"seconds","header":"Avg. Turnaround","footer":"Quote-to-ready time","delta_field":"avg_turnaround_s_delta","delta_format":"absolute","trend":true,"invert":true,"criteria":{"good":{"lte":30},"warn":{"lte":60},"danger":{"gt":60}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"quoted_premium_usd","type":"kpi_tile","field":"quoted_premium_usd","format":"currency","header":"Total Quoted Premium","footer":"Volume this period","delta_field":"quoted_premium_delta_pct","delta_format":"percent","trend":true,"invert":false,"criteria":{"good":{"gte":0},"warn":{"gte":0},"danger":{"lt":0}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}}
  ]',
  NULL
),

-- ── Coverage Validation ───────────────────────────────────────────────────────
(
  '30000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000005',
  30,
  '[
    {"id":"policies_checked","type":"kpi_tile","field":"policies_checked","format":"number","header":"Policies Checked","footer":"Last 30 days","delta_field":"policies_checked_delta_pct","delta_format":"percent","trend":true,"invert":false,"criteria":{"good":{"gte":300},"warn":{"gte":150},"danger":{"lt":150}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"discrepancies_found","type":"kpi_tile","field":"discrepancies_found","format":"number","header":"Discrepancies Found","footer":"Flagged for review","delta_field":"discrepancies_found_delta","delta_format":"absolute","trend":true,"invert":true,"criteria":{"good":{"lte":20},"warn":{"lte":50},"danger":{"gt":50}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"avg_check_time_s","type":"kpi_tile","field":"avg_check_time_s","format":"seconds","header":"Avg. Check Time","footer":"Per policy","delta_field":"avg_check_time_s_delta","delta_format":"absolute","trend":true,"invert":true,"criteria":{"good":{"lte":10},"warn":{"lte":20},"danger":{"gt":20}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"auto_resolved","type":"kpi_tile","field":"auto_resolved","format":"number","header":"Auto-Resolved","footer":"Fixed without human review","delta_field":"auto_resolved_delta_pct","delta_format":"percent","trend":true,"invert":false,"criteria":{"good":{"gte":80},"warn":{"gte":60},"danger":{"lt":60}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"pending_review","type":"kpi_tile","field":"pending_review","format":"number","header":"Pending Review","footer":"Awaiting human action","delta_field":"pending_review_delta","delta_format":"absolute","trend":true,"invert":true,"criteria":{"good":{"lte":5},"warn":{"lte":15},"danger":{"gt":15}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}}
  ]',
  NULL
),

-- ── Renewal Review ────────────────────────────────────────────────────────────
(
  '30000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-000000000006',
  30,
  '[
    {"id":"renewals_prepped","type":"kpi_tile","field":"renewals_prepped","format":"number","header":"Renewals Prepped","footer":"Last 30 days","delta_field":"renewals_prepped_delta_pct","delta_format":"percent","trend":true,"invert":false,"criteria":{"good":{"gte":100},"warn":{"gte":50},"danger":{"lt":50}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"avg_premium_delta_pct","type":"kpi_tile","field":"avg_premium_delta_pct","format":"percent","header":"Avg. Premium Change","footer":"vs. expiring premium","delta_field":"avg_premium_delta_pct_delta","delta_format":"absolute_pts","trend":true,"invert":false,"criteria":{"good":{"gte":0},"warn":{"gte":0},"danger":{"lt":0}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"changes_flagged","type":"kpi_tile","field":"changes_flagged","format":"number","header":"Changes Flagged","footer":"Coverage or term changes","delta_field":"changes_flagged_delta","delta_format":"absolute","trend":true,"invert":true,"criteria":{"good":{"lte":20},"warn":{"lte":50},"danger":{"gt":50}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"client_emails_drafted","type":"kpi_tile","field":"client_emails_drafted","format":"number","header":"Client Emails Drafted","footer":"Ready to send","delta_field":"client_emails_drafted_delta_pct","delta_format":"percent","trend":true,"invert":false,"criteria":{"good":{"gte":80},"warn":{"gte":50},"danger":{"lt":50}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"avg_prep_time_s","type":"kpi_tile","field":"avg_prep_time_s","format":"seconds","header":"Avg. Prep Time","footer":"Per renewal package","delta_field":"avg_prep_time_s_delta","delta_format":"absolute","trend":true,"invert":true,"criteria":{"good":{"lte":30},"warn":{"lte":60},"danger":{"gt":60}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}}
  ]',
  NULL
)

ON CONFLICT (id) DO NOTHING;
