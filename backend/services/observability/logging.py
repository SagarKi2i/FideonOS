"""Structured logging configuration.

Calls `structlog.configure()` and bridges stdlib `logging` through the same
processor chain so a single pipeline produces JSON in prod and pretty console
output in dev. Idempotent — safe to call multiple times (no-op after the
first call), which matters because uvicorn reload re-imports `main` and we
don't want stacked handlers.

Wire-up: call `configure_logging(settings.environment)` exactly once at
process startup from `backend/main.py`.
"""
from __future__ import annotations

import logging
import sys

import structlog
from structlog.contextvars import merge_contextvars
from structlog.processors import (
    CallsiteParameter,
    CallsiteParameterAdder,
    JSONRenderer,
    TimeStamper,
    add_log_level,
    format_exc_info,
)
from structlog.stdlib import ProcessorFormatter, add_logger_name


_CONFIGURED = False


def configure_logging(environment: str = "development") -> None:
    """Configure structlog + stdlib logging for the whole process.

    In dev (`environment == "development"`), emit colored single-line console
    output. Otherwise emit JSON one-line-per-event (Azure Log Analytics-ready).
    """
    global _CONFIGURED
    if _CONFIGURED:
        return

    is_dev = environment == "development"

    # Shared processor chain runs for both native structlog calls and stdlib
    # logging calls that flow through ProcessorFormatter.
    shared_processors: list = [
        merge_contextvars,
        add_logger_name,
        add_log_level,
        TimeStamper(fmt="iso", utc=True),
        CallsiteParameterAdder(parameters={
            CallsiteParameter.MODULE,
            CallsiteParameter.FUNC_NAME,
        }),
        format_exc_info,
    ]

    renderer: object = (
        structlog.dev.ConsoleRenderer(colors=True) if is_dev else JSONRenderer()
    )

    structlog.configure(
        processors=[*shared_processors, renderer],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Bridge stdlib → structlog so existing `logger.info(...)` calls land in
    # the same JSON/console pipeline. Without this, uvicorn's own logs would
    # bypass structlog and you'd get mixed output.
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        ProcessorFormatter(
            foreign_pre_chain=shared_processors,
            processors=[
                ProcessorFormatter.remove_processors_meta,
                renderer,
            ],
        )
    )

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)

    # Quiet noisy third-party chatter.
    for name in ("httpx", "httpcore", "uvicorn.access"):
        logging.getLogger(name).setLevel(logging.WARNING)

    _CONFIGURED = True


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
