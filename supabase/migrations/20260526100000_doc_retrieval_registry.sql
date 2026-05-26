-- Doc Retrieval registry: carriers, doc_retrieval_runs, ams_targets.
-- See Sprint-execution/Sagar/doc_retrieval.md "Data model (Page 3)" for the
-- design rationale; this migration creates the tables that doc-retrieval-v0
-- depends on (separate from `carrier_connections` which stores credentials).
--
-- The orchestrator reads `carriers` at run time to know HOW to drive a
-- carrier (login URL, selectors, MFA kind), reads `carrier_connections` for
-- the credentials (set globally by an admin), writes `doc_retrieval_runs`
-- rows for status tracking, and reads `ams_targets` for the destination AMS
-- connector kind / config when filing the result.

-- ── carriers — data-driven carrier registry (admin-managed) ───────────────────
CREATE TABLE IF NOT EXISTS public.carriers (
  carrier_id            TEXT        PRIMARY KEY,
  display_name          TEXT        NOT NULL,
  login_url             TEXT        NOT NULL,
  auth_kind             TEXT        NOT NULL DEFAULT 'password'
                        CHECK (auth_kind IN ('password','api_key')),
  mfa_kind              TEXT        NOT NULL DEFAULT 'totp_rfc6238'
                        CHECK (mfa_kind IN ('totp_rfc6238','captcha_bypass','email_link','email_otp','sms_otp','captcha_hil','none')),
  hil_timeout_seconds   INT         NOT NULL DEFAULT 120,
  listing_selector_spec JSONB       NOT NULL DEFAULT '{}',
  totp_secret_b32       TEXT,         -- mock seed; in prod this would be encrypted via DEK
  is_mock               BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carriers_active_idx ON public.carriers (is_active) WHERE is_active = TRUE;

ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carriers_service ON public.carriers;
CREATE POLICY carriers_service ON public.carriers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS carriers_updated_at ON public.carriers;
CREATE TRIGGER carriers_updated_at
  BEFORE UPDATE ON public.carriers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── doc_retrieval_runs — per-execution status row ────────────────────────────
CREATE TABLE IF NOT EXISTS public.doc_retrieval_runs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  carrier_id         TEXT        NOT NULL REFERENCES public.carriers(carrier_id),
  ams_target_id      TEXT,         -- nullable: filing is stubbed in v0
  attach_to          TEXT        NOT NULL DEFAULT 'unrouted'
                     CHECK (attach_to IN ('policy','activity','accounts','unrouted')),
  doc_type           TEXT        NOT NULL,
  policy_number      TEXT        NOT NULL,
  insured_name       TEXT        NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued','running','awaiting_mfa','completed','failed')),
  error              TEXT,
  error_kind         TEXT,         -- aligns with services/observability/errors.py
  retryable          BOOLEAN     NOT NULL DEFAULT FALSE,
  metadata           JSONB       NOT NULL DEFAULT '{}',  -- documents[], mfa_prompt, summary, …
  started_at         TIMESTAMPTZ,
  finished_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doc_retrieval_runs_user_id_idx ON public.doc_retrieval_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS doc_retrieval_runs_status_idx  ON public.doc_retrieval_runs (status);
CREATE INDEX IF NOT EXISTS doc_retrieval_runs_carrier_idx ON public.doc_retrieval_runs (carrier_id, created_at DESC);

ALTER TABLE public.doc_retrieval_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_retrieval_runs_service ON public.doc_retrieval_runs;
CREATE POLICY doc_retrieval_runs_service ON public.doc_retrieval_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS doc_retrieval_runs_updated_at ON public.doc_retrieval_runs;
CREATE TRIGGER doc_retrieval_runs_updated_at
  BEFORE UPDATE ON public.doc_retrieval_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── ams_targets — data-driven AMS connector registry (admin-managed) ─────────
-- Distinct from `ams_connections` (credentials). `ams_targets` is the catalog
-- the orchestrator picks from when filing; `ams_connections` is the secret.
CREATE TABLE IF NOT EXISTS public.ams_targets (
  ams_target_id    TEXT        PRIMARY KEY,
  display_name     TEXT        NOT NULL,
  connector_kind   TEXT        NOT NULL DEFAULT 'stub'
                   CHECK (connector_kind IN ('stub','applied_epic','hawksoft','ams360','qq_catalyst','ezlynx')),
  connector_config JSONB       NOT NULL DEFAULT '{}',
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ams_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ams_targets_service ON public.ams_targets;
CREATE POLICY ams_targets_service ON public.ams_targets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS ams_targets_updated_at ON public.ams_targets;
CREATE TRIGGER ams_targets_updated_at
  BEFORE UPDATE ON public.ams_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
