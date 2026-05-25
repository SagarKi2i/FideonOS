-- public.carrier_connections + public.ams_connections — Group 3 Integrations.
-- Authoritative schema base: backend/docs/pod_structure.md §3 Group 3.
-- Created BEFORE 20260522020900_migrate_carrier_connections.sql.
-- Credentials are stored as *_ciphertext (encrypted at the app layer); never plaintext.
--
-- GLOBAL / ADMIN-MANAGED: credentials are set ONCE by an admin and apply to ALL users
-- automatically. There is exactly one row per carrier_id / ams_id (no per-user rows).
-- `set_by` records which admin configured it.

-- ── carrier_connections — carrier portal credentials (global, admin-set) ──────
CREATE TABLE IF NOT EXISTS public.carrier_connections (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id          TEXT        NOT NULL UNIQUE,   -- one global row per carrier
  set_by              UUID        REFERENCES public.users(id) ON DELETE SET NULL,  -- admin who set it
  username            TEXT,
  password_ciphertext TEXT,
  credential_token    TEXT,
  producer_codes      JSONB,
  extra               JSONB       NOT NULL DEFAULT '{}',   -- { portal_url, doc_types, sources, email_alias }
  status              TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','connected','error')),
  last_test_at        TIMESTAMPTZ,
  last_test_message   TEXT,
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.carrier_connections ENABLE ROW LEVEL SECURITY;
-- service_role only; user scoping enforced in FastAPI (custom RS256 auth, no auth.uid()).
DROP POLICY IF EXISTS carrier_connections_service ON public.carrier_connections;
CREATE POLICY carrier_connections_service ON public.carrier_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER carrier_connections_updated_at
  BEFORE UPDATE ON public.carrier_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── ams_connections — AMS credentials (global, admin-set) ─────────────────────
CREATE TABLE IF NOT EXISTS public.ams_connections (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ams_id              TEXT        NOT NULL UNIQUE,   -- one global row per AMS
  set_by              UUID        REFERENCES public.users(id) ON DELETE SET NULL,  -- admin who set it
  auth_method         TEXT        NOT NULL DEFAULT 'credentials'
                      CHECK (auth_method IN ('credentials','sdk')),
  username            TEXT,
  password_ciphertext TEXT,
  api_key_ciphertext  TEXT,
  instance_url        TEXT,
  tenant_id           TEXT,
  credential_token    TEXT,
  extra               JSONB       NOT NULL DEFAULT '{}',   -- { db_name_sandbox, db_name_prod }
  status              TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','connected','error')),
  last_test_at        TIMESTAMPTZ,
  last_test_message   TEXT,
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ams_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ams_connections_service ON public.ams_connections;
CREATE POLICY ams_connections_service ON public.ams_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER ams_connections_updated_at
  BEFORE UPDATE ON public.ams_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
