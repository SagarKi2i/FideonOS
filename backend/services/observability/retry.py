"""Tenacity-based retry policy for doc-retrieval pipeline steps.

Only `DocRetrievalError` subclasses with `retryable=True` are retried; every
other exception (including non-retryable `DocRetrievalError`s like
`AuthFailedError` and `SelectorDriftError`) propagates immediately so the
orchestrator can record the failure and stop.

Defaults: 4 attempts total (1 initial + 3 retries), exponential backoff
1s → 30s.
"""
from __future__ import annotations

import functools
from typing import Any, Awaitable, Callable, TypeVar

import structlog
from tenacity import (
    AsyncRetrying,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from .errors import DocRetrievalError


log = structlog.get_logger("doc_retrieval.retry")


F = TypeVar("F", bound=Callable[..., Awaitable[Any]])


def _is_retryable(exc: BaseException) -> bool:
    return isinstance(exc, DocRetrievalError) and exc.retryable


def retry_doc_retrieval_step(
    *,
    attempts: int = 4,
    min_wait: float = 1.0,
    max_wait: float = 30.0,
) -> Callable[[F], F]:
    """Decorator factory. Wrap an async step function so retryable errors
    retry with exponential backoff."""

    def _decorator(fn: F) -> F:
        @functools.wraps(fn)
        async def _wrapped(*args: Any, **kwargs: Any) -> Any:
            attempt = 0
            async for attempt_ctx in AsyncRetrying(
                stop=stop_after_attempt(attempts),
                wait=wait_exponential(multiplier=1, min=min_wait, max=max_wait),
                retry=retry_if_exception(_is_retryable),
                reraise=True,
            ):
                attempt += 1
                with attempt_ctx:
                    if attempt > 1:
                        log.info(
                            "doc_retrieval.step.retry",
                            step=fn.__name__,
                            attempt=attempt,
                        )
                    return await fn(*args, **kwargs)

        return _wrapped  # type: ignore[return-value]

    return _decorator
