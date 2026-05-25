from fastapi import APIRouter, Depends
from auth.dependencies import get_current_user_id, require_admin
from models.schemas import CarrierConnectionUpsert, AmsConnectionUpsert
from services.supabase import get_supabase

router = APIRouter(prefix="/settings", tags=["settings"])

# Carrier / AMS connections are GLOBAL and ADMIN-MANAGED: an admin sets the
# credentials once and they apply to every user automatically. There is one row
# per carrier_id / ams_id. Reads are open to any authenticated user (so the app
# can show what's connected); writes require admin.


# ── Carrier Connections ────────────────────────────────────────────────────────

@router.get("/carriers")
async def list_carrier_connections(_user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = (
        sb.table("carrier_connections")
        .select("id, carrier_id, username, producer_codes, extra, status, last_test_at, last_synced_at, created_at")
        .execute()
    )
    return result.data


@router.put("/carriers/{carrier_id}")
async def upsert_carrier_connection(
    carrier_id: str,
    body: CarrierConnectionUpsert,
    admin=Depends(require_admin),
):
    """Admin-only. Sets a global carrier credential applied to all users."""
    sb = get_supabase()
    payload = {
        "carrier_id": carrier_id,
        "set_by": str(admin["id"]),
        "username": body.username,
        "producer_codes": body.producer_codes,
        "extra": body.extra,
        "status": "connected",
    }
    if body.password:
        payload["password_ciphertext"] = body.password  # In prod: encrypt before storing
    result = sb.table("carrier_connections").upsert(payload, on_conflict="carrier_id").execute()
    return result.data[0]


@router.delete("/carriers/{carrier_id}")
async def delete_carrier_connection(carrier_id: str, admin=Depends(require_admin)):
    """Admin-only. Removes the global carrier connection for all users."""
    sb = get_supabase()
    sb.table("carrier_connections").delete().eq("carrier_id", carrier_id).execute()
    return {"success": True}


# ── AMS Connections ───────────────────────────────────────────────────────────

@router.get("/ams")
async def list_ams_connections(_user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = (
        sb.table("ams_connections")
        .select("id, ams_id, auth_method, username, instance_url, tenant_id, extra, status, last_test_at, last_synced_at")
        .execute()
    )
    return result.data


@router.put("/ams/{ams_id}")
async def upsert_ams_connection(
    ams_id: str,
    body: AmsConnectionUpsert,
    admin=Depends(require_admin),
):
    """Admin-only. Sets a global AMS credential applied to all users."""
    sb = get_supabase()
    payload = {
        "ams_id": ams_id,
        "set_by": str(admin["id"]),
        "auth_method": body.auth_method,
        "username": body.username,
        "instance_url": body.instance_url,
        "tenant_id": body.tenant_id,
        "extra": body.extra,
        "status": "connected",
    }
    if body.password:
        payload["password_ciphertext"] = body.password  # In prod: encrypt before storing
    if body.api_key:
        payload["api_key_ciphertext"] = body.api_key    # In prod: encrypt before storing
    result = sb.table("ams_connections").upsert(payload, on_conflict="ams_id").execute()
    return result.data[0]


@router.delete("/ams/{ams_id}")
async def delete_ams_connection(ams_id: str, admin=Depends(require_admin)):
    """Admin-only. Removes the global AMS connection for all users."""
    sb = get_supabase()
    sb.table("ams_connections").delete().eq("ams_id", ams_id).execute()
    return {"success": True}
