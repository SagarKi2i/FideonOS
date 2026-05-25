from pydantic import BaseModel, Field
from typing import Any
from datetime import datetime
from uuid import UUID


# ── Auth ──────────────────────────────────────────────────────────────────────
class UserRole(BaseModel):
    user_id: str
    role: str


# ── Chat ──────────────────────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    conversation_id: str | None = None
    model_id: str | None = None


# ── Devices ───────────────────────────────────────────────────────────────────
class DeviceRegisterRequest(BaseModel):
    device_token: str
    os_type: str | None = None
    app_version: str | None = None
    hostname: str | None = None


class DeviceCheckinRequest(BaseModel):
    os_type: str | None = None
    app_version: str | None = None
    local_models: list[dict[str, Any]] = []


class DeviceStatusUpdate(BaseModel):
    status: str


class DeviceModelAllocate(BaseModel):
    """POST /api/devices/{device_id}/allocations — allocate an agent's model to a device."""
    agent_id: UUID
    model_name: str
    notes: str | None = None


# ── Workflows ─────────────────────────────────────────────────────────────────
class WorkflowCreate(BaseModel):
    name: str
    description: str | None = None
    definition: dict[str, Any] = {}


class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    definition: dict[str, Any] | None = None
    is_active: bool | None = None


class WorkflowRunCreate(BaseModel):
    inputs: dict[str, Any] = {}


# ── Agent Run ─────────────────────────────────────────────────────────────────

class AgentRunTrigger(BaseModel):
    """POST /api/agents/{agent_keyword}/runs — body must match agent_versions.input_schema."""
    input: dict[str, Any]


class AgentRunApproval(BaseModel):
    """POST /api/runs/{run_id}/approve"""
    decision: str            # "approved" | "rejected" | "escalated"
    notes: str | None = None


# ── Agent Activation ──────────────────────────────────────────────────────────

class ActivateAgentRequest(BaseModel):
    """POST /api/agents — body: { agent_id: UUID, model_name, domain }"""
    agent_id: UUID
    model_name: str
    domain: str


# ── Agent Access Requests (marketplace) ──────────────────────────────────────

class AgentActivationRequestCreate(BaseModel):
    """POST /api/agent-requests — request access to an existing marketplace agent"""
    agent_id: UUID
    model_name: str


class AgentActivationRequestUpdate(BaseModel):
    """PATCH /api/admin/agent-requests/{id} — admin approves or rejects"""
    status: str | None = None
    rejection_reason: str | None = None


# ── Custom Agent Requests (user's own build) ──────────────────────────────────

class CustomAgentRequestCreate(BaseModel):
    """POST /api/custom-agent-requests — request Fideon build a new custom agent"""
    title: str
    sop_text: str | None = None
    sop_file_url: str | None = None
    target_carriers: list[str] = []
    priority: str = "normal"
    expected_outcome: str | None = None
    phone_no: str | None = None
    desired_by: str | None = None   # ISO date string


class CustomAgentRequestUpdate(BaseModel):
    """PATCH /api/admin/custom-agent-requests/{id} — admin manages build pipeline"""
    status: str | None = None
    assigned_admin_id: str | None = None
    rejection_reason: str | None = None
    custom_agent_id: str | None = None
    installed_user_agent_id: str | None = None


# ── Admin Stats ───────────────────────────────────────────────────────────────

class AdminStatsResponse(BaseModel):
    """GET /api/admin/stats"""
    total_devices: int
    active_devices: int
    pending_devices: int
    total_agent_requests: int
    total_users: int
    active_users_30d: int
    total_runs_today: int
    total_runs_week: int
    pending_approvals: int


# ── Approvals ─────────────────────────────────────────────────────────────────
class DecisionReviewUpdate(BaseModel):
    status: str
    resolution_note: str | None = None


# ── Training ──────────────────────────────────────────────────────────────────
class FeedbackSubmit(BaseModel):
    model_id: str
    prompt: str
    original_response: str
    corrected_response: str | None = None
    rating: int | None = None
    feedback_type: str = "correction"


class TrainingJobCreate(BaseModel):
    model_id: str
    training_type: str = "fine-tune"
    config: dict[str, Any] = {}


class GradientSubmit(BaseModel):
    model_id: str
    round_number: int
    gradient_hash: str
    gradient_size_bytes: int | None = None
    metrics: dict[str, Any] = {}
    privacy_noise_added: bool = False


# ── Settings ──────────────────────────────────────────────────────────────────
class CarrierConnectionUpsert(BaseModel):
    carrier_id: str | None = None   # path param is authoritative; body value optional
    username: str | None = None
    password: str | None = None
    producer_codes: list[Any] = []
    extra: dict[str, Any] = {}


class AmsConnectionUpsert(BaseModel):
    ams_id: str | None = None       # path param is authoritative; body value optional
    auth_method: str
    username: str | None = None
    password: str | None = None
    api_key: str | None = None
    instance_url: str | None = None
    tenant_id: str | None = None
    extra: dict[str, Any] = {}


class DocRetrievalConfigUpsert(BaseModel):
    carrier_id: str
    sources: list[str] = []
    doc_types: dict[str, Any] = {}
    email_alias: str | None = None
    is_enabled: bool = True


# ── Admin ─────────────────────────────────────────────────────────────────────
class CreateUserRequest(BaseModel):
    email: str
    password: str
    role: str = "user"


# ── MCP ───────────────────────────────────────────────────────────────────────
class McpTokenCreate(BaseModel):
    scopes: list[str] = ["read", "execute"]


# ── Help ──────────────────────────────────────────────────────────────────────
class HelpRequest(BaseModel):
    message: str
    context: str | None = None


# ── Workflow AI ───────────────────────────────────────────────────────────────
class SopParseRequest(BaseModel):
    sop_text: str


class WorkflowStepAssistRequest(BaseModel):
    step: dict[str, Any]
    context: str | None = None


class SopCompileRequest(BaseModel):
    sop_text: str
    steps: list[dict[str, Any]]


# ── Governance ────────────────────────────────────────────────────────────────
class ExportRequest(BaseModel):
    table: str
    format: str = "json"
    filters: dict[str, Any] = {}
