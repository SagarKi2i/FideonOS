-- Doc Retrieval seed data: 10 mock carriers + 5 AMS targets.
--
-- Source of truth lives in
--   backend/services/doc_retrieval/seed_data.py
-- and is mirrored here so the db-migrate.yml CI pipeline seeds dev / staging
-- automatically — no manual `python -m scripts.seed_registries` step required.
-- Production should NOT be seeded with mock_* rows; gate the apply step there.
--
-- All inserts are upserts on the primary key, so re-running is safe. Edits to
-- listing_selector_spec, login_url, etc. propagate on the next apply.
--
-- IDs are 1:1 with the 10 tiles in
--   frontend/components/playground/DocumentRetrievalUI.tsx
-- and the TOTP seeds match mock_carriers/shared/data.py:TOTP_SEEDS.

-- ── carriers ─────────────────────────────────────────────────────────────────

INSERT INTO public.carriers (
  carrier_id, display_name, login_url, auth_kind, mfa_kind,
  hil_timeout_seconds, listing_selector_spec, totp_secret_b32, is_mock, is_active
) VALUES
-- 7 totp_rfc6238 carriers (auto-solvable in tests)
(
  'mock_travelers', 'Travelers', 'http://127.0.0.1:8001/login', 'password', 'totp_rfc6238', 120,
  '{
    "login_username":   "[data-testid=\"login-username\"]",
    "login_password":   "[data-testid=\"login-password\"]",
    "login_submit":     "[data-testid=\"login-submit\"]",
    "mfa_totp_code":    "[data-testid=\"mfa-totp-code\"]",
    "mfa_email_code":   "[data-testid=\"mfa-email-otp-code\"]",
    "mfa_captcha_code": "[data-testid=\"mfa-captcha-code\"]",
    "mfa_captcha_csrf": "[data-testid=\"captcha-csrf\"]",
    "mfa_submit":       "[data-testid=\"mfa-submit\"]",
    "captcha_image":    "[data-testid=\"captcha-image\"]",
    "doc_row":          "[data-testid=\"doc-row\"]",
    "doc_policy":       "[data-testid=\"doc-policy\"]",
    "doc_insured":      "[data-testid=\"doc-insured\"]",
    "doc_type":         "[data-testid=\"doc-type\"]",
    "doc_download":     "[data-testid=\"doc-download\"]"
  }'::jsonb,
  'JBSWY3DPEHPK3PXP', TRUE, TRUE
),
(
  'mock_chubb', 'Chubb', 'http://127.0.0.1:8003/login', 'password', 'totp_rfc6238', 120,
  '{
    "login_username":   "[data-testid=\"login-username\"]",
    "login_password":   "[data-testid=\"login-password\"]",
    "login_submit":     "[data-testid=\"login-submit\"]",
    "mfa_totp_code":    "[data-testid=\"mfa-totp-code\"]",
    "mfa_email_code":   "[data-testid=\"mfa-email-otp-code\"]",
    "mfa_captcha_code": "[data-testid=\"mfa-captcha-code\"]",
    "mfa_captcha_csrf": "[data-testid=\"captcha-csrf\"]",
    "mfa_submit":       "[data-testid=\"mfa-submit\"]",
    "captcha_image":    "[data-testid=\"captcha-image\"]",
    "doc_row":          "[aria-label=\"document-row\"]",
    "doc_policy":       "[aria-label=\"policy\"]",
    "doc_insured":      "[aria-label=\"insured\"]",
    "doc_type":         "[aria-label=\"doc-type\"]",
    "doc_download":     "[aria-label=\"download\"]"
  }'::jsonb,
  'KRSXG5BAONUWG2DG', TRUE, TRUE
),
(
  'mock_progressive', 'Progressive', 'http://127.0.0.1:8006/login', 'password', 'totp_rfc6238', 120,
  '{
    "login_username":   "[data-testid=\"login-username\"]",
    "login_password":   "[data-testid=\"login-password\"]",
    "login_submit":     "[data-testid=\"login-submit\"]",
    "mfa_totp_code":    "[data-testid=\"mfa-totp-code\"]",
    "mfa_email_code":   "[data-testid=\"mfa-email-otp-code\"]",
    "mfa_captcha_code": "[data-testid=\"mfa-captcha-code\"]",
    "mfa_captcha_csrf": "[data-testid=\"captcha-csrf\"]",
    "mfa_submit":       "[data-testid=\"mfa-submit\"]",
    "captcha_image":    "[data-testid=\"captcha-image\"]",
    "doc_row":          "[data-testid=\"doc-row\"]",
    "doc_policy":       "[data-testid=\"doc-policy\"]",
    "doc_insured":      "[data-testid=\"doc-insured\"]",
    "doc_type":         "[data-testid=\"doc-type\"]",
    "doc_download":     "[data-testid=\"doc-download\"]",
    "next_page":        "[data-testid=\"docs-next-page\"]",
    "max_pages":        5
  }'::jsonb,
  'MFRGGZDFMZTWQ2LK', TRUE, TRUE
),
(
  'mock_amtrust', 'AmTrust', 'http://127.0.0.1:8007/login', 'password', 'totp_rfc6238', 120,
  '{
    "login_username":   "[data-testid=\"login-username\"]",
    "login_password":   "[data-testid=\"login-password\"]",
    "login_submit":     "[data-testid=\"login-submit\"]",
    "mfa_totp_code":    "[data-testid=\"mfa-totp-code\"]",
    "mfa_email_code":   "[data-testid=\"mfa-email-otp-code\"]",
    "mfa_captcha_code": "[data-testid=\"mfa-captcha-code\"]",
    "mfa_captcha_csrf": "[data-testid=\"captcha-csrf\"]",
    "mfa_submit":       "[data-testid=\"mfa-submit\"]",
    "captcha_image":    "[data-testid=\"captcha-image\"]",
    "doc_row":          "[data-testid=\"doc-row\"]",
    "doc_policy":       "[data-testid=\"doc-policy\"]",
    "doc_insured":      "[data-testid=\"doc-insured\"]",
    "doc_type":         "[data-testid=\"doc-type\"]",
    "doc_download":     "[data-testid=\"doc-download\"]"
  }'::jsonb,
  'NBSWY3DPEB3W64TM', TRUE, TRUE
),
(
  'mock_markel', 'Markel', 'http://127.0.0.1:8008/login', 'password', 'totp_rfc6238', 120,
  '{
    "login_username":   "[data-testid=\"login-username\"]",
    "login_password":   "[data-testid=\"login-password\"]",
    "login_submit":     "[data-testid=\"login-submit\"]",
    "mfa_totp_code":    "[data-testid=\"mfa-totp-code\"]",
    "mfa_email_code":   "[data-testid=\"mfa-email-otp-code\"]",
    "mfa_captcha_code": "[data-testid=\"mfa-captcha-code\"]",
    "mfa_captcha_csrf": "[data-testid=\"captcha-csrf\"]",
    "mfa_submit":       "[data-testid=\"mfa-submit\"]",
    "captcha_image":    "[data-testid=\"captcha-image\"]",
    "doc_row":          "[data-testid=\"doc-row\"]",
    "doc_policy":       "[data-testid=\"doc-policy\"]",
    "doc_insured":      "[data-testid=\"doc-insured\"]",
    "doc_type":         "[data-testid=\"doc-type\"]",
    "doc_download":     "[data-testid=\"doc-download\"]"
  }'::jsonb,
  'ORSXG5BANBSWY3DP', TRUE, TRUE
),
(
  'mock_berkshire', 'Berkshire', 'http://127.0.0.1:8009/login', 'password', 'totp_rfc6238', 120,
  '{
    "login_username":   "[data-testid=\"login-username\"]",
    "login_password":   "[data-testid=\"login-password\"]",
    "login_submit":     "[data-testid=\"login-submit\"]",
    "mfa_totp_code":    "[data-testid=\"mfa-totp-code\"]",
    "mfa_email_code":   "[data-testid=\"mfa-email-otp-code\"]",
    "mfa_captcha_code": "[data-testid=\"mfa-captcha-code\"]",
    "mfa_captcha_csrf": "[data-testid=\"captcha-csrf\"]",
    "mfa_submit":       "[data-testid=\"mfa-submit\"]",
    "captcha_image":    "[data-testid=\"captcha-image\"]",
    "doc_row":          "[data-testid=\"doc-row\"]",
    "doc_policy":       "[data-testid=\"doc-policy\"]",
    "doc_insured":      "[data-testid=\"doc-insured\"]",
    "doc_type":         "[data-testid=\"doc-type\"]",
    "doc_download":     "[data-testid=\"doc-download\"]"
  }'::jsonb,
  'PBSWY3DPEB3W64TM', TRUE, TRUE
),
(
  'mock_zurich', 'Zurich', 'http://127.0.0.1:8010/login', 'password', 'totp_rfc6238', 120,
  '{
    "login_username":   "[data-testid=\"login-username\"]",
    "login_password":   "[data-testid=\"login-password\"]",
    "login_submit":     "[data-testid=\"login-submit\"]",
    "mfa_totp_code":    "[data-testid=\"mfa-totp-code\"]",
    "mfa_email_code":   "[data-testid=\"mfa-email-otp-code\"]",
    "mfa_captcha_code": "[data-testid=\"mfa-captcha-code\"]",
    "mfa_captcha_csrf": "[data-testid=\"captcha-csrf\"]",
    "mfa_submit":       "[data-testid=\"mfa-submit\"]",
    "captcha_image":    "[data-testid=\"captcha-image\"]",
    "doc_row":          "[data-testid=\"doc-row\"]",
    "doc_policy":       "[data-testid=\"doc-policy\"]",
    "doc_insured":      "[data-testid=\"doc-insured\"]",
    "doc_type":         "[data-testid=\"doc-type\"]",
    "doc_download":     "[data-testid=\"doc-download\"]"
  }'::jsonb,
  'QFRGGZDFMZTWQ2LK', TRUE, TRUE
),
-- 1 email_otp carrier (HIL — column-style legacy table)
(
  'mock_hartford', 'The Hartford', 'http://127.0.0.1:8002/login', 'password', 'email_otp', 120,
  '{
    "login_username":   "[data-testid=\"login-username\"]",
    "login_password":   "[data-testid=\"login-password\"]",
    "login_submit":     "[data-testid=\"login-submit\"]",
    "mfa_totp_code":    "[data-testid=\"mfa-totp-code\"]",
    "mfa_email_code":   "[data-testid=\"mfa-email-otp-code\"]",
    "mfa_captcha_code": "[data-testid=\"mfa-captcha-code\"]",
    "mfa_captcha_csrf": "[data-testid=\"captcha-csrf\"]",
    "mfa_submit":       "[data-testid=\"mfa-submit\"]",
    "captcha_image":    "[data-testid=\"captcha-image\"]",
    "doc_table":        "#docs",
    "doc_policy_col":   0,
    "doc_insured_col":  1,
    "doc_type_col":     2,
    "doc_issued_col":   3,
    "doc_download_col": 4
  }'::jsonb,
  NULL, TRUE, TRUE
),
-- 1 email_link carrier (HIL — content in iframe)
(
  'mock_liberty', 'Liberty Mutual', 'http://127.0.0.1:8004/login', 'password', 'email_link', 120,
  '{
    "login_username":   "[data-testid=\"login-username\"]",
    "login_password":   "[data-testid=\"login-password\"]",
    "login_submit":     "[data-testid=\"login-submit\"]",
    "mfa_totp_code":    "[data-testid=\"mfa-totp-code\"]",
    "mfa_email_code":   "[data-testid=\"mfa-email-otp-code\"]",
    "mfa_captcha_code": "[data-testid=\"mfa-captcha-code\"]",
    "mfa_captcha_csrf": "[data-testid=\"captcha-csrf\"]",
    "mfa_submit":       "[data-testid=\"mfa-submit\"]",
    "captcha_image":    "[data-testid=\"captcha-image\"]",
    "iframe_selector":  "[data-testid=\"docs-iframe\"]",
    "doc_row":          "[data-testid=\"doc-row\"]",
    "doc_policy":       "[data-testid=\"doc-policy\"]",
    "doc_insured":      "[data-testid=\"doc-insured\"]",
    "doc_type":         "[data-testid=\"doc-type\"]",
    "doc_download":     "[data-testid=\"doc-download\"]"
  }'::jsonb,
  NULL, TRUE, TRUE
),
-- 1 captcha_hil carrier
(
  'mock_nationwide', 'Nationwide', 'http://127.0.0.1:8005/login', 'password', 'captcha_hil', 120,
  '{
    "login_username":   "[data-testid=\"login-username\"]",
    "login_password":   "[data-testid=\"login-password\"]",
    "login_submit":     "[data-testid=\"login-submit\"]",
    "mfa_totp_code":    "[data-testid=\"mfa-totp-code\"]",
    "mfa_email_code":   "[data-testid=\"mfa-email-otp-code\"]",
    "mfa_captcha_code": "[data-testid=\"mfa-captcha-code\"]",
    "mfa_captcha_csrf": "[data-testid=\"captcha-csrf\"]",
    "mfa_submit":       "[data-testid=\"mfa-submit\"]",
    "captcha_image":    "[data-testid=\"captcha-image\"]",
    "doc_row":          "[data-testid=\"doc-row\"]",
    "doc_policy":       "[data-testid=\"doc-policy\"]",
    "doc_insured":      "[data-testid=\"doc-insured\"]",
    "doc_type":         "[data-testid=\"doc-type\"]",
    "doc_download":     "[data-testid=\"doc-download\"]"
  }'::jsonb,
  NULL, TRUE, TRUE
)
ON CONFLICT (carrier_id) DO UPDATE SET
  display_name          = EXCLUDED.display_name,
  login_url             = EXCLUDED.login_url,
  auth_kind             = EXCLUDED.auth_kind,
  mfa_kind              = EXCLUDED.mfa_kind,
  hil_timeout_seconds   = EXCLUDED.hil_timeout_seconds,
  listing_selector_spec = EXCLUDED.listing_selector_spec,
  totp_secret_b32       = EXCLUDED.totp_secret_b32,
  is_mock               = EXCLUDED.is_mock,
  is_active             = EXCLUDED.is_active,
  updated_at            = now();

-- ── ams_targets ──────────────────────────────────────────────────────────────

INSERT INTO public.ams_targets (
  ams_target_id, display_name, connector_kind, connector_config, is_active
) VALUES
  ('applied-epic', 'Applied Epic', 'stub', '{}'::jsonb, TRUE),
  ('hawksoft',     'HawkSoft',     'stub', '{}'::jsonb, TRUE),
  ('ams360',       'AMS 360',      'stub', '{}'::jsonb, TRUE),
  ('qq-catalyst',  'QQ Catalyst',  'stub', '{}'::jsonb, TRUE),
  ('ezlynx',       'EZLynx',       'stub', '{}'::jsonb, TRUE)
ON CONFLICT (ams_target_id) DO UPDATE SET
  display_name     = EXCLUDED.display_name,
  connector_kind   = EXCLUDED.connector_kind,
  connector_config = EXCLUDED.connector_config,
  is_active        = EXCLUDED.is_active,
  updated_at       = now();
