"""Doc Retrieval orchestrator — runs one carrier end-to-end and updates the
run row at each step.

Pipeline (matches the 6-step diagram in Sprint-execution/Sagar/doc_retrieval.md):
    1. Authenticate
    2. List + Filter   (collapsed into the adapter's scrape pass)
    3. Download
    4. Classify + Validate   (handled inside the adapter for v1)
    5. File in AMS    (stub)
    6. Finalize       (status update + summary)

For HIL MFA: the adapter calls back into `_on_mfa_required` which parks the
session, sets `status=awaiting_mfa`, emits the prompt event, and waits on the
resume event. UI POSTs to /mfa-response which routes back here.
"""
from __future__ import annotations

import asyncio
import threading

import structlog

from services.observability import events, errors

from . import hil_registry, registry, store
from .hil_registry import ParkedSession
from .mfa_playwright import HilPending
from .models import Carrier, DocRetrievalRun, MfaPrompt, RunRequest
from .playwright_adapter import UserInputs, run_adapter


log = structlog.get_logger("doc_retrieval.orchestrator")


def queue_run(request: RunRequest, user_id: str | None) -> DocRetrievalRun:
    """Public entry: enqueue a run and kick off the background task. Returns
    the queued run row immediately."""
    run = store.create_run(
        user_id=user_id,
        carrier_id=request.carrier_id,
        ams_target_id=request.ams_target_id,
        attach_to=request.attach_to,
        doc_type=request.doc_type,
        policy_number=request.policy_number,
        insured_name=request.insured_name,
    )
    events.emit(events.Event(
        name="doc_retrieval.run.queued",
        run_id=run.id,
        user_id=run.user_id,
        carrier_id=run.carrier_id,
        payload={"doc_type": run.doc_type, "policy_number": run.policy_number},
    ))
    # Run the pipeline in a dedicated worker thread with its OWN asyncio loop.
    # Why not asyncio.create_task on the HTTP loop?
    #   1. Playwright spawns chromium via asyncio.create_subprocess_exec — on
    #      Windows that needs ProactorEventLoop, which uvicorn does pick, but
    #      mixing long-running Playwright work with HTTP traffic on the same
    #      loop has empirically hung the HTTP loop on Windows.
    #   2. Isolating the run loop also means a stuck Playwright session can't
    #      starve other HTTP requests.
    threading.Thread(target=_run_in_worker_loop, args=(run.id,), daemon=True).start()
    return run


def _run_in_worker_loop(run_id: str) -> None:
    """Thread entrypoint. Uses `asyncio.run` so the loop's lifecycle is owned
    by the runtime — avoids subtle hand-rolled loop bugs. On Windows the
    process-wide policy is ProactorEventLoopPolicy (set in run_server.py), so
    `asyncio.run` creates a ProactorEventLoop here."""
    log_ctx = log.bind(run_id=run_id, component="worker_thread")
    log_ctx.debug("worker_thread.start")
    try:
        asyncio.run(_execute_run(run_id))
        log_ctx.debug("worker_thread.returned")
    except Exception:
        log_ctx.exception("worker_thread.crash")


async def _execute_run(run_id: str) -> None:
    log_ctx = log.bind(run_id=run_id)
    log_ctx.debug("execute_run.enter")
    run = store.get_run(run_id)
    if run is None:
        log_ctx.warning("execute_run.run_not_found")
        return

    log_ctx = log_ctx.bind(carrier_id=run.carrier_id, user_id=run.user_id)
    carrier = registry.get_carrier(run.carrier_id)
    if carrier is None:
        log_ctx.warning("execute_run.unknown_carrier")
        store.set_status(run_id, "failed", error=f"Unknown carrier {run.carrier_id}",
                         error_kind="user_action_required", retryable=False)
        events.emit(events.Event(
            name="doc_retrieval.run.failed",
            run_id=run.id, user_id=run.user_id, carrier_id=run.carrier_id,
            payload={"reason": "unknown_carrier"},
        ))
        return

    if not carrier.is_active:
        log_ctx.warning("execute_run.carrier_inactive")
        store.set_status(run_id, "failed", error="Carrier is inactive",
                         error_kind="user_action_required", retryable=False)
        return

    store.set_status(run_id, "running")
    events.emit(events.Event(
        name="doc_retrieval.run.started",
        run_id=run.id, user_id=run.user_id, carrier_id=run.carrier_id,
        payload={},
    ))
    download_dir = store.run_blob_dir(run.id)
    log_ctx.debug("execute_run.adapter_invoke")
    try:
        docs = await run_adapter(
            carrier=carrier,
            user_inputs=UserInputs(
                doc_type=run.doc_type,
                policy_number=run.policy_number,
                insured_name=run.insured_name,
            ),
            download_dir=download_dir,
            run_id=run.id,
            on_mfa_required=_make_hil_callback(run, carrier),
        )
    except errors.DocRetrievalError as exc:
        log_ctx.warning("execute_run.failed", error_kind=exc.kind, retryable=exc.retryable, error=str(exc))
        store.set_status(run_id, "failed", error=str(exc),
                         error_kind=exc.kind, retryable=exc.retryable)
        events.emit(events.Event(
            name="doc_retrieval.run.failed",
            run_id=run.id, user_id=run.user_id, carrier_id=run.carrier_id,
            payload={"reason": exc.kind, "message": exc.user_message},
        ))
        return
    except Exception as exc:  # pragma: no cover — last-line safety net
        log_ctx.exception("execute_run.crashed")
        store.set_status(run_id, "failed", error=str(exc),
                         error_kind="fatal", retryable=False)
        events.emit(events.Event(
            name="doc_retrieval.run.failed",
            run_id=run.id, user_id=run.user_id, carrier_id=run.carrier_id,
            payload={"reason": "fatal", "message": str(exc)},
        ))
        return

    summary = _summarise(docs, run)
    store.merge_metadata(run_id, documents=[d.model_dump() for d in docs], summary=summary)
    store.set_status(run_id, "completed")
    events.emit(events.Event(
        name="doc_retrieval.run.completed",
        run_id=run.id, user_id=run.user_id, carrier_id=run.carrier_id,
        payload={"document_count": len(docs)},
    ))


def _make_hil_callback(run: DocRetrievalRun, carrier: Carrier):
    """Returns the async callback the adapter calls on HIL. Parks the session,
    sets awaiting_mfa, emits the prompt, waits with a timeout, returns the
    response."""

    async def _callback(pending: HilPending, client) -> str:
        prompt: MfaPrompt = pending.prompt
        store.merge_metadata(run.id, mfa_prompt=prompt.model_dump())
        store.set_status(run.id, "awaiting_mfa")
        events.emit(events.Event(
            name="doc_retrieval.run.mfa_required",
            run_id=run.id, user_id=run.user_id, carrier_id=run.carrier_id,
            payload={"prompt": prompt.model_dump()},
        ))

        # ParkedSession is the bridge between the worker thread and the HTTP
        # route that delivers the user's HIL response. We no longer hold a
        # Playwright Browser/Context/Page — the worker thread blocks on the
        # event and we keep going on the SAME httpx client so the session
        # cookie survives.
        session = ParkedSession(
            run_id=run.id, carrier=carrier,
            client=client,  # type: ignore[arg-type]
            handler=pending.handler,
        )
        hil_registry.park(session)
        # threading.Event.wait can't be awaited directly. Run it in a thread
        # so the worker loop stays responsive to other coroutines (Playwright
        # keepalives, etc.).
        loop = asyncio.get_running_loop()
        woke = await loop.run_in_executor(
            None, session.resume.wait, carrier.hil_timeout_seconds,
        )
        if not woke:
            hil_registry.pop(run.id)
            raise errors.MfaTimeoutError("HIL response not received in time")

        hil_registry.pop(run.id)
        store.set_status(run.id, "running")
        store.merge_metadata(run.id, mfa_prompt=None)
        events.emit(events.Event(
            name="doc_retrieval.run.mfa_resolved",
            run_id=run.id, user_id=run.user_id, carrier_id=run.carrier_id,
            payload={},
        ))
        return session.response

    return _callback


# ── deterministic "summary" block for the UI's rich panels ──────────────────
def _summarise(docs, run: DocRetrievalRun) -> dict:
    """Computes lightweight stats for the UI from a real run's docs. NOT a
    replacement for real loss-run analytics — those belong to a downstream
    pod. This is just enough to keep the post-retrieval panels populated."""
    total = sum(d.size_bytes for d in docs) if docs else 0
    by_type: dict[str, int] = {}
    for d in docs:
        by_type[d.classified_doc_type] = by_type.get(d.classified_doc_type, 0) + 1
    return {
        "carrier_id": run.carrier_id,
        "policy_number": run.policy_number,
        "insured_name": run.insured_name,
        "document_count": len(docs),
        "total_bytes": total,
        "by_type": by_type,
    }
