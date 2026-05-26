"""Supabase-backed implementation of the doc-retrieval registry. Selected
by `registry.py` when `settings.doc_retrieval_storage_backend == "supabase"`.

Reads/writes the `carriers` and `ams_targets` tables created by
`supabase/migrations/20260526100000_doc_retrieval_registry.sql`. Initial
seed data lives in `seed_data.py` and is applied via
`backend/scripts/seed_registries.py`.

Use the public surface in `registry.py`; don't import this module directly.
"""
from __future__ import annotations

from typing import Any

from services.supabase import get_supabase

from .models import AmsTarget, Carrier


_CARRIERS_TABLE = "carriers"
_AMS_TARGETS_TABLE = "ams_targets"

CANONICAL_DOC_TYPES: list[str] = [
    "policy_renewal", "cancellation", "endorsement", "memo",
    "invoice", "certificate", "deck_page", "loss_run",
]


# ─── carriers ────────────────────────────────────────────────────────────────

def list_carriers() -> list[Carrier]:
    sb = get_supabase()
    resp = sb.table(_CARRIERS_TABLE).select("*").order("display_name").execute()
    rows: list[dict[str, Any]] = getattr(resp, "data", None) or []
    return [Carrier.model_validate(r) for r in rows]


def get_carrier(carrier_id: str) -> Carrier | None:
    sb = get_supabase()
    resp = sb.table(_CARRIERS_TABLE).select("*").eq("carrier_id", carrier_id).maybe_single().execute()
    if not getattr(resp, "data", None):
        return None
    return Carrier.model_validate(resp.data)


def upsert_carrier(carrier: Carrier) -> Carrier:
    sb = get_supabase()
    payload = carrier.model_dump()
    resp = sb.table(_CARRIERS_TABLE).upsert(payload, on_conflict="carrier_id").execute()
    rows: list[dict[str, Any]] = getattr(resp, "data", None) or [payload]
    return Carrier.model_validate(rows[0])


def delete_carrier(carrier_id: str) -> bool:
    sb = get_supabase()
    resp = sb.table(_CARRIERS_TABLE).delete().eq("carrier_id", carrier_id).execute()
    return bool(getattr(resp, "data", None))


# ─── AMS targets ─────────────────────────────────────────────────────────────

def list_ams_targets() -> list[AmsTarget]:
    sb = get_supabase()
    resp = sb.table(_AMS_TARGETS_TABLE).select("*").order("display_name").execute()
    rows: list[dict[str, Any]] = getattr(resp, "data", None) or []
    return [AmsTarget.model_validate(r) for r in rows]


def get_ams_target(ams_target_id: str) -> AmsTarget | None:
    sb = get_supabase()
    resp = sb.table(_AMS_TARGETS_TABLE).select("*").eq("ams_target_id", ams_target_id).maybe_single().execute()
    if not getattr(resp, "data", None):
        return None
    return AmsTarget.model_validate(resp.data)


def upsert_ams_target(target: AmsTarget) -> AmsTarget:
    sb = get_supabase()
    payload = target.model_dump()
    resp = sb.table(_AMS_TARGETS_TABLE).upsert(payload, on_conflict="ams_target_id").execute()
    rows: list[dict[str, Any]] = getattr(resp, "data", None) or [payload]
    return AmsTarget.model_validate(rows[0])


def delete_ams_target(ams_target_id: str) -> bool:
    sb = get_supabase()
    resp = sb.table(_AMS_TARGETS_TABLE).delete().eq("ams_target_id", ams_target_id).execute()
    return bool(getattr(resp, "data", None))


def list_doc_types() -> list[str]:
    return list(CANONICAL_DOC_TYPES)


def reseed() -> None:
    """No-op for the Supabase backend; seeding is an explicit script. See
    `backend/scripts/seed_registries.py`."""
    return None
