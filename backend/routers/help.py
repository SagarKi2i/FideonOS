from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from auth.dependencies import get_current_user_id
from models.schemas import HelpRequest
from services.anthropic import stream_chat_as_openai_sse, complete_chat

router = APIRouter(prefix="/help", tags=["help"])

HELP_SYSTEM_PROMPT = """You are the Fideon OS help assistant. You help insurance agency staff use the Fideon OS platform effectively.

Key platform areas:
- Today dashboard: KPIs, recent activity, active agents
- Approvals (Decision Review Queue): review and approve AI-generated decisions
- Marketplace: browse and activate AI pods by insurance domain
- My Models: manage activated agents
- Workflows: build and run automation workflows
- Connect: integrate with AMS systems (AppliedEpic, AMS360, HawkSoft, EZLynx, QQ Catalyst) and carriers
- Governance: audit logs, decision records, model versions

Be concise, helpful, and specific to the Fideon OS platform."""


@router.post("/chat/stream")
async def help_stream(
    req: HelpRequest,
    _user_id: str = Depends(get_current_user_id),
):
    context_note = f"\nUser context: {req.context}" if req.context else ""
    messages = [{"role": "user", "content": req.message + context_note}]

    async def generate():
        async for chunk in stream_chat_as_openai_sse(messages, system_prompt=HELP_SYSTEM_PROMPT):
            yield chunk

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/chat")
async def help_chat(
    req: HelpRequest,
    _user_id: str = Depends(get_current_user_id),
):
    context_note = f"\nUser context: {req.context}" if req.context else ""
    messages = [{"role": "user", "content": req.message + context_note}]
    text = await complete_chat(messages, system_prompt=HELP_SYSTEM_PROMPT)
    return {"response": text}
