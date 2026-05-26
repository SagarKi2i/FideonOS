"""JSON file-backed implementation of the doc-retrieval registry. Selected
by `registry.py` when `settings.doc_retrieval_storage_backend == "json"`.

Backed by `backend/.run_store/registry.json`. Seeded from `_MOCK_CARRIERS`
on first boot so the orchestrator has something to run against in dev.

Use the public surface in `registry.py`; don't import this module directly.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from .models import AmsTarget, Carrier
from .seed_data import MOCK_AMS_TARGETS, MOCK_CARRIERS


_BASE_DIR = Path(__file__).resolve().parent.parent.parent
_STORE_PATH = _BASE_DIR / ".run_store" / "registry.json"
_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)

_lock = threading.Lock()

CANONICAL_DOC_TYPES: list[str] = [
    "policy_renewal", "cancellation", "endorsement", "memo",
    "invoice", "certificate", "deck_page", "loss_run",
]


def _load_raw() -> dict[str, Any]:
    if not _STORE_PATH.exists():
        return _seed()
    try:
        return json.loads(_STORE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return _seed()


def _seed() -> dict[str, Any]:
    state = {
        "carriers": [c.model_dump() for c in MOCK_CARRIERS],
        "ams_targets": [a.model_dump() for a in MOCK_AMS_TARGETS],
    }
    _STORE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")
    return state


def _save(state: dict[str, Any]) -> None:
    tmp = _STORE_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, indent=2), encoding="utf-8")
    tmp.replace(_STORE_PATH)


def reseed() -> None:
    with _lock:
        _seed()


def list_carriers() -> list[Carrier]:
    with _lock:
        return [Carrier(**c) for c in _load_raw()["carriers"]]


def get_carrier(carrier_id: str) -> Carrier | None:
    for c in list_carriers():
        if c.carrier_id == carrier_id:
            return c
    return None


def upsert_carrier(carrier: Carrier) -> Carrier:
    with _lock:
        state = _load_raw()
        idx = next((i for i, c in enumerate(state["carriers"]) if c["carrier_id"] == carrier.carrier_id), None)
        if idx is None:
            state["carriers"].append(carrier.model_dump())
        else:
            state["carriers"][idx] = carrier.model_dump()
        _save(state)
        return carrier


def delete_carrier(carrier_id: str) -> bool:
    with _lock:
        state = _load_raw()
        before = len(state["carriers"])
        state["carriers"] = [c for c in state["carriers"] if c["carrier_id"] != carrier_id]
        _save(state)
        return len(state["carriers"]) < before


def list_ams_targets() -> list[AmsTarget]:
    with _lock:
        return [AmsTarget(**a) for a in _load_raw()["ams_targets"]]


def get_ams_target(ams_target_id: str) -> AmsTarget | None:
    for a in list_ams_targets():
        if a.ams_target_id == ams_target_id:
            return a
    return None


def upsert_ams_target(target: AmsTarget) -> AmsTarget:
    with _lock:
        state = _load_raw()
        idx = next((i for i, a in enumerate(state["ams_targets"]) if a["ams_target_id"] == target.ams_target_id), None)
        if idx is None:
            state["ams_targets"].append(target.model_dump())
        else:
            state["ams_targets"][idx] = target.model_dump()
        _save(state)
        return target


def delete_ams_target(ams_target_id: str) -> bool:
    with _lock:
        state = _load_raw()
        before = len(state["ams_targets"])
        state["ams_targets"] = [a for a in state["ams_targets"] if a["ams_target_id"] != ams_target_id]
        _save(state)
        return len(state["ams_targets"]) < before


def list_doc_types() -> list[str]:
    return list(CANONICAL_DOC_TYPES)
