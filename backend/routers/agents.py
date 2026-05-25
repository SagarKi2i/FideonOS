from fastapi import APIRouter, Depends, HTTPException
from auth.dependencies import get_current_user_id, require_admin
from models.schemas import (
    ActivateAgentRequest,
    AgentActivationRequestCreate,
    CustomAgentRequestCreate,
)
from services.supabase import get_supabase, is_missing_table_error
from services.agent_activation import activate_user_agent
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
