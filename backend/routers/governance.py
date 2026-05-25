from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import Any
import uuid
from datetime import datetime, timezone
from auth.dependencies import get_current_user_id
from services.supabase import get_supabase
import json


class DecisionCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())  # model_version is a domain field
    domain: str
    decision_type: str
    title: str
    pod_model_id: str
    pod_model_name: str
    model_version: str | None = None
    prompt_snapshot: str | None = None
    input_snapshot: dict[str, Any] = {}
    ai_recommendation: str | None = None
    ai_output_snapshot: dict[str, Any] = {}
    ai_confidence: float | None = None
    key_factors: list[Any] = []
    reason_summary: str | None = None
    risk_level: str = "medium"
    risk_score: float | None = None
    policy_checks: list[Any] = []
    requires_review: bool = True


class DecisionEventCreate(BaseModel):
    event_type: str
    actor_type: str = "system"
    payload: dict[str, Any] = {}
    notes: str | None = None


class HumanDecisionApply(BaseModel):
    outcome: str
    reason_code: str | None = None
    notes: str | None = None


class ExportLog(BaseModel):
    format: str = "json"

router = APIRouter(prefix="/governance", tags=["governance"])


@router.post("/decisions", status_code=201)
async def create_decision(body: DecisionCreate, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    record = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        **body.model_dump(),
    }
    result = sb.table("decision_records").insert(record).execute()
    data = result.data[0] if result.data else record
    return {"id": data["id"]}


@router.post("/decisions/{decision_id}/events", status_code=201)
async def log_event(decision_id: str, body: DecisionEventCreate, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    record = {
        "id": str(uuid.uuid4()),
        "decision_record_id": decision_id,
        "actor_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **body.model_dump(),
    }
    result = sb.table("decision_events").insert(record).execute()
    return result.data[0] if result.data else record


@router.post("/decisions/{decision_id}/apply")
async def apply_human_decision(decision_id: str, body: HumanDecisionApply, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    agreement = body.outcome == "approved"
    delta = (
        "Human confirmed AI recommendation"
        if agreement
        else f"Human overrode AI recommendation{f' — reason: {body.reason_code}' if body.reason_code else ''}"
    )
    sb.table("decision_records").update({
        "status": body.outcome,
        "final_decision": body.outcome,
        "final_decision_by": user_id,
        "final_decision_at": datetime.now(timezone.utc).isoformat(),
        "final_reason_code": body.reason_code,
        "final_reason_notes": body.notes,
        "ai_human_agreement": agreement,
        "delta_summary": delta,
    }).eq("id", decision_id).execute()
    return {"ok": True}


@router.post("/decisions/{decision_id}/exports", status_code=201)
async def log_export(decision_id: str, body: ExportLog, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    record = {
        "id": str(uuid.uuid4()),
        "decision_record_id": decision_id,
        "exported_by": user_id,
        "format": body.format,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = sb.table("decision_exports").insert(record).execute()
    return result.data[0] if result.data else record


@router.get("/decisions")
async def list_decisions(user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = (
        sb.table("decision_reviews")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/decisions/{decision_id}")
async def get_decision(decision_id: str, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = (
        sb.table("decision_reviews")
        .select("*")
        .eq("id", decision_id)
        .maybe_single()
        .execute()
    )
    overrides = (
        sb.table("training_overrides")
        .select("*")
        .eq("decision_review_id", decision_id)
        .execute()
    )
    return {"decision": result.data, "overrides": overrides.data}


@router.get("/audit-log")
async def get_audit_log(user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = (
        sb.table("mcp_call_log")
        .select("*, mcp_tokens(user_id)")
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )
    return result.data


@router.get("/model-versions")
async def get_model_versions(user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = (
        sb.table("user_agents")
        .select("*")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/exports")
async def export_data(table: str, user_id: str = Depends(get_current_user_id)):
    allowed = {"decision_reviews", "mcp_call_log", "workflow_runs", "training_overrides"}
    if table not in allowed:
        return {"error": f"Table '{table}' is not exportable"}

    sb = get_supabase()
    result = sb.table(table).select("*").eq("user_id", user_id).execute()
    return {"table": table, "rows": result.data, "count": len(result.data)}
