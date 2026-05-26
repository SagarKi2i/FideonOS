"""Doc-retrieval run store facade.

Picks backend at import based on `settings.doc_retrieval_storage_backend`:
- `"supabase"` → reads/writes the `doc_retrieval_runs` table via PostgREST
- `"json"`     → file-backed JSON under `backend/.run_store/runs/`

Callers should always `from services.doc_retrieval import store` — never
import the underlying `_json_store` / `_supabase_store` modules directly.
"""
from __future__ import annotations

from config import settings

if settings.doc_retrieval_storage_backend == "supabase":
    from ._supabase_store import (  # noqa: F401
        create_run,
        get_run,
        list_runs,
        merge_metadata,
        run_blob_dir,
        set_status,
        update_run,
    )
else:
    from ._json_store import (  # noqa: F401
        create_run,
        get_run,
        list_runs,
        merge_metadata,
        run_blob_dir,
        set_status,
        update_run,
    )

__all__ = [
    "create_run",
    "get_run",
    "list_runs",
    "merge_metadata",
    "run_blob_dir",
    "set_status",
    "update_run",
]
