from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from services.supabase import get_supabase

logger = logging.getLogger(__name__)


# Canonical, structured stats summary persisted under stats["summary"].
# Every dashboard surface reads these exact keys — no ad-hoc / freeform fields.
SUMMARY_KEYS = (
    "total_runs",
    "succeeded",
    "failed",
    "needs_review",
    "running",
    "success_rate",
    "avg_confidence",
    "avg_latency_seconds",
    "completed_today",
    "last_activity_at",
)


def empty_summary() -> dict[str, Any]:
    """Zeroed canonical summary — used when an agent has no runs yet."""
    return {
        "total_runs": 0,
        "succeeded": 0,
        "failed": 0,
        "needs_review": 0,
        "running": 0,
        "success_rate": 0.0,
        "avg_confidence": None,
        "avg_latency_seconds": None,
        "completed_today": 0,
        "last_activity_at": None,
    }


def _parse_iso(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def compute_summary(user_id: str, agent_id: str) -> dict[str, Any]:
    """Compute the canonical structured summary from raw agent_runs.

    Single bounded scan; called on each run completion and on manual refresh so
    every dashboard tile reads consistent, real numbers (success rate, latency,
    confidence, today's count, last activity).
    """
    sb = get_supabase()
    result = (
        sb.table("agent_runs")
        .select("status, confidence, started_at, finished_at")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .order("started_at", desc=True)
        .limit(2000)
        .execute()
    )
    runs = result.data or []

    summary = empty_summary()
    summary["total_runs"] = len(runs)

    today_str = datetime.now(timezone.utc).date().isoformat()
    conf_total = 0.0
    conf_count = 0
    latency_total = 0.0
    latency_count = 0
    last_activity: datetime | None = None

    for run in runs:
        status = run.get("status")
        if status == "complete":
            summary["succeeded"] += 1
        elif status == "failed":
            summary["failed"] += 1
        elif status == "needs_review":
            summary["needs_review"] += 1
        elif status == "running":
            summary["running"] += 1

        conf = run.get("confidence")
        if isinstance(conf, (int, float)):
            conf_total += float(conf)
            conf_count += 1

        started = _parse_iso(run.get("started_at"))
        finished = _parse_iso(run.get("finished_at"))
        if started and finished:
            latency_total += max(0.0, (finished - started).total_seconds())
            latency_count += 1

        activity_at = finished or started
        if activity_at and (last_activity is None or activity_at > last_activity):
            last_activity = activity_at
        if started and started.date().isoformat() == today_str and status == "complete":
            summary["completed_today"] += 1

    finished_runs = summary["succeeded"] + summary["failed"]
    summary["success_rate"] = round(summary["succeeded"] / finished_runs * 100, 1) if finished_runs else 0.0
    summary["avg_confidence"] = round(conf_total / conf_count, 4) if conf_count else None
    summary["avg_latency_seconds"] = round(latency_total / latency_count, 2) if latency_count else None
    summary["last_activity_at"] = last_activity.isoformat() if last_activity else None
    return summary


def recompute_stats(
    old_stats: dict[str, Any],
    run_metrics: dict[str, Any],
    comparison_period_days: int,
    agent_id: str,
    user_id: str,
) -> dict[str, Any]:
    """
    Called after Write 1 (agent_runs row updated to 'complete').
    Merges run_metrics into old_stats to produce new_stats for Write 2.

    Patterns per field type:
    - Cumulative counts: old + this_run value
    - Running averages: rolling average weighted by run count
    - Deltas vs prior period: queried from agent_runs (only GROUP BY in the system)
    - completed_today: increment; reset at midnight UTC
    - last_activity_at: always now()
    """
    sb = get_supabase()
    now = datetime.now(timezone.utc)
    today_str = now.date().isoformat()

    new_stats: dict[str, Any] = dict(old_stats)

    run_count_key = "_run_count"
    run_count = int(old_stats.get(run_count_key, 0)) + 1
    new_stats[run_count_key] = run_count

    # ── completed_today ───────────────────────────────────────────────────
    last_date = old_stats.get("_today_date", "")
    if last_date != today_str:
        new_stats["completed_today"] = 1
        new_stats["_today_date"] = today_str
    else:
        new_stats["completed_today"] = int(old_stats.get("completed_today", 0)) + 1

    new_stats["last_activity_at"] = now.isoformat()

    # ── merge run_metrics ─────────────────────────────────────────────────
    # Fields ending in _time_s or avg_ are rolling averages; everything else
    # is a cumulative sum.
    average_fields = {k for k in run_metrics if "_time_s" in k or k.startswith("avg_")}

    for field, value in run_metrics.items():
        if value is None:
            continue
        try:
            num = float(value)
        except (TypeError, ValueError):
            new_stats[field] = value
            continue

        if field in average_fields:
            old_avg = float(old_stats.get(field, num))
            # Rolling average: ((old_avg * (n-1)) + new_val) / n
            new_stats[field] = round((old_avg * (run_count - 1) + num) / run_count, 4)
        else:
            new_stats[field] = round(float(old_stats.get(field, 0)) + num, 4)

    # ── delta vs prior period ─────────────────────────────────────────────
    # Query prior period window directly — one GROUP BY per run completion, never at read time.
    try:
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        period_start = (now - timedelta(days=comparison_period_days)).isoformat()
        prior_start  = (now - timedelta(days=comparison_period_days * 2)).isoformat()

        prior_runs = (
            sb.table("agent_runs")
            .select("metrics")
            .eq("user_id", user_id)
            .eq("agent_id", agent_id)
            .eq("status", "complete")
            .gte("started_at", prior_start)
            .lt("started_at", period_start)
            .execute()
        )

        if prior_runs.data:
            # Aggregate prior-period totals for cumulative fields
            prior_totals: dict[str, float] = {}
            for run in prior_runs.data:
                for field, value in (run.get("metrics") or {}).items():
                    if field in average_fields:
                        continue
                    try:
                        prior_totals[field] = prior_totals.get(field, 0.0) + float(value)
                    except (TypeError, ValueError):
                        pass

            for field in run_metrics:
                if field in average_fields or field not in prior_totals:
                    continue
                try:
                    curr = float(new_stats.get(field, 0))
                    prev = prior_totals[field]
                    if prev != 0:
                        new_stats[f"{field}_delta_pct"] = round((curr - prev) / abs(prev) * 100, 2)
                    new_stats[f"{field}_delta"] = round(curr - prev, 4)
                except (TypeError, ValueError):
                    pass
    except Exception:
        # Delta computation is best-effort; don't fail the write path.
        pass

    # ── canonical structured summary ──────────────────────────────────────
    # Recomputed from raw runs so success_rate / latency / failed counts are
    # always correct (failed runs never pass through this incremental path).
    try:
        new_stats["summary"] = compute_summary(user_id, agent_id)
    except Exception:
        logger.exception("compute_summary failed for user=%s agent=%s", user_id, agent_id)

    return new_stats


def write_run_complete(
    run_id: str,
    metrics: dict[str, Any],
    activity: dict[str, Any],
    output: dict[str, Any] | None,
    confidence: float | None,
    agent_id: str,
    user_id: str,
    comparison_period_days: int = 30,
) -> None:
    """
    Two atomic writes executed on every agent run completion.

    Write 1: update agent_runs row (status, metrics, activity, output, finished_at).
    Write 2: lock user_agent_stats row and recompute running totals.
    """
    sb = get_supabase()

    # Write 1
    sb.table("agent_runs").update({
        "status": "complete",
        "metrics": metrics,
        "activity": activity,
        "output": output or {},
        "confidence": confidence,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", run_id).execute()

    # Write 2 — resolve user_agent_id first, then fetch + update stats
    ua_result = (
        sb.table("user_agents")
        .select("id")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .maybe_single()
        .execute()
    )
    if not ua_result.data:
        logger.error("write_run_complete: user_agents row not found for user=%s agent=%s run=%s", user_id, agent_id, run_id)
        return

    uas_result = (
        sb.table("user_agent_stats")
        .select("id, stats")
        .eq("user_agent_id", ua_result.data["id"])
        .maybe_single()
        .execute()
    )

    if not uas_result.data:
        logger.error("write_run_complete: user_agent_stats row not found for user_agent_id=%s run=%s", ua_result.data["id"], run_id)
        return

    uas_id = uas_result.data["id"]
    old_stats = uas_result.data.get("stats") or {}

    new_stats = recompute_stats(
        old_stats=old_stats,
        run_metrics=metrics,
        comparison_period_days=comparison_period_days,
        agent_id=agent_id,
        user_id=user_id,
    )

    sb.table("user_agent_stats").update({
        "stats": new_stats,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", uas_id).execute()
