from fastapi import APIRouter, Depends, HTTPException
# pyrefly: ignore [missing-import]
from auth.dependencies import get_current_user_id, require_admin
from models.schemas import (
    ActivateAgentRequest,
    AgentActivationRequestCreate,
    CustomAgentRequestCreate,
)
from services.supabase import get_supabase, is_missing_table_error
from services.agent_activation import activate_user_agent
from services.doc_retrieval import hil_registry, orchestrator, registry as dr_registry, store as dr_store
from services.doc_retrieval.models import MfaResponseRequest, RunRequest
from datetime import datetime, timezone

router = APIRouter(prefix="/agents", tags=["agents"])

# NOTE: Route order matters in FastAPI. All fixed-path routes (e.g. /marketplace,
# /agent-requests) MUST be declared before the catch-all /{agent_keyword} route.


# ── Fixed-path routes (before /{agent_keyword}) ────────────────────────────────

@router.get("")
async def list_activated_agents(user_id: str = Depends(get_current_user_id)):
    """Return this user's activated agents with their live stats and widget config (Q1)."""
    sb = get_supabase()
    result = (
        sb.table("user_agents")
        .select(
            # agent_dashboard_templates FKs to agents(id), not user_agents — embed it
            # under agents so PostgREST can resolve the relationship.
            "id, agent_id, current_version_id, is_active, activated_at,"
            "user_agent_stats(stats, updated_at),"
            "agents(keyword, name, domain, tagline, icon_asset_file_name, status,"
            " agent_dashboard_templates(widgets, tabs, comparison_period_days))"
        )
        .eq("user_id", user_id)
        .eq("is_active", True)
        .order("activated_at", desc=True)
        .execute()
    )
    return result.data or []


@router.post("")
async def activate_agent(
    body: ActivateAgentRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Activate a marketplace agent for this user. Creates user_agents + user_agent_stats rows."""
    sb = get_supabase()
    ua_id = activate_user_agent(
        sb, user_id, str(body.agent_id), body.model_name, body.domain
    )
    return {"activated": True, "user_agent_id": ua_id}


@router.get("/marketplace")
async def list_marketplace_agents(_user_id: str = Depends(get_current_user_id)):
    """Return all Fideon marketplace agents (the catalog)."""
    sb = get_supabase()
    result = (
        sb.table("agents")
        .select("id, keyword, name, description, domain, tagline, icon_asset_file_name, status")
        .in_("status", ["live", "beta", "coming_soon"])
        .order("name")
        .execute()
    )
    return result.data or []


@router.get("/agent-requests")
async def list_my_agent_requests(user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = (
        sb.table("agent_access_requests")
        .select("*, agents(keyword, name)")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.post("/agent-requests")
async def create_agent_request(
    body: AgentActivationRequestCreate,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase()
    agent = (
        sb.table("agents")
        .select("id, name")
        .eq("id", str(body.agent_id))
        .maybe_single()
        .execute()
    )
    if not agent.data:
        raise HTTPException(status_code=404, detail="Agent not found.")

    result = sb.table("agent_access_requests").insert({
        "user_id": user_id,
        "agent_id": str(body.agent_id),
        "model_name": body.model_name,
        "status": "submitted",
    }).execute()
    return result.data[0]


@router.get("/custom-agent-requests")
async def list_custom_agent_requests(user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = (
        sb.table("custom_agent_requests")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.post("/custom-agent-requests")
async def create_custom_agent_request(
    body: CustomAgentRequestCreate,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase()
    result = sb.table("custom_agent_requests").insert({
        "user_id": user_id,
        "title": body.title,
        "sop_text": body.sop_text,
        "sop_file_url": body.sop_file_url,
        "target_carriers": body.target_carriers,
        "priority": body.priority,
        "expected_outcome": body.expected_outcome,
        "phone_no": body.phone_no,
        "desired_by": body.desired_by,
        "status": "submitted",
        "status_history": [],
    }).execute()
    return result.data[0]


@router.get("/doc-retrieval-config")
async def get_doc_retrieval_config(_user_id: str = Depends(get_current_user_id)):
    """Returns the global carrier_connections rows (doc-retrieval config lives in extra JSONB).
    Connections are global/admin-set, so every user sees the same config."""
    sb = get_supabase()
    try:
        result = (
            sb.table("carrier_connections")
            .select("carrier_id, extra, status, last_synced_at")
            .execute()
        )
    except Exception as exc:
        if is_missing_table_error(exc):
            return []
        raise
    return result.data or []


@router.put("/doc-retrieval-config/{carrier_id}")
async def upsert_doc_retrieval_config(
    carrier_id: str,
    body: dict,
    admin=Depends(require_admin),
):
    """Admin-only. Global per-carrier doc-retrieval config, merged into carrier_connections.extra
    (merge preserves credential fields like portal_url set via the carrier connection)."""
    sb = get_supabase()
    new_fields = {k: v for k, v in body.items() if k in ("sources", "doc_types", "email_alias", "portal_url", "is_enabled")}
    try:
        existing = (
            sb.table("carrier_connections")
            .select("extra")
            .eq("carrier_id", carrier_id)
            .maybe_single()
            .execute()
        )
        merged_extra = {**((existing.data or {}).get("extra") or {}), **new_fields}
        result = sb.table("carrier_connections").upsert({
            "carrier_id": carrier_id,
            "extra": merged_extra,
        }, on_conflict="carrier_id").execute()
    except Exception as exc:
        if is_missing_table_error(exc):
            raise HTTPException(
                status_code=501,
                detail="carrier_connections table not provisioned yet (see backend/docs/pending_tables.md)",
            )
        raise
    return result.data[0]


# ── Doc Retrieval v0 — run lifecycle ──────────────────────────────────────────
#
# `POST /doc_retrieval_v0/run`  → 202 + run_id (background pipeline starts)
# `GET  /doc_retrieval_v0/runs` → recent runs for this user (UI history)
# `GET  /doc_retrieval_v0/runs/{run_id}` → latest run state for polling
# `POST /doc_retrieval_v0/runs/{run_id}/mfa-response` → resume a HIL-paused run
#
# Per the architecture, the run endpoint is async — it never blocks on
# Playwright. The frontend polls /runs/{run_id} until status is terminal.

@router.post("/doc_retrieval_v0/run", status_code=202)
async def doc_retrieval_run(body: RunRequest, user_id: str = Depends(get_current_user_id)):
    carrier = dr_registry.get_carrier(body.carrier_id)
    if not carrier:
        raise HTTPException(status_code=404, detail=f"Unknown carrier_id: {body.carrier_id}")
    if not carrier.is_active:
        raise HTTPException(status_code=409, detail=f"Carrier {body.carrier_id} is inactive.")
    if body.ams_target_id:
        ams = dr_registry.get_ams_target(body.ams_target_id)
        if not ams:
            raise HTTPException(status_code=404, detail=f"Unknown ams_target_id: {body.ams_target_id}")
    if body.doc_type not in dr_registry.list_doc_types():
        raise HTTPException(status_code=422, detail=f"Unknown doc_type: {body.doc_type}")
    if not body.policy_number.strip() or not body.insured_name.strip():
        raise HTTPException(status_code=422, detail="policy_number and insured_name are required.")

    run = orchestrator.queue_run(body, user_id)
    return {"run_id": run.id, "status": run.status}


@router.get("/doc_retrieval_v0/runs")
async def doc_retrieval_list_runs(user_id: str = Depends(get_current_user_id), limit: int = 25):
    runs = dr_store.list_runs(user_id=user_id, limit=limit)
    return [r.model_dump(mode="json") for r in runs]


@router.get("/doc_retrieval_v0/runs/{run_id}")
async def doc_retrieval_get_run(run_id: str, user_id: str = Depends(get_current_user_id)):
    run = dr_store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    if run.user_id and run.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your run.")
    return run.model_dump(mode="json")


@router.post("/doc_retrieval_v0/runs/{run_id}/mfa-response")
async def doc_retrieval_mfa_response(
    run_id: str,
    body: MfaResponseRequest,
    user_id: str = Depends(get_current_user_id),
):
    run = dr_store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    if run.user_id and run.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your run.")
    if run.status != "awaiting_mfa":
        raise HTTPException(status_code=409, detail=f"Run is not awaiting MFA (status={run.status}).")
    delivered = hil_registry.submit_mfa_response(run_id, body.response)
    if not delivered:
        raise HTTPException(status_code=410, detail="No parked session for this run — it may have expired.")
    return {"submitted": True}


@router.get("/doc_retrieval_v0/registry/carriers")
async def doc_retrieval_list_carriers(_user_id: str = Depends(get_current_user_id)):
    """Read-only view of the registry for the UI's carrier picker. Admin
    writes go through /api/admin/carriers below."""
    return [c.model_dump() for c in dr_registry.list_carriers()]


@router.get("/doc_retrieval_v0/registry/ams-targets")
async def doc_retrieval_list_ams_targets(_user_id: str = Depends(get_current_user_id)):
    return [a.model_dump() for a in dr_registry.list_ams_targets()]


@router.get("/doc_retrieval_v0/registry/doc-types")
async def doc_retrieval_list_doc_types(_user_id: str = Depends(get_current_user_id)):
    return dr_registry.list_doc_types()


# ── Parametrised routes (/{agent_keyword} — must come last) ───────────────────

@router.get("/{agent_keyword}")
async def get_agent(
    agent_keyword: str,
    user_id: str = Depends(get_current_user_id),
):
    """Agent detail + version check (Q8)."""
    sb = get_supabase()
    agent = (
        sb.table("agents")
        .select("id, keyword, name, description, domain, tagline, status, current_version_id")
        .eq("keyword", agent_keyword)
        .maybe_single()
        .execute()
    )
    if not agent.data:
        raise HTTPException(status_code=404, detail="Agent not found.")

    ua = (
        sb.table("user_agents")
        .select("id, current_version_id, is_active, activated_at")
        .eq("user_id", user_id)
        .eq("agent_id", agent.data["id"])
        .maybe_single()
        .execute()
    )

    is_up_to_date = (
        ua.data.get("current_version_id") == agent.data.get("current_version_id")
        if ua.data
        else None
    )

    return {**agent.data, "user_agent": ua.data, "is_up_to_date": is_up_to_date}


@router.patch("/{agent_keyword}")
async def update_agent_config(
    agent_keyword: str,
    body: dict,
    user_id: str = Depends(get_current_user_id),
):
    """Update user's agent config (e.g. version pin)."""
    sb = get_supabase()
    agent = (
        sb.table("agents")
        .select("id")
        .eq("keyword", agent_keyword)
        .maybe_single()
        .execute()
    )
    if not agent.data:
        raise HTTPException(status_code=404, detail="Agent not found.")

    allowed = {"current_version_id"}
    updates = {k: v for k, v in body.items() if k in allowed}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = (
        sb.table("user_agents")
        .update(updates)
        .eq("user_id", user_id)
        .eq("agent_id", agent.data["id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="User agent not found.")
    return result.data[0]


@router.delete("/{agent_keyword}")
async def deactivate_agent(
    agent_keyword: str,
    user_id: str = Depends(get_current_user_id),
):
    """Deactivate an agent for this user (sets is_active=false)."""
    sb = get_supabase()
    agent = (
        sb.table("agents")
        .select("id")
        .eq("keyword", agent_keyword)
        .maybe_single()
        .execute()
    )
    if not agent.data:
        raise HTTPException(status_code=404, detail="Agent not found.")

    sb.table("user_agents").update({
        "is_active": False,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("user_id", user_id).eq("agent_id", agent.data["id"]).execute()
    return {"deactivated": True}
