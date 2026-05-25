from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any
import uuid
from datetime import datetime, timezone
from auth.dependencies import get_current_user_id
from models.schemas import DecisionReviewUpdate
from services.supabase import get_supabase, is_missing_table_error

# NOTE: `decision_reviews` and `training_examples` are not yet created in the
# migration set — their schema is owned by a separate workstream
# (see backend/docs/pending_tables.md). Until then, reads return empty and
# writes return 501 instead of a hard 500.
_NOT_READY = "decision_reviews/training_examples table not provisioned yet (see backend/docs/pending_tables.md)"


class TrainingExampleCreate(BaseModel):
    review_id: str | None = None
    model_id: str
    prompt: str
    original_output: str
    corrected_output: str | None = None
    rating: int | None = None
    feedback_type: str = "correction"
    metadata: dict[str, Any] = {}

router = APIRouter(prefix="/approvals", tags=["approvals"])


@router.get("/")
async def list_reviews(user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    try:
        result = (
            sb.table("decision_reviews")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as exc:
        if is_missing_table_error(exc):
            return []
        raise
    return result.data


@router.get("/{review_id}")
async def get_review(review_id: str, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    try:
        result = (
            sb.table("decision_reviews")
            .select("*")
            .eq("id", review_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        if is_missing_table_error(exc):
            raise HTTPException(status_code=501, detail=_NOT_READY)
        raise
    if not result.data:
        raise HTTPException(status_code=404, detail="Review not found")
    return result.data


@router.patch("/{review_id}")
async def update_review(
    review_id: str,
    body: DecisionReviewUpdate,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase()
    updates = body.model_dump(exclude_none=True)
    try:
        result = (
            sb.table("decision_reviews")
            .update(updates)
            .eq("id", review_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as exc:
        if is_missing_table_error(exc):
            raise HTTPException(status_code=501, detail=_NOT_READY)
        raise
    if not result.data:
        raise HTTPException(status_code=404, detail="Review not found")
    return result.data[0]


@router.post("/training-examples", status_code=201)
async def create_training_example(
    body: TrainingExampleCreate,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase()
    record = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "review_id": body.review_id,
        "model_id": body.model_id,
        "prompt": body.prompt,
        "original_output": body.original_output,
        "corrected_output": body.corrected_output,
        "rating": body.rating,
        "feedback_type": body.feedback_type,
        "metadata": body.metadata,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        result = sb.table("training_examples").insert(record).execute()
    except Exception as exc:
        if is_missing_table_error(exc):
            raise HTTPException(status_code=501, detail=_NOT_READY)
        raise
    return result.data[0] if result.data else record
