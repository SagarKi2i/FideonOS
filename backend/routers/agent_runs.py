from fastapi import APIRouter, Depends, HTTPException, Query
from auth.dependencies import get_current_user_id, get_device
from models.schemas import AgentRunTrigger, AgentRunApproval
from services.supabase import get_supabase
from services.agent_stats import write_run_complete
from datetime import datetime, timedelta, timezone

router = APIRouter(tags=["agent-runs"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _normalize_confidence(value):
    """Coerce an incoming confidence to the canonical 0–1 scale.

    The DB enforces 0 ≤ confidence ≤ 1 (migration 20260524010000). A worker that
    emits a 0–100 percentage is rescaled rather than rejected; clamp the rest.
    """
    if value is None:
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    if num > 1:
        num = num / 100.0
    return max(0.0, min(1.0, num))


def _resolve_agent(keyword: str):
    """Resolve agent keyword → UUID. Raises 404 if not found."""
    sb = get_supabase()
    result = sb.table("agents").select("id, keyword").eq("keyword", keyword).maybe_single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail=f"Agent '{keyword}' not found.")
    return result.data


def _assert_user_has_agent(user_id: str, agent_id: str) -> dict:
    """Return user_agents row or 403."""
    sb = get_supabase()
    ua = (
        sb.table("user_agents")
        .select("id, is_active, current_version_id")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .maybe_single()
        .execute()
    )
    if not ua.data or not ua.data.get("is_active"):
        raise HTTPException(status_code=403, detail="Agent not activated for this user.")
    return ua.data


def _get_user_agent_id(user_id: str, agent_id: str) -> str:
    """Return user_agents.id or raise 404. Use after _assert_user_has_agent."""
    sb = get_supabase()
    ua = (
        sb.table("user_agents")
        .select("id")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .maybe_single()
        .execute()
    )
    if not ua.data:
        raise HTTPException(status_code=404, detail="User agent record not found.")
    return ua.data["id"]


# ── Agent routes (/{agent_keyword}/*) ─────────────────────────────────────────

@router.get("/agents/{agent_keyword}/dashboard")
async def get_agent_dashboard(
    agent_keyword: str,
    user_id: str = Depends(get_current_user_id),
):
    """Q1 — Full dashboard: stats + widget config. Single JOIN, no aggregation."""
    sb = get_supabase()
    agent = _resolve_agent(agent_keyword)
    agent_id = agent["id"]
    _assert_user_has_agent(user_id, agent_id)

    result = (
        sb.table("user_agents")
        .select(
            "id, agent_id, current_version_id, is_active, activated_at,"
            "user_agent_stats(stats, updated_at),"
            "agents(keyword, name, domain, tagline, icon_asset_file_name),"
            "agent_dashboard_templates(widgets, tabs, comparison_period_days)"
        )
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Dashboard not found.")
    return result.data


@router.get("/agents/{agent_keyword}/stats")
async def get_agent_stats(
    agent_keyword: str,
    user_id: str = Depends(get_current_user_id),
):
    """Q2 — KPI tile refresh. Always O(1) — no GROUP BY."""
    sb = get_supabase()
    agent = _resolve_agent(agent_keyword)
    agent_id = agent["id"]
    _assert_user_has_agent(user_id, agent_id)

    ua_id = _get_user_agent_id(user_id, agent_id)
    result = (
        sb.table("user_agent_stats")
        .select("stats, updated_at")
        .eq("user_agent_id", ua_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Stats not found.")

    tpl = (
        sb.table("agent_dashboard_templates")
        .select("widgets, comparison_period_days")
        .eq("agent_id", agent_id)
        .maybe_single()
        .execute()
    )
    return {
        "stats": result.data.get("stats", {}),
        "updated_at": result.data.get("updated_at"),
        "widgets": tpl.data.get("widgets", []) if tpl.data else [],
        "comparison_period_days": tpl.data.get("comparison_period_days", 30) if tpl.data else 30,
    }


@router.post("/agents/{agent_keyword}/stats/refresh")
async def refresh_agent_stats(
    agent_keyword: str,
    user_id: str = Depends(get_current_user_id),
):
    """Recompute pre-aggregated stats from raw agent_runs. Expensive — call sparingly."""
    sb = get_supabase()
    agent = _resolve_agent(agent_keyword)
    agent_id = agent["id"]
    _assert_user_has_agent(user_id, agent_id)

    runs = (
        sb.table("agent_runs")
        .select("metrics")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .eq("status", "complete")
        .execute()
    )

    from services.agent_stats import recompute_stats
    tpl = (
        sb.table("agent_dashboard_templates")
        .select("comparison_period_days")
        .eq("agent_id", agent_id)
        .maybe_single()
        .execute()
    )
    period = tpl.data.get("comparison_period_days", 30) if tpl.data else 30

    merged: dict = {}
    for run in (runs.data or []):
        merged = recompute_stats(merged, run.get("metrics") or {}, period, agent_id, user_id)

    ua_id = _get_user_agent_id(user_id, agent_id)
    sb.table("user_agent_stats").update({
        "stats": merged,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("user_agent_id", ua_id).execute()

    return {"refreshed": True, "stats": merged}


@router.get("/agents/{agent_keyword}/runs")
async def list_agent_runs(
    agent_keyword: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
):
    """Q3 — Activity tab. Paginated. Lazy — fires on tab click only."""
    sb = get_supabase()
    agent = _resolve_agent(agent_keyword)
    agent_id = agent["id"]
    _assert_user_has_agent(user_id, agent_id)

    result = (
        sb.table("agent_runs")
        .select("id, activity, metrics, status, started_at, finished_at, confidence, version_used")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .order("started_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return result.data or []


@router.post("/agents/{agent_keyword}/runs")
async def trigger_agent_run(
    agent_keyword: str,
    body: AgentRunTrigger,
    user_id: str = Depends(get_current_user_id),
):
    """Trigger a new agent run. Returns run_id for SSE polling."""
    sb = get_supabase()
    agent = _resolve_agent(agent_keyword)
    agent_id = agent["id"]
    ua = _assert_user_has_agent(user_id, agent_id)

    result = sb.table("agent_runs").insert({
        "user_id": user_id,
        "agent_id": agent_id,
        "version_used": ua.get("current_version_id"),
        "status": "running",
        "input": body.input,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create run.")
    return {"run_id": result.data[0]["id"]}


@router.get("/agents/{agent_keyword}/breakdown")
async def get_agent_breakdown(
    agent_keyword: str,
    user_id: str = Depends(get_current_user_id),
):
    """Q4 — Breakdown tab. Lazy — fires on tab click only."""
    sb = get_supabase()
    agent = _resolve_agent(agent_keyword)
    agent_id = agent["id"]
    _assert_user_has_agent(user_id, agent_id)

    result = (
        sb.table("agent_runs")
        .select("metrics, started_at, status")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .eq("status", "complete")
        .gte("started_at", (datetime.now(timezone.utc) - timedelta(days=30)).isoformat())
        .order("started_at", desc=True)
        .execute()
    )
    return result.data or []


@router.get("/agents/{agent_keyword}/narrative")
async def get_agent_narrative(
    agent_keyword: str,
    user_id: str = Depends(get_current_user_id),
):
    """Q5 — AI Insights tab. Lazy — narrative (~2-3 KB) never returned on dashboard load."""
    sb = get_supabase()
    agent = _resolve_agent(agent_keyword)
    agent_id = agent["id"]
    _assert_user_has_agent(user_id, agent_id)

    ua_id = _get_user_agent_id(user_id, agent_id)
    result = (
        sb.table("user_agent_stats")
        .select("stats, updated_at")
        .eq("user_agent_id", ua_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Narrative not found.")
    stats = result.data.get("stats") or {}
    return {"narrative": stats.get("narrative"), "updated_at": result.data.get("updated_at")}


@router.get("/agents/{agent_keyword}/trends")
async def get_agent_trends(
    agent_keyword: str,
    user_id: str = Depends(get_current_user_id),
):
    """Q7 — Trends tab. 90-day daily rollup. Lazy — fires on tab click only."""
    sb = get_supabase()
    agent = _resolve_agent(agent_keyword)
    agent_id = agent["id"]
    _assert_user_has_agent(user_id, agent_id)

    result = (
        sb.table("agent_runs")
        .select("started_at, metrics, status")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .eq("status", "complete")
        .gte("started_at", (datetime.now(timezone.utc) - timedelta(days=90)).isoformat())
        .order("started_at", desc=True)
        .execute()
    )
    # Aggregate client-side to avoid per-agent SQL GROUP BY complexity.
    # For large datasets, promote this to a DB view.
    from collections import defaultdict
    daily: dict = defaultdict(lambda: {"runs": 0, "metrics": {}})
    for run in (result.data or []):
        day = (run.get("started_at") or "")[:10]
        daily[day]["runs"] += 1
        for k, v in (run.get("metrics") or {}).items():
            try:
                daily[day]["metrics"][k] = daily[day]["metrics"].get(k, 0) + float(v)
            except (TypeError, ValueError):
                pass
    return [{"day": d, **v} for d, v in sorted(daily.items(), reverse=True)]


@router.get("/agents/{agent_keyword}/versions")
async def get_agent_versions(
    agent_keyword: str,
    user_id: str = Depends(get_current_user_id),
):
    """Agent version history for this agent."""
    sb = get_supabase()
    agent = _resolve_agent(agent_keyword)
    agent_id = agent["id"]
    _assert_user_has_agent(user_id, agent_id)

    result = (
        sb.table("agent_versions")
        .select("id, version, is_active, created_at, input_schema, output_schema")
        .eq("agent_id", agent_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


# ── Run detail routes (/runs/{run_id}/*) ──────────────────────────────────────

@router.get("/runs/{run_id}")
async def get_run(run_id: str, user_id: str = Depends(get_current_user_id)):
    """Q6 — Full run detail: input, output, metrics."""
    sb = get_supabase()
    result = (
        sb.table("agent_runs")
        .select("*, agent_versions(version, input_schema, output_schema)")
        .eq("id", run_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Run not found.")
    return result.data


@router.get("/runs/{run_id}/status")
async def get_run_status(run_id: str, user_id: str = Depends(get_current_user_id)):
    """Poll run status."""
    sb = get_supabase()
    result = (
        sb.table("agent_runs")
        .select("id, status, started_at, finished_at, confidence")
        .eq("id", run_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Run not found.")
    return result.data


@router.post("/runs/{run_id}/result")
async def submit_run_result(
    run_id: str,
    body: dict,
    device: dict = Depends(get_device),
):
    """GPU/RunPod worker submits output + metrics. Triggers write path (Write 1 + Write 2)."""
    sb = get_supabase()
    run = (
        sb.table("agent_runs")
        .select("id, agent_id, user_id")
        .eq("id", run_id)
        .maybe_single()
        .execute()
    )
    if not run.data:
        raise HTTPException(status_code=404, detail="Run not found.")

    tpl = (
        sb.table("agent_dashboard_templates")
        .select("comparison_period_days")
        .eq("agent_id", run.data["agent_id"])
        .maybe_single()
        .execute()
    )
    period = tpl.data.get("comparison_period_days", 30) if tpl.data else 30

    write_run_complete(
        run_id=run_id,
        metrics=body.get("metrics", {}),
        activity=body.get("activity", {}),
        output=body.get("output"),
        confidence=_normalize_confidence(body.get("confidence")),
        agent_id=run.data["agent_id"],
        user_id=run.data["user_id"],
        comparison_period_days=period,
    )
    return {"written": True}


@router.patch("/runs/{run_id}")
async def update_run(run_id: str, body: dict, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    allowed = {"human_in_the_loop", "updated_at"}
    updates = {k: v for k, v in body.items() if k in allowed}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = sb.table("agent_runs").update(updates).eq("id", run_id).eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Run not found.")
    return result.data[0]


@router.patch("/runs/{run_id}/metrics")
async def correct_run_metrics(run_id: str, body: dict, user_id: str = Depends(get_current_user_id)):
    """Correct metrics after human review."""
    sb = get_supabase()
    result = sb.table("agent_runs").update({
        "metrics": body,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", run_id).eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Run not found.")
    return result.data[0]


@router.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: str, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = sb.table("agent_runs").update({
        "status": "failed",
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", run_id).eq("user_id", user_id).eq("status", "running").execute()
    return {"cancelled": bool(result.data)}


@router.post("/runs/{run_id}/retry")
async def retry_run(run_id: str, user_id: str = Depends(get_current_user_id)):
    """Retry a failed run by cloning its input into a new run row."""
    sb = get_supabase()
    old = (
        sb.table("agent_runs")
        .select("agent_id, version_used, input")
        .eq("id", run_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not old.data:
        raise HTTPException(status_code=404, detail="Run not found.")
    new_run = sb.table("agent_runs").insert({
        "user_id": user_id,
        "agent_id": old.data["agent_id"],
        "version_used": old.data["version_used"],
        "status": "running",
        "input": old.data.get("input", {}),
        "started_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    return {"run_id": new_run.data[0]["id"]}


@router.post("/runs/{run_id}/approve")
async def approve_run(
    run_id: str,
    body: AgentRunApproval,
    user_id: str = Depends(get_current_user_id),
):
    """HITL approval decision."""
    sb = get_supabase()
    run = (
        sb.table("agent_runs")
        .select("id")
        .eq("id", run_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not run.data:
        raise HTTPException(status_code=404, detail="Run not found.")

    existing = (
        sb.table("agent_run_approvals")
        .select("id")
        .eq("run_id", run_id)
        .maybe_single()
        .execute()
    )
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "hitl_status": body.decision,
        "decision": body.decision,
        "reviewer_id": user_id,
        "reviewed_at": now_iso,
        "notes": body.notes,
        "updated_at": now_iso,
    }
    if existing.data:
        sb.table("agent_run_approvals").update(payload).eq("id", existing.data["id"]).execute()
    else:
        sb.table("agent_run_approvals").insert({
            "run_id": run_id,
            "user_id": user_id,
            **payload,
        }).execute()

    sb.table("agent_runs").update({"human_in_the_loop": True, "updated_at": now_iso}).eq("id", run_id).execute()
    return {"approved": True, "decision": body.decision}


@router.get("/runs/{run_id}/comments")
async def list_run_comments(run_id: str, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = (
        sb.table("agent_run_approvals")
        .select("id, notes, decision, reviewer_id, reviewed_at, hitl_status")
        .eq("run_id", run_id)
        .eq("user_id", user_id)
        .execute()
    )
    return result.data or []


@router.post("/runs/{run_id}/comments")
async def add_run_comment(
    run_id: str,
    body: dict,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase()
    result = sb.table("agent_run_approvals").insert({
        "run_id": run_id,
        "user_id": user_id,
        "notes": body.get("notes", ""),
        "hitl_status": "pending",
    }).execute()
    return result.data[0]
