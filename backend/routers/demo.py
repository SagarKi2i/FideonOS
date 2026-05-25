from fastapi import APIRouter, Depends
from pydantic import BaseModel
from auth.dependencies import get_current_user_id
from services.supabase import get_supabase
import uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/demo", tags=["demo"])


class SeedReviewQueueRequest(BaseModel):
    wipe_first: bool = False


@router.post("/seed-review-queue")
async def seed_review_queue(
    body: SeedReviewQueueRequest,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase()
    wiped = 0

    if body.wipe_first:
        result = (
            sb.table("decision_reviews")
            .delete()
            .eq("user_id", user_id)
            .execute()
        )
        wiped = len(result.data) if result.data else 0

    sample_reviews = [
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "model_id": "quote-generator",
            "model_name": "Quote Generator",
            "decision_type": "quote",
            "input_data": {"insured": "Acme Corp", "coverage": "BOP", "premium": 4200},
            "output_data": {"recommended_carrier": "Travelers", "confidence": 0.91},
            "confidence_score": 0.91,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "model_id": "renewal-advisor",
            "model_name": "Renewal Advisor",
            "decision_type": "renewal",
            "input_data": {"policy_number": "POL-2024-0042", "expiry": "2025-06-30"},
            "output_data": {"action": "renew", "notes": "No adverse loss history"},
            "confidence_score": 0.87,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "model_id": "claims-triage",
            "model_name": "Claims Triage",
            "decision_type": "claim",
            "input_data": {"claim_id": "CLM-9981", "amount": 12500, "type": "property"},
            "output_data": {"severity": "medium", "fast_track": False},
            "confidence_score": 0.78,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    ]

    sb.table("decision_reviews").insert(sample_reviews).execute()

    return {
        "workflows_created": 0,
        "reviews_created": len(sample_reviews),
        "wiped": wiped,
    }
