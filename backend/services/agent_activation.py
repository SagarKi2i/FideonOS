"""Shared agent-activation logic.

Activating an agent for a user is the same operation whether it is triggered by:
  - the user (POST /api/agents),
  - an admin allocating directly (POST /api/admin/users/{id}/models), or
  - an admin approving an access request (PATCH /api/admin/agent-requests/{id}).

All three upsert a `user_agents` row and ensure a `user_agent_stats` row exists.
Keep that logic here so it does not drift between routers.
"""
from datetime import datetime, timezone

from fastapi import HTTPException


def activate_user_agent(
    sb,
    user_id: str,
    agent_id: str,
    model_name: str,
    domain: str,
    *,
    conflict_if_active: bool = False,
) -> str:
    """Activate `agent_id` for `user_id`. Returns the user_agents row id (ua_id).

    Reactivates an existing (deactivated) row, or inserts a new one. Ensures a
    user_agent_stats row exists. Set `conflict_if_active=True` to raise 409 when
    the agent is already active for the user (admin direct-allocation case).
    """
    agent_id = str(agent_id)
    now = datetime.now(timezone.utc).isoformat()

    existing = (
        sb.table("user_agents")
        .select("id, is_active")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .maybe_single()
        .execute()
    )
    if existing.data:
        if conflict_if_active and existing.data.get("is_active"):
            raise HTTPException(status_code=409, detail="Agent already allocated to this user.")
        sb.table("user_agents").update(
            {"is_active": True, "updated_at": now}
        ).eq("id", existing.data["id"]).execute()
        ua_id = existing.data["id"]
    else:
        agent = (
            sb.table("agents")
            .select("current_version_id")
            .eq("id", agent_id)
            .maybe_single()
            .execute()
        )
        if not agent.data:
            raise HTTPException(status_code=404, detail="Agent not found.")
        ua_result = sb.table("user_agents").insert({
            "user_id": user_id,
            "agent_id": agent_id,
            "current_version_id": agent.data.get("current_version_id"),
            "model_name": model_name,
            "domain": domain,
            "is_active": True,
            "activated_at": now,
        }).execute()
        ua_id = ua_result.data[0]["id"]

    uas = (
        sb.table("user_agent_stats")
        .select("id")
        .eq("user_agent_id", ua_id)
        .maybe_single()
        .execute()
    )
    if not uas.data:
        from services.agent_stats import empty_summary
        sb.table("user_agent_stats").insert(
            {"user_agent_id": ua_id, "stats": {"summary": empty_summary()}}
        ).execute()

    return ua_id
