import logging

from fastapi import APIRouter, Depends, HTTPException
# pyrefly: ignore [missing-import]
from auth.dependencies import require_admin, get_current_user_id
from models.schemas import (
    AgentActivationRequestUpdate,
    CustomAgentRequestUpdate,
    CreateUserRequest,
    AdminStatsResponse,
    ActivateAgentRequest,
)
from services.supabase import get_supabase
from services.agent_activation import activate_user_agent
from services.argon2_service import hash_password
from services.doc_retrieval import registry as dr_registry
from services.doc_retrieval.models import AmsTarget, Carrier
from datetime import datetime, timezone

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/invites", dependencies=[Depends(require_admin)])
async def list_invites():
    sb = get_supabase()
    result = (
        sb.table("invites")
        .select("id, email, status, expires_at, invited_by, created_at")
        .order("created_at", desc=True)
        .execute()
    )
    return {"invites": result.data or []}


@router.get("/users", dependencies=[Depends(require_admin)])
async def list_users():
    """List all users from public.users (custom auth — no Supabase Auth API)."""
    sb = get_supabase()
    result = (
        sb.table("users")
        .select("id, email, status, created_at, email_verified_at")
        .order("created_at", desc=True)
        .execute()
    )
    # Join roles separately to avoid exposing password_hash
    roles = sb.table("user_roles").select("user_id, role").execute()
    roles_map = {r["user_id"]: r["role"] for r in (roles.data or [])}
    users = result.data or []
    for u in users:
        u["role"] = roles_map.get(u["id"])
    return {"users": users}


@router.post("/users", dependencies=[Depends(require_admin)])
async def create_user(body: CreateUserRequest):
    """Create a user directly in public.users (custom auth — no Supabase Auth API)."""
    sb = get_supabase()
    email = body.email.strip().lower()

    existing = sb.table("users").select("id").eq("email", email).maybe_single().execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="User already exists.")

    pw_hash = hash_password(body.password)
    result = sb.table("users").insert({
        "email": email,
        "password_hash": pw_hash,
        "status": "active",
        "email_verified_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create user.")

    user_id = result.data[0]["id"]
    sb.table("user_roles").insert({"user_id": user_id, "role": body.role}).execute()
    return {"id": user_id, "email": email, "role": body.role}


# ── Model / agent allocation (admin assigns agents directly to a user) ────────

@router.get("/users/{user_id}/models", dependencies=[Depends(require_admin)])
async def list_user_models(user_id: str):
    """All agents allocated to a user (admin view). Joined with agent catalog."""
    sb = get_supabase()
    result = (
        sb.table("user_agents")
        .select("id, agent_id, model_name, domain, is_active, activated_at, "
                "agents(keyword, name, domain)")
        .eq("user_id", user_id)
        .order("activated_at", desc=True)
        .execute()
    )
    return result.data or []


@router.post("/users/{user_id}/models", dependencies=[Depends(require_admin)])
async def allocate_user_model(user_id: str, body: ActivateAgentRequest):
    """Allocate (activate) an agent for a user. Mirrors the agent-request approval path."""
    sb = get_supabase()
    ua_id = activate_user_agent(
        sb, user_id, str(body.agent_id), body.model_name, body.domain,
        conflict_if_active=True,
    )
    return {
        "id": ua_id,
        "agent_id": str(body.agent_id),
        "model_name": body.model_name,
        "domain": body.domain,
    }


@router.delete("/users/{user_id}/models/{allocation_id}", dependencies=[Depends(require_admin)])
async def deallocate_user_model(user_id: str, allocation_id: str):
    """Remove an agent allocation from a user (hard delete of the user_agents row)."""
    sb = get_supabase()
    result = (
        sb.table("user_agents")
        .delete()
        .eq("id", allocation_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Allocation not found.")
    return {"deleted": allocation_id}


# ── Agent access requests (marketplace) ──────────────────────────────────────

@router.get("/agent-requests", dependencies=[Depends(require_admin)])
async def list_agent_requests():
    """All marketplace agent access requests with agent + user info."""
    sb = get_supabase()
    result = (
        sb.table("agent_access_requests")
        .select("*, agents(keyword, name), users!user_id(email)")
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.patch("/agent-requests/{request_id}", dependencies=[Depends(require_admin)])
async def update_agent_request(
    request_id: str,
    body: AgentActivationRequestUpdate,
    admin_user_id: str = Depends(get_current_user_id),
):
    """Approve or reject a marketplace agent access request."""
    sb = get_supabase()
    updates = body.model_dump(exclude_none=True)
    updates["reviewed_at"] = datetime.now(timezone.utc).isoformat()
    updates["reviewed_by"] = admin_user_id

    result = (
        sb.table("agent_access_requests")
        .update(updates)
        .eq("id", request_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Agent request not found.")

    # If approved, activate the agent for the user
    if body.status == "approved":
        req = result.data[0]
        activate_user_agent(
            sb, req["user_id"], req["agent_id"], req["model_name"], "insurance"
        )

    return result.data[0]


# ── Custom agent build requests ───────────────────────────────────────────────

@router.get("/custom-agent-requests", dependencies=[Depends(require_admin)])
async def list_custom_agent_requests():
    sb = get_supabase()
    result = (
        sb.table("custom_agent_requests")
        .select("*")
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.patch("/custom-agent-requests/{request_id}", dependencies=[Depends(require_admin)])
async def update_custom_agent_request(
    request_id: str,
    body: CustomAgentRequestUpdate,
):
    sb = get_supabase()
    updates = body.model_dump(exclude_none=True)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = sb.table("custom_agent_requests").update(updates).eq("id", request_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Custom agent request not found.")
    return result.data[0]


# ── Doc Retrieval registry (carriers + AMS targets) ──────────────────────────
# Admin-only. Backed by the JSON registry in services/doc_retrieval/registry.py
# (Supabase tables ship in migration 20260526100000 once ops applies it).

@router.get("/carriers", dependencies=[Depends(require_admin)])
async def admin_list_carriers():
    return [c.model_dump() for c in dr_registry.list_carriers()]


@router.put("/carriers/{carrier_id}", dependencies=[Depends(require_admin)])
async def admin_upsert_carrier(carrier_id: str, body: dict):
    """Body is a JSON object matching the `Carrier` schema. The path `carrier_id`
    overrides any value in the body to prevent rename-via-edit confusion."""
    payload = {**body, "carrier_id": carrier_id}
    try:
        carrier = Carrier.model_validate(payload)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid carrier payload: {exc}")
    saved = dr_registry.upsert_carrier(carrier)
    return saved.model_dump()


@router.delete("/carriers/{carrier_id}", dependencies=[Depends(require_admin)])
async def admin_delete_carrier(carrier_id: str):
    if not dr_registry.delete_carrier(carrier_id):
        raise HTTPException(status_code=404, detail="Carrier not found.")
    return {"deleted": carrier_id}


@router.get("/ams-targets", dependencies=[Depends(require_admin)])
async def admin_list_ams_targets():
    return [a.model_dump() for a in dr_registry.list_ams_targets()]


@router.put("/ams-targets/{ams_target_id}", dependencies=[Depends(require_admin)])
async def admin_upsert_ams_target(ams_target_id: str, body: dict):
    payload = {**body, "ams_target_id": ams_target_id}
    try:
        target = AmsTarget.model_validate(payload)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid ams_target payload: {exc}")
    saved = dr_registry.upsert_ams_target(target)
    return saved.model_dump()


@router.delete("/ams-targets/{ams_target_id}", dependencies=[Depends(require_admin)])
async def admin_delete_ams_target(ams_target_id: str):
    if not dr_registry.delete_ams_target(ams_target_id):
        raise HTTPException(status_code=404, detail="AMS target not found.")
    return {"deleted": ams_target_id}


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats", dependencies=[Depends(require_admin)])
async def get_admin_stats():
    sb = get_supabase()
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start  = (now - timedelta(days=7)).isoformat()
    active_users_cutoff = (now - timedelta(days=30)).isoformat()

    def _count(build) -> int:
        """Run a single count query, degrading to 0 on a transient/remote error.

        Each stat is independent: a hiccup talking to the self-hosted PostgREST
        gateway on one query should not 500 the whole dashboard. Errors are logged
        for visibility but never propagated.
        """
        try:
            return build().execute().count or 0
        except Exception:
            logger.exception("admin stats count query failed; defaulting to 0")
            return 0

    devices       = _count(lambda: sb.table("devices").select("id", count="exact"))
    active_dev    = _count(lambda: sb.table("devices").select("id", count="exact").eq("status", "active"))
    pending_dev   = _count(lambda: sb.table("devices").select("id", count="exact").eq("status", "pending"))
    agent_reqs    = _count(lambda: sb.table("agent_access_requests").select("id", count="exact"))
    custom_reqs   = _count(lambda: sb.table("custom_agent_requests").select("id", count="exact"))
    users_total   = _count(lambda: sb.table("users").select("id", count="exact"))
    active_users  = _count(lambda: sb.table("users").select("id", count="exact").gte("last_sign_in_at", active_users_cutoff))
    runs_today    = _count(lambda: sb.table("agent_runs").select("id", count="exact").gte("started_at", today_start))
    runs_week     = _count(lambda: sb.table("agent_runs").select("id", count="exact").gte("started_at", week_start))
    pending_appr  = _count(lambda: sb.table("agent_run_approvals").select("id", count="exact").eq("hitl_status", "pending"))

    return {
        "total_devices": devices,
        "active_devices": active_dev,
        "pending_devices": pending_dev,
        "total_agent_requests": agent_reqs + custom_reqs,
        "total_users": users_total,
        "active_users_30d": active_users,
        "total_runs_today": runs_today,
        "total_runs_week": runs_week,
        "pending_approvals": pending_appr,
    }
