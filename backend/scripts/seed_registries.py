"""Seed the `carriers` and `ams_targets` tables in the configured Supabase.

Idempotent — each row is upserted by primary key. Safe to re-run any time
the seed in `services.doc_retrieval.seed_data` changes.

Run from `backend/` with the venv active:
    python -m scripts.seed_registries

Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to point at the
target environment. The migration
`supabase/migrations/20260526100000_doc_retrieval_registry.sql` must have
already been applied (this script doesn't run DDL).
"""
from __future__ import annotations

import sys

from services.supabase import get_supabase
from services.doc_retrieval.seed_data import MOCK_AMS_TARGETS, MOCK_CARRIERS


def main() -> int:
    sb = get_supabase()

    carrier_payloads = [c.model_dump() for c in MOCK_CARRIERS]
    ams_payloads = [a.model_dump() for a in MOCK_AMS_TARGETS]

    sb.table("carriers").upsert(carrier_payloads, on_conflict="carrier_id").execute()
    print(f"upserted {len(carrier_payloads)} carriers")

    sb.table("ams_targets").upsert(ams_payloads, on_conflict="ams_target_id").execute()
    print(f"upserted {len(ams_payloads)} ams_targets")

    return 0


if __name__ == "__main__":
    sys.exit(main())
