from fastapi import APIRouter, Depends, HTTPException
from auth.dependencies import get_device
from models.schemas import FeedbackSubmit, TrainingJobCreate, GradientSubmit
from services.supabase import get_supabase
from datetime import datetime, timezone

router = APIRouter(prefix="/training", tags=["training"])


@router.post("/feedback")
async def submit_feedback(body: FeedbackSubmit, device=Depends(get_device)):
    sb = get_supabase()
    result = sb.table("training_feedback").insert({
        "device_id": device["id"],
        "model_id": body.model_id,
        "prompt": body.prompt,
        "original_response": body.original_response,
        "corrected_response": body.corrected_response,
        "rating": body.rating,
        "feedback_type": body.feedback_type,
        "is_used_for_training": False,
    }).execute()
    return {"success": True, "feedback_id": result.data[0]["id"]}


@router.get("/feedback")
async def get_feedback(
    model_id: str | None = None,
    unused: bool = False,
    device=Depends(get_device),
):
    sb = get_supabase()
    query = sb.table("training_feedback").select("*").eq("device_id", device["id"])
    if model_id:
        query = query.eq("model_id", model_id)
    if unused:
        query = query.eq("is_used_for_training", False)
    result = query.order("created_at", desc=True).execute()
    return {"success": True, "feedback": result.data}


@router.post("/jobs")
async def create_training_job(body: TrainingJobCreate, device=Depends(get_device)):
    sb = get_supabase()
    result = sb.table("training_jobs").insert({
        "device_id": device["id"],
        "model_id": body.model_id,
        "training_type": body.training_type,
        "config": body.config,
        "status": "pending",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    return {"success": True, "job": result.data[0]}


@router.get("/jobs")
async def get_training_jobs(device=Depends(get_device)):
    sb = get_supabase()
    result = (
        sb.table("training_jobs")
        .select("*")
        .eq("device_id", device["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return {"success": True, "jobs": result.data}


@router.patch("/jobs/{job_id}")
async def update_training_job(job_id: str, body: dict, device=Depends(get_device)):
    sb = get_supabase()
    result = (
        sb.table("training_jobs")
        .update(body)
        .eq("id", job_id)
        .eq("device_id", device["id"])
        .execute()
    )
    return {"success": True}


# ── Federated Learning ────────────────────────────────────────────────────────

@router.get("/federated/rounds")
async def get_active_rounds(device=Depends(get_device)):
    sb = get_supabase()
    rounds = (
        sb.table("federated_rounds")
        .select("*")
        .eq("status", "active")
        .execute()
    )
    contributions = (
        sb.table("federated_contributions")
        .select("model_id, round_number, status, submitted_at")
        .eq("device_id", device["id"])
        .execute()
    )
    return {"success": True, "rounds": rounds.data, "contributions": contributions.data}


@router.post("/federated/gradient")
async def submit_gradient(body: GradientSubmit, device=Depends(get_device)):
    sb = get_supabase()
    result = sb.table("federated_contributions").insert({
        "device_id": device["id"],
        "model_id": body.model_id,
        "round_number": body.round_number,
        "gradient_hash": body.gradient_hash,
        "gradient_size_bytes": body.gradient_size_bytes,
        "metrics": body.metrics,
        "privacy_noise_added": body.privacy_noise_added,
        "status": "submitted",
    }).execute()
    return {"success": True, "update_id": result.data[0]["id"]}


@router.get("/stats")
async def get_stats(device=Depends(get_device)):
    sb = get_supabase()
    fb = sb.table("training_feedback").select("id", count="exact").eq("device_id", device["id"]).execute()
    jobs = sb.table("training_jobs").select("id", count="exact").eq("device_id", device["id"]).execute()
    contribs = sb.table("federated_contributions").select("id", count="exact").eq("device_id", device["id"]).execute()
    return {
        "success": True,
        "stats": {
            "total_feedback": fb.count or 0,
            "total_training_jobs": jobs.count or 0,
            "total_contributions": contribs.count or 0,
        },
    }
