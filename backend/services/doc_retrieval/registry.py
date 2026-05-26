"""Doc-retrieval registry facade.

Picks backend at import based on `settings.doc_retrieval_storage_backend`:
- `"supabase"` → reads/writes the `carriers` + `ams_targets` tables
- `"json"`     → file-backed registry under `backend/.run_store/registry.json`

Callers should always `from services.doc_retrieval import registry` — never
import the underlying `_json_registry` / `_supabase_registry` modules
directly.
"""
from __future__ import annotations

from config import settings

if settings.doc_retrieval_storage_backend == "supabase":
    from ._supabase_registry import (  # noqa: F401
        CANONICAL_DOC_TYPES,
        delete_ams_target,
        delete_carrier,
        get_ams_target,
        get_carrier,
        list_ams_targets,
        list_carriers,
        list_doc_types,
        reseed,
        upsert_ams_target,
        upsert_carrier,
    )
else:
    from ._json_registry import (  # noqa: F401
        CANONICAL_DOC_TYPES,
        delete_ams_target,
        delete_carrier,
        get_ams_target,
        get_carrier,
        list_ams_targets,
        list_carriers,
        list_doc_types,
        reseed,
        upsert_ams_target,
        upsert_carrier,
    )

__all__ = [
    "CANONICAL_DOC_TYPES",
    "delete_ams_target",
    "delete_carrier",
    "get_ams_target",
    "get_carrier",
    "list_ams_targets",
    "list_carriers",
    "list_doc_types",
    "reseed",
    "upsert_ams_target",
    "upsert_carrier",
]
