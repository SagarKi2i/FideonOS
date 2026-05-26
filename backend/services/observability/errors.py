"""Error taxonomy for the doc-retrieval orchestrator.

Mapping `kind` → UI behaviour:
    transient            → retried, eventually surfaced as "temporary failure"
    rate_limited         → same as transient but with backoff hint
    selector_drift       → admin alert: carrier DOM changed, registry needs update
    auth_failed          → broker re-credentials required
    mfa_timeout          → broker re-runs; carrier may temp-lock
    user_action_required → broker must reconfigure the connection
    fatal                → escalate to engineering
"""
from __future__ import annotations

from typing import Literal


ErrorKind = Literal[
    "transient", "rate_limited", "selector_drift",
    "auth_failed", "mfa_timeout", "user_action_required", "fatal",
]


class DocRetrievalError(Exception):
    kind: ErrorKind = "fatal"
    retryable: bool = False
    user_message: str = "Something went wrong while fetching documents."

    def __init__(self, message: str = "", *, user_message: str | None = None) -> None:
        super().__init__(message or self.user_message)
        if user_message is not None:
            self.user_message = user_message


class TransientError(DocRetrievalError):
    kind: ErrorKind = "transient"
    retryable = True
    user_message = "Temporary network issue — please retry."


class RateLimitedError(DocRetrievalError):
    kind: ErrorKind = "rate_limited"
    retryable = True
    user_message = "Carrier is rate-limiting us — please retry in a few minutes."


class SelectorDriftError(DocRetrievalError):
    kind: ErrorKind = "selector_drift"
    retryable = False
    user_message = "Carrier portal layout changed; admin notified."


class AuthFailedError(DocRetrievalError):
    kind: ErrorKind = "auth_failed"
    retryable = False
    user_message = "Carrier credentials were rejected — please verify the connection."


class MfaTimeoutError(DocRetrievalError):
    kind: ErrorKind = "mfa_timeout"
    retryable = False
    user_message = "We didn't receive your MFA response in time. Please try again."


class UserActionRequiredError(DocRetrievalError):
    kind: ErrorKind = "user_action_required"
    retryable = False
    user_message = "Action required: please reconfigure the carrier connection."


class FatalAdapterError(DocRetrievalError):
    kind: ErrorKind = "fatal"
    retryable = False
    user_message = "Unexpected failure — engineering has been notified."
