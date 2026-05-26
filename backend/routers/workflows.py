from fastapi import APIRouter, Depends, HTTPException
# pyrefly: ignore [missing-import]
from auth.dependencies import get_current_user_id
from models.schemas import WorkflowCreate, WorkflowUpdate, WorkflowRunCreate
from services.supabase import get_supabase

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.get("/")
async def list_workflows(user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = (
        sb.table("workflows")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.post("/")
async def create_workflow(body: WorkflowCreate, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = sb.table("workflows").insert({
        "user_id": user_id,
        "name": body.name,
        "description": body.description,
        "definition": body.definition,
        "is_active": True,
    }).execute()
    return result.data[0]


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = (
        sb.table("workflows")
        .select("*")
        .eq("id", workflow_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return result.data


@router.patch("/{workflow_id}")
async def update_workflow(
    workflow_id: str,
    body: WorkflowUpdate,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase()
    updates = body.model_dump(exclude_none=True)
    result = (
        sb.table("workflows")
        .update(updates)
        .eq("id", workflow_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return result.data[0]


@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: str, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    sb.table("workflows").delete().eq("id", workflow_id).eq("user_id", user_id).execute()
    return {"success": True}


# ── Workflow Runs ──────────────────────────────────────────────────────────────

@router.post("/{workflow_id}/runs")
async def create_run(
    workflow_id: str,
    body: WorkflowRunCreate,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase()
    result = sb.table("workflow_runs").insert({
        "workflow_id": workflow_id,
        "user_id": user_id,
        "status": "pending",
        "inputs": body.inputs,
    }).execute()
    return result.data[0]


@router.get("/{workflow_id}/runs")
async def list_runs(workflow_id: str, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = (
        sb.table("workflow_runs")
        .select("*")
        .eq("workflow_id", workflow_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data
