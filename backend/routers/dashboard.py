from fastapi import APIRouter, Depends
from auth.dependencies import get_current_user_id
from services.supabase import get_supabase, is_missing_table_error
from services.agent_stats import empty_summary
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# Window of raw runs scanned to compute the operations-dashboard aggregates.
# Kept bounded so the call stays O(1)-ish; promote to a DB view if it grows.
_RUN_SCAN_DAYS = 7
_RUN_SCAN_LIMIT = 500
_RECENT_RUNS_SHOWN = 8


def _parse_iso(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _ui_status(raw: str) -> str:
    """Map backend agent_runs.status (running|complete|failed) → UI vocabulary."""
    return {
        "complete": "succeeded",
        "running": "running",
        "failed": "failed",
    }.get(raw or "", "running")


@router.get("/overview")
async def get_dashboard_overview(user_id: str = Depends(get_current_user_id)):
    """User "mission control" dashboard — fully aggregated server-side.

    Returns the activated agents, headline KPIs, the recent run feed and an
    activity feed in a single call so the frontend needs zero direct DB access.
    """
    sb = get_supabase()
    now = datetime.now(timezone.utc)

    # ── Activated agents (the user's pods) ─────────────────────────────────────
    agents_out: list[dict] = []
    try:
        ua = (
            sb.table("user_agents")
            .select(
                "id, agent_id, activated_at,"
                "user_agent_stats(stats, updated_at),"
                "agents(keyword, name, domain, tagline, icon_asset_file_name)"
            )
            .eq("user_id", user_id)
            .eq("is_active", True)
            .order("activated_at", desc=True)
            .execute()
        )
        for row in (ua.data or []):
            agent = row.get("agents") or {}
            ua_stats = row.get("user_agent_stats") or {}
            if isinstance(ua_stats, list):
                ua_stats = ua_stats[0] if ua_stats else {}
            stats_blob = ua_stats.get("stats") or {}
            summary = stats_blob.get("summary") or empty_summary()
            agents_out.append({
                "id": row.get("id"),
                "agent_id": row.get("agent_id"),
                "keyword": agent.get("keyword"),
                "name": agent.get("name"),
                "domain": agent.get("domain"),
                "tagline": agent.get("tagline"),
                "icon_asset_file_name": agent.get("icon_asset_file_name"),
                "activated_at": row.get("activated_at"),
                "stats": stats_blob,
                "summary": summary,
            })
    except Exception as exc:
        if not is_missing_table_error(exc):
            raise

    # ── Raw runs window (drives KPIs + run feed + activity) ────────────────────
    runs: list[dict] = []
    try:
        result = (
            sb.table("agent_runs")
            .select("id, agent_id, status, started_at, finished_at, confidence, activity,"
                    "agents(keyword, name, domain)")
            .eq("user_id", user_id)
            .gte("started_at", (now - timedelta(days=_RUN_SCAN_DAYS)).isoformat())
            .order("started_at", desc=True)
            .limit(_RUN_SCAN_LIMIT)
            .execute()
        )
        runs = result.data or []
    except Exception as exc:
        if not is_missing_table_error(exc):
            raise

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    runs_today = runs_week = succeeded = finished = 0
    latency_total = 0.0
    latency_count = 0

    for run in runs:
        started = _parse_iso(run.get("started_at"))
        if started:
            runs_week += 1
            if started >= today_start:
                runs_today += 1
        status = run.get("status")
        if status in ("complete", "failed"):
            finished += 1
            if status == "complete":
                succeeded += 1
        finished_at = _parse_iso(run.get("finished_at"))
        if started and finished_at:
            latency_total += max(0.0, (finished_at - started).total_seconds())
            latency_count += 1

    success_rate = round((succeeded / finished) * 100, 1) if finished else 0.0
    avg_latency_seconds = round(latency_total / latency_count, 2) if latency_count else 0.0

    # ── Recent run feed (run monitor) ──────────────────────────────────────────
    recent_runs: list[dict] = []
    for run in runs[:_RECENT_RUNS_SHOWN]:
        agent = run.get("agents") or {}
        started = _parse_iso(run.get("started_at"))
        finished_at = _parse_iso(run.get("finished_at"))
        duration_seconds = None
        if started and finished_at:
            duration_seconds = max(0, int((finished_at - started).total_seconds()))
        recent_runs.append({
            "id": run.get("id"),
            "agent_keyword": agent.get("keyword"),
            "agent_name": agent.get("name"),
            "status": _ui_status(run.get("status")),
            "started_at": run.get("started_at"),
            "finished_at": run.get("finished_at"),
            "duration_seconds": duration_seconds,
            "confidence": run.get("confidence"),
        })

    run_counts = {
        "all": len(recent_runs),
        "running": sum(1 for r in recent_runs if r["status"] == "running"),
        "succeeded": sum(1 for r in recent_runs if r["status"] == "succeeded"),
        "failed": sum(1 for r in recent_runs if r["status"] == "failed"),
    }

    # ── Activity feed (derived from recent runs' activity payloads) ────────────
    activity: list[dict] = []
    for run in runs[:_RECENT_RUNS_SHOWN]:
        agent = run.get("agents") or {}
        act = run.get("activity") or {}
        summary = None
        if isinstance(act, dict):
            summary = act.get("summary") or act.get("message") or act.get("title")
        if not summary:
            summary = f"Run {_ui_status(run.get('status'))}"
        activity.append({
            "run_id": run.get("id"),
            "agent_keyword": agent.get("keyword"),
            "agent_name": agent.get("name"),
            "text": summary,
            "status": "error" if run.get("status") == "failed" else "success",
            "at": run.get("finished_at") or run.get("started_at"),
        })

    return {
        "kpis": {
            "active_agents": len(agents_out),
            "runs_today": runs_today,
            "runs_week": runs_week,
            "success_rate": success_rate,
            "avg_latency_seconds": avg_latency_seconds,
        },
        "agents": agents_out,
        "recent_runs": recent_runs,
        "run_counts": run_counts,
        "activity": activity,
    }
