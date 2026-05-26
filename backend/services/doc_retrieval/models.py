"""Pydantic models shared across the doc-retrieval service.

Wire-format models for the run row + a typed `DownloadedDoc`. Kept separate
from `models/schemas.py` because they're internal — the public request /
response schemas live in `models/schemas.py` and import from here.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

RunStatus = Literal["queued", "running", "awaiting_mfa", "completed", "failed"]
AttachTo  = Literal["policy", "activity", "accounts", "unrouted"]
AuthKind  = Literal["password", "api_key"]
MfaKind   = Literal["totp_rfc6238", "captcha_bypass", "email_link", "email_otp", "sms_otp", "captcha_hil", "none"]


class Carrier(BaseModel):
    """Row in the `carriers` registry. The orchestrator reads this to know how
    to drive a given carrier_id."""
    model_config = ConfigDict(extra="ignore")

    carrier_id: str
    display_name: str
    login_url: str
    auth_kind: AuthKind = "password"
    mfa_kind: MfaKind = "totp_rfc6238"
    hil_timeout_seconds: int = 120
    listing_selector_spec: dict[str, Any] = Field(default_factory=dict)
    totp_secret_b32: str | None = None
    is_mock: bool = False
    is_active: bool = True


class AmsTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ams_target_id: str
    display_name: str
    connector_kind: str = "stub"
    connector_config: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True


class DownloadedDoc(BaseModel):
    doc_id: str
    filename: str
    doc_type: str
    policy_number: str
    insured_name: str
    issued_on: str
    size_bytes: int
    local_path: str
    classified_doc_type: str
    classification_confidence: float


class MfaPrompt(BaseModel):
    kind: MfaKind
    instruction: str
    captcha_image_url: str | None = None
    submit_label: str = "Submit"


class DocRetrievalRun(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    user_id: str | None
    carrier_id: str
    ams_target_id: str | None
    attach_to: AttachTo
    doc_type: str
    policy_number: str
    insured_name: str
    status: RunStatus
    error: str | None = None
    error_kind: str | None = None
    retryable: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class RunRequest(BaseModel):
    """Body for POST /api/agents/doc_retrieval_v0/run."""
    model_config = ConfigDict(extra="ignore")

    carrier_id: str
    ams_target_id: str | None = None
    attach_to: AttachTo = "unrouted"
    doc_type: str
    policy_number: str
    insured_name: str


class MfaResponseRequest(BaseModel):
    """Body for POST /api/agents/doc_retrieval_v0/runs/{run_id}/mfa-response."""
    response: str = ""
