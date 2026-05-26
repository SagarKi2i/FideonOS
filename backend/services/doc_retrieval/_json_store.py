"""JSON file-backed implementation of the run store. Selected by
`store.py` when `settings.doc_retrieval_storage_backend == "json"`.

Each run is one JSON file under `backend/.run_store/runs/{run_id}.json`.
Threadsafe via a process-wide lock. Downloaded PDFs land in
`backend/.run_store/runs/{run_id}/`.

Use the public surface in `store.py`; don't import this module directly.
"""
from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .models import DocRetrievalRun, RunStatus


_BASE_DIR = Path(__file__).resolve().parent.parent.parent
_RUNS_DIR = _BASE_DIR / ".run_store" / "runs"
_RUNS_DIR.mkdir(parents=True, exist_ok=True)

_lock = threading.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _path(run_id: str) -> Path:
    return _RUNS_DIR / f"{run_id}.json"


def _write(run: DocRetrievalRun) -> None:
    p = _path(run.id)
    tmp = p.with_suffix(".json.tmp")
    tmp.write_text(run.model_dump_json(indent=2), encoding="utf-8")
    tmp.replace(p)


def run_blob_dir(run_id: str) -> Path:
    """Directory for downloaded PDFs for this run. Created on demand."""
    d = _RUNS_DIR / run_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def create_run(*, user_id: str | None, carrier_id: str, ams_target_id: str | None,
               attach_to: str, doc_type: str, policy_number: str, insured_name: str) -> DocRetrievalRun:
    now = _now()
    run = DocRetrievalRun(
        id=str(uuid.uuid4()),
        user_id=user_id,
        carrier_id=carrier_id,
        ams_target_id=ams_target_id,
        attach_to=attach_to,  # type: ignore[arg-type]
        doc_type=doc_type,
        policy_number=policy_number,
        insured_name=insured_name,
        status="queued",
        created_at=now,
        updated_at=now,
    )
    with _lock:
        _write(run)
    return run


def get_run(run_id: str) -> DocRetrievalRun | None:
    p = _path(run_id)
    if not p.exists():
        return None
    return DocRetrievalRun.model_validate_json(p.read_text(encoding="utf-8"))


def list_runs(user_id: str | None = None, limit: int = 50) -> list[DocRetrievalRun]:
    runs: list[DocRetrievalRun] = []
    with _lock:
        for p in sorted(_RUNS_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
            try:
                run = DocRetrievalRun.model_validate_json(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            if user_id is None or run.user_id == user_id:
                runs.append(run)
                if len(runs) >= limit:
                    break
    return runs


def update_run(run_id: str, **fields) -> DocRetrievalRun | None:
    """Patch a run row with the given fields. Always bumps `updated_at`."""
    with _lock:
        run = get_run(run_id)
        if not run:
            return None
        data = run.model_dump()
        data.update(fields)
        data["updated_at"] = _now()
        updated = DocRetrievalRun.model_validate(data)
        _write(updated)
        return updated


def set_status(run_id: str, status: RunStatus, *, error: str | None = None,
               error_kind: str | None = None, retryable: bool | None = None) -> DocRetrievalRun | None:
    patch: dict = {"status": status}
    if status == "running" and (run := get_run(run_id)) and run.started_at is None:
        patch["started_at"] = _now()
    if status in {"completed", "failed"}:
        patch["finished_at"] = _now()
    if error is not None:
        patch["error"] = error
    if error_kind is not None:
        patch["error_kind"] = error_kind
    if retryable is not None:
        patch["retryable"] = retryable
    return update_run(run_id, **patch)


def merge_metadata(run_id: str, **fields) -> DocRetrievalRun | None:
    with _lock:
        run = get_run(run_id)
        if not run:
            return None
        meta = dict(run.metadata)
        meta.update(fields)
        return update_run(run_id, metadata=meta)
