"""Doc Retrieval pod backend services.

Public entry points (used by routers/agents.py):
    - registry.list_carriers, get_carrier, upsert_carrier, delete_carrier
    - registry.list_ams_targets, get_ams_target, upsert_ams_target, delete_ams_target
    - registry.list_doc_types
    - store.create_run, get_run, list_runs
    - orchestrator.queue_run  → returns run_id, kicks off the background pipeline
    - hil_registry.submit_mfa_response

Architecture reference: Sprint-execution/Sagar/doc_retrieval.md
"""
from . import registry, store, orchestrator, hil_registry  # noqa: F401
