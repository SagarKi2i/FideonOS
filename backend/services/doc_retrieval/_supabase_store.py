"""Supabase-backed implementation of the run store. Selected by `store.py`
when `settings.doc_retrieval_storage_backend == "supabase"`.

Reads/writes the `doc_retrieval_runs` table created by
`supabase/migrations/20260526100000_doc_retrieval_registry.sql`. Falls back
to the local FS for the per-run blob directory (Azure Blob handles persistent
storage in FNF-570; this directory is the local staging area before upload).
"""
from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from services.supabase import get_supabase

from .models import DocRetrievalRun, RunStatus


_BASE_DIR = Path(__file__).resolve().parent.parent.parent
_RUNS_DIR = _BASE_DIR / ".run_store" / "runs"
_RUNS_DIR.mkdir(parents=True, exist_ok=True)

_TABLE = "doc_retrieval_runs"

# Serialize updates so two concurrent set_status / merge_metadata calls don't
# clobber each other's writes. Coarse but correct for the v1 throughput.
_lock = threading.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt is not None else None


def _row_to_run(row: dict[str, Any]) -> DocRetrievalRun:
    """Coerce a PostgREST row dict into the typed `DocRetrievalRun`. PostgREST
    returns timestamps as ISO strings; pydantic parses them into datetimes."""
    return DocRetrievalRun.model_validate(row)


def run_blob_dir(run_id: str) -> Path:
    """Local staging dir for the downloaded PDFs. Survives until Azure Blob
    upload (FNF-570) replaces this with a blob URL."""
    d = _RUNS_DIR / run_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def create_run(*, user_id: str | None, carrier_id: str, ams_target_id: str | None,
               attach_to: str, doc_type: str, policy_number: str, insured_name: str) -> DocRetrievalRun:
    now = _now()
    run_id = str(uuid.uuid4())
    payload: dict[str, Any] = {
        "id": run_id,
        "user_id": user_id,
        "carrier_id": carrier_id,
        "ams_target_id": ams_target_id,
        "attach_to": attach_to,
        "doc_type": doc_type,
        "policy_number": policy_number,
        "insured_name": insured_name,
        "status": "queued",
        "metadata": {},
        "created_at": _iso(now),
        "updated_at": _iso(now),
    }
    sb = get_supabase()
    result = sb.table(_TABLE).insert(payload).execute()
    if not result.data:
        # Some PostgREST configs return no body on insert; fetch back instead.
        return get_run(run_id) or _row_to_run(payload)
    return _row_to_run(result.data[0])


def get_run(run_id: str) -> DocRetrievalRun | None:
    sb = get_supabase()
    resp = sb.table(_TABLE).select("*").eq("id", run_id).maybe_single().execute()
    if not getattr(resp, "data", None):
        return None
    return _row_to_run(resp.data)


def list_runs(user_id: str | None = None, limit: int = 50) -> list[DocRetrievalRun]:
    sb = get_supabase()
    q = sb.table(_TABLE).select("*").order("created_at", desc=True).limit(limit)
    if user_id is not None:
        q = q.eq("user_id", user_id)
    resp = q.execute()
    rows = getattr(resp, "data", None) or []
    return [_row_to_run(r) for r in rows]


def update_run(run_id: str, **fields: Any) -> DocRetrievalRun | None:
    """Patch a run row with the given fields. Always bumps `updated_at`.
    Datetime values are ISO-encoded for transport."""
    patch: dict[str, Any] = {}
    for k, v in fields.items():
        patch[k] = _iso(v) if isinstance(v, datetime) else v
    patch["updated_at"] = _iso(_now())
    sb = get_supabase()
    with _lock:
        resp = sb.table(_TABLE).update(patch).eq("id", run_id).execute()
        rows = getattr(resp, "data", None) or []
        if not rows:
            # Update returned no row → either the row is gone, or PostgREST is
            # set to `return=minimal`. Fall back to a SELECT.
            return get_run(run_id)
        return _row_to_run(rows[0])


def set_status(run_id: str, status: RunStatus, *, error: str | None = None,
               error_kind: str | None = None, retryable: bool | None = None) -> DocRetrievalRun | None:
    patch: dict[str, Any] = {"status": status}
    if status == "running" and (run := get_run(run_id)) and run.started_at is None:
        patch["started_at"] = _iso(_now())
    if status in {"completed", "failed"}:
        patch["finished_at"] = _iso(_now())
    if error is not None:
        patch["error"] = error
    if error_kind is not None:
        patch["error_kind"] = error_kind
    if retryable is not None:
        patch["retryable"] = retryable
    return update_run(run_id, **patch)


def merge_metadata(run_id: str, **fields: Any) -> DocRetrievalRun | None:
    """Shallow-merge `fields` into the existing `metadata` JSONB column. Reads
    the current value then writes the union — fine for v1 throughput, but a
    proper jsonb_set RPC would avoid the read-modify-write race."""
    with _lock:
        run = get_run(run_id)
        if not run:
            return None
        meta = dict(run.metadata)
        meta.update(fields)
        return update_run(run_id, metadata=meta)
