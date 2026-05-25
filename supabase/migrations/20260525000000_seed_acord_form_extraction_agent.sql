-- Add the ACORD Form Extraction agent to the catalog (marketplace).
-- Mirrors the 6 seeded live agents: agents row + agent_versions v1.0.0 + dashboard template.
-- Stable UUIDs follow the existing ...0007 slot convention.
-- See: backend/docs/pod_structure.md §10 Agent Catalog Reference

-- 1) Catalog row. status='live' + the /agents/marketplace endpoint filter
--    (status IN ('live','beta','coming_soon')) makes it appear in the marketplace.
INSERT INTO public.agents (id, keyword, name, description, domain, tagline, status)
VALUES (
  '10000000-0000-0000-0000-000000000007',
  'acord-form-extraction',
  'ACORD Form Extraction',
  'Extracts structured data from ACORD forms (125, 126, 140, etc.) — parsing fields, validating values, and outputting clean records for downstream workflows.',
  'insurance',
  'Turn any ACORD form into structured data, instantly.',
  'live'
)
ON CONFLICT (id) DO NOTHING;

-- 2) Active version v1.0.0 with input/output schemas.
INSERT INTO public.agent_versions
  (id, agent_id, version, is_active, input_schema, output_schema)
VALUES (
  '20000000-0000-0000-0000-000000000007',
  '10000000-0000-0000-0000-000000000007',
  '1.0.0', true,
  '{"document_ids":{"type":"array","items":"string","required":true},"form_types":{"type":"array","items":"string","required":false,"enum":["acord_125","acord_126","acord_127","acord_130","acord_140","acord_25"]},"validate_fields":{"type":"boolean","required":false}}',
  '{"forms_extracted":{"type":"number"},"fields_extracted":{"type":"number"},"extraction_accuracy_pct":{"type":"number"},"avg_extraction_time_s":{"type":"number"},"manual_corrections":{"type":"number"},"completed_at":{"type":"timestamp"}}'
)
ON CONFLICT (id) DO NOTHING;

-- 3) Back-fill the catalog row's current_version_id.
UPDATE public.agents
  SET current_version_id = '20000000-0000-0000-0000-000000000007'
  WHERE id = '10000000-0000-0000-0000-000000000007';

-- 4) Dashboard template (KPI tiles). Single-tab, mirrors the other agents' widget shape.
INSERT INTO public.agent_dashboard_templates
  (id, agent_id, comparison_period_days, widgets, tabs)
VALUES (
  '30000000-0000-0000-0000-000000000007',
  '10000000-0000-0000-0000-000000000007',
  30,
  '[
    {"id":"forms_extracted","type":"kpi_tile","field":"forms_extracted","format":"number","header":"Forms Extracted","footer":"Last 30 days","delta_field":"forms_extracted_delta_pct","delta_format":"percent","trend":true,"invert":false,"criteria":{"good":{"gte":300},"warn":{"gte":150},"danger":{"lt":150}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"extraction_accuracy_pct","type":"kpi_tile","field":"extraction_accuracy_pct","format":"percent","header":"Extraction Accuracy","footer":"Validated field accuracy","delta_field":"extraction_accuracy_delta_pts","delta_format":"absolute_pts","trend":true,"invert":false,"criteria":{"good":{"gte":95},"warn":{"gte":85},"danger":{"lt":85}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"fields_extracted","type":"kpi_tile","field":"fields_extracted","format":"number","header":"Fields Extracted","footer":"Across all forms","delta_field":"fields_extracted_delta_pct","delta_format":"percent","trend":true,"invert":false,"criteria":{"good":{"gte":5000},"warn":{"gte":2000},"danger":{"lt":2000}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"avg_extraction_time_s","type":"kpi_tile","field":"avg_extraction_time_s","format":"seconds","header":"Avg. Extraction Time","footer":"Per form","delta_field":"avg_extraction_time_s_delta","delta_format":"absolute","trend":true,"invert":true,"criteria":{"good":{"lte":10},"warn":{"lte":25},"danger":{"gt":25}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}},
    {"id":"manual_corrections","type":"kpi_tile","field":"manual_corrections","format":"number","header":"Manual Corrections","footer":"Lower is better","delta_field":"manual_corrections_delta","delta_format":"absolute","trend":true,"invert":true,"criteria":{"good":{"lte":10},"warn":{"lte":30},"danger":{"gt":30}},"color_indicator":{"good":"#15803d","warn":"#d97706","danger":"#dc2626"}}
  ]',
  NULL
)
ON CONFLICT (id) DO NOTHING;
