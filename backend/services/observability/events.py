"""Lifecycle events for doc-retrieval runs.

Emits structured JSON via structlog (see `services/observability/logging.py`
for the pipeline). The orchestrator emits at every milestone; downstream
consumers (Mailbox, audit log, notifications) subscribe to specific event
names without coupling to internal orchestrator state.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

import structlog


_log = structlog.get_logger("doc_retrieval.events")


EventName = Literal[
    "doc_retrieval.run.queued",
    "doc_retrieval.run.started",
    "doc_retrieval.run.step_entered",
    "doc_retrieval.run.mfa_required",
    "doc_retrieval.run.mfa_resolved",
    "doc_retrieval.run.document_downloaded",
    "doc_retrieval.run.completed",
    "doc_retrieval.run.failed",
]


@dataclass
class Event:
    name: EventName
    run_id: str
    user_id: str | None
    carrier_id: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    payload: dict[str, Any] = field(default_factory=dict)


def emit(event: Event) -> None:
    """Emit a lifecycle event. Top-level keys are queryable in Azure Log
    Analytics; the rest of the payload is spread as additional fields."""
    _log.info(
        event.name,
        run_id=event.run_id,
        user_id=event.user_id,
        carrier_id=event.carrier_id,
        event_timestamp=event.timestamp,
        **event.payload,
    )
