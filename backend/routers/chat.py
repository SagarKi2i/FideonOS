from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from auth.dependencies import get_current_user, get_current_user_id
from models.schemas import ChatRequest
from services.supabase import get_supabase
from services.anthropic import stream_chat_as_openai_sse

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/stream")
async def stream_chat(
    req: ChatRequest,
    user_id: str = Depends(get_current_user_id),
):
    messages = [m.model_dump() for m in req.messages]

    async def generate():
        async for chunk in stream_chat_as_openai_sse(messages, model_id=req.model_id):
            yield chunk

    # Persist user message if conversation_id provided
    if req.conversation_id and req.messages:
        sb = get_supabase()
        last = req.messages[-1]
        sb.table("chat_messages").insert({
            "conversation_id": req.conversation_id,
            "role": last.role,
            "content": last.content,
        }).execute()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/conversations")
async def list_conversations(user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    result = (
        sb.table("chat_conversations")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.post("/conversations")
async def create_conversation(
    payload: dict,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase()
    result = sb.table("chat_conversations").insert({
        "user_id": user_id,
        "model_id": payload.get("model_id"),
        "title": payload.get("title", "New Conversation"),
    }).execute()
    return result.data[0]


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase()
    result = (
        sb.table("chat_messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at")
        .execute()
    )
    return result.data
