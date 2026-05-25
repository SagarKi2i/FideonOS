from fastapi import APIRouter, Depends, HTTPException
from auth.dependencies import get_current_user_id, require_admin, get_device
from models.schemas import (
    DeviceRegisterRequest,
    DeviceCheckinRequest,
    DeviceStatusUpdate,
    DeviceModelAllocate,
)
from services.supabase import get_supabase
import secrets
from datetime import datetime, timezone

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("/register")
async def register_device(req: DeviceRegisterRequest):
    """Register a new device (no user auth required — called from Electron installer)."""
    sb = get_supabase()
    token = req.device_token or secrets.token_urlsafe(32)

    existing = sb.table("devices").select("id").eq("device_token", token).maybe_single().execute()
    if existing.data:
        sb.table("devices").update({
            "os_type": req.os_type,
            "app_version": req.app_version,
            "hostname": req.hostname,
            "last_seen_at": datetime.now(timezone.utc).isoformat(),
        }).eq("device_token", token).execute()
        device = sb.table("devices").select("*").eq("device_token", token).single().execute()
        return {"success": True, "device": device.data, "token": token}

    result = sb.table("devices").insert({
        "device_token": token,
        "os_type": req.os_type,
        "app_version": req.app_version,
        "hostname": req.hostname,
        "status": "pending",
    }).execute()
    return {"success": True, "device": result.data[0], "token": token}


@router.post("/checkin")
async def device_checkin(req: DeviceCheckinRequest, device=Depends(get_device)):
    """Periodic device check-in with local model status."""
    sb = get_supabase()
    sb.table("devices").update({
        "os_type": req.os_type,
        "app_version": req.app_version,
        "last_seen_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", device["id"]).execute()

    sb.table("device_sync_logs").insert({
        "device_id": device["id"],
        "sync_type": "checkin",
        "status": "success",
        "details": {"local_models": req.local_models},
    }).execute()

    return {"success": True, "message": "Check-in recorded"}


@router.get("/models")
async def get_device_models(device=Depends(get_device)):
    """Get list of models allocated to this device."""
    sb = get_supabase()
    result = (
        sb.table("user_agents")
        .select("*")
        .eq("is_active", True)
        .execute()
    )
    return {
        "success": True,
        "device_id": device["id"],
        "models": result.data,
        "total_models": len(result.data),
    }


# ── Admin endpoints ────────────────────────────────────────────────────────────

@router.get("/", dependencies=[Depends(require_admin)])
async def list_devices():
    sb = get_supabase()
    result = sb.table("devices").select("*").order("created_at", desc=True).execute()
    return result.data


@router.get("/pending", dependencies=[Depends(require_admin)])
async def list_pending_devices():
    sb = get_supabase()
    result = (
        sb.table("devices")
        .select("*")
        .eq("status", "pending")
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/{device_id}", dependencies=[Depends(require_admin)])
async def get_device_detail(device_id: str):
    sb = get_supabase()
    device = sb.table("devices").select("*").eq("id", device_id).maybe_single().execute()
    if not device.data:
        raise HTTPException(status_code=404, detail="Device not found")
    logs = (
        sb.table("device_sync_logs")
        .select("*")
        .eq("device_id", device_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return {"device": device.data, "logs": logs.data}


@router.patch("/{device_id}/status", dependencies=[Depends(require_admin)])
async def update_device_status(device_id: str, body: DeviceStatusUpdate):
    sb = get_supabase()
    result = sb.table("devices").update({"status": body.status}).eq("id", device_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Device not found")
    return result.data[0]


@router.post("/{device_id}/reset-token", dependencies=[Depends(require_admin)])
async def reset_device_token(device_id: str):
    """Regenerate the device's registration token; forces re-registration (status → pending)."""
    sb = get_supabase()
    new_token = secrets.token_urlsafe(32)
    result = (
        sb.table("devices")
        .update({"device_token": new_token, "status": "pending"})
        .eq("id", device_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"device": result.data[0], "token": new_token}


# ── Device model allocations ──────────────────────────────────────────────────

@router.get("/{device_id}/allocations", dependencies=[Depends(require_admin)])
async def list_device_allocations(device_id: str):
    """Models allocated to a device (device_model_allocations joined with the agent catalog)."""
    sb = get_supabase()
    result = (
        sb.table("device_model_allocations")
        .select("id, agent_id, model_name, notes, allocated_at, agents(keyword, name, domain)")
        .eq("device_id", device_id)
        .order("allocated_at", desc=True)
        .execute()
    )
    return result.data or []


@router.post("/{device_id}/allocations", dependencies=[Depends(require_admin)])
async def allocate_device_model(
    device_id: str,
    body: DeviceModelAllocate,
    admin_user_id: str = Depends(get_current_user_id),
):
    """Allocate an agent's model to a device."""
    sb = get_supabase()
    agent_id = str(body.agent_id)

    existing = (
        sb.table("device_model_allocations")
        .select("id")
        .eq("device_id", device_id)
        .eq("agent_id", agent_id)
        .maybe_single()
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="Model already allocated to this device.")

    result = sb.table("device_model_allocations").insert({
        "device_id": device_id,
        "agent_id": agent_id,
        "model_name": body.model_name,
        "notes": body.notes,
        "allocated_by": admin_user_id,
    }).execute()
    return result.data[0]


@router.delete("/{device_id}/allocations/{allocation_id}", dependencies=[Depends(require_admin)])
async def deallocate_device_model(device_id: str, allocation_id: str):
    sb = get_supabase()
    result = (
        sb.table("device_model_allocations")
        .delete()
        .eq("id", allocation_id)
        .eq("device_id", device_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Allocation not found")
    return {"deleted": allocation_id}


@router.get("/{device_id}/analytics", dependencies=[Depends(require_admin)])
async def get_device_analytics(device_id: str):
    """Daily usage rollup for a device (device_daily_analytics, last 30 days)."""
    sb = get_supabase()
    result = (
        sb.table("device_daily_analytics")
        .select("*")
        .eq("device_id", device_id)
        .order("date", desc=True)
        .limit(30)
        .execute()
    )
    return result.data or []
