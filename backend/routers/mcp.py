from fastapi import APIRouter, Depends, HTTPException, Header
from auth.dependencies import get_current_user_id
from models.schemas import McpTokenCreate
from services.supabase import get_supabase
from services.anthropic import complete_chat
import hashlib
import secrets
from datetime import datetime, timezone

router = APIRouter(prefix="/mcp", tags=["mcp"])


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ── MCP Token Management ──────────────────────────────────────────────────────

@router.get("/tokens")
async def list_tokens(user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = (
        sb.table("mcp_tokens")
        .select("id, scopes, last_used_at, revoked_at, created_at")
        .eq("user_id", user_id)
        .is_("revoked_at", "null")
        .execute()
    )
    return result.data


@router.post("/tokens")
async def create_token(body: McpTokenCreate, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    token = f"mcp_{secrets.token_urlsafe(32)}"
    token_hash = _hash_token(token)
    result = sb.table("mcp_tokens").insert({
        "user_id": user_id,
        "token_hash": token_hash,
        "scopes": body.scopes,
    }).execute()
    return {"token": token, "id": result.data[0]["id"], "scopes": body.scopes}


@router.delete("/tokens/{token_id}")
async def revoke_token(token_id: str, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    sb.table("mcp_tokens").update({
        "revoked_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", token_id).eq("user_id", user_id).execute()
    return {"revoked": True}


# ── MCP Server (Tool Execution) ───────────────────────────────────────────────

@router.post("/execute")
async def mcp_execute(
    body: dict,
    authorization: str = Header(...),
):
    """Execute a pod tool via MCP protocol (bearer token auth)."""
    raw_token = authorization.removeprefix("Bearer ").strip()
    token_hash = _hash_token(raw_token)

    sb = get_supabase()
    token_record = (
        sb.table("mcp_tokens")
        .select("*")
        .eq("token_hash", token_hash)
        .is_("revoked_at", "null")
        .maybe_single()
        .execute()
    )
    if not token_record.data:
        raise HTTPException(status_code=401, detail="Invalid or revoked MCP token")

    token_id = token_record.data["id"]
    user_id = token_record.data["user_id"]
    tool = body.get("tool", "")
    req_body = body.get("input", {})

    sb.table("mcp_tokens").update({
        "last_used_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", token_id).execute()

    start = datetime.now(timezone.utc)
    try:
        messages = [{"role": "user", "content": str(req_body)}]
        response_text = await complete_chat(messages, model_id=tool)
        latency = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)

        sb.table("mcp_call_log").insert({
            "token_id": token_id,
            "tool": tool,
            "status": "success",
            "latency": latency,
            "req": req_body,
            "res": {"text": response_text},
        }).execute()

        return {"result": response_text, "tool": tool}
    except Exception as e:
        latency = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        sb.table("mcp_call_log").insert({
            "token_id": token_id,
            "tool": tool,
            "status": "error",
            "latency": latency,
            "req": req_body,
            "error": str(e),
        }).execute()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tools")
async def list_tools(user_id: str = Depends(get_current_user_id)):
    """Return available MCP tools for this tenant (activated pods)."""
    sb = get_supabase()
    result = (
        sb.table("user_agents")
        .select("model_id, model_name, domain")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .execute()
    )
    tools = [
        {
            "name": m["model_id"],
            "description": f"Fideon {m['model_name']} agent ({m['domain']} domain)",
            "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}}},
        }
        for m in result.data
    ]
    return {"tools": tools}
