from fastapi import APIRouter, Depends
from auth.dependencies import get_current_user_id
from models.schemas import SopParseRequest, WorkflowStepAssistRequest, SopCompileRequest
from services.anthropic import complete_chat
import json

router = APIRouter(prefix="/workflow-ai", tags=["workflow-ai"])

PARSE_SYSTEM = """You are a workflow automation expert. Parse the given Standard Operating Procedure (SOP) into a structured list of steps for automation. Return ONLY valid JSON with this shape:
{"steps": [{"id": 1, "title": "...", "description": "...", "action_type": "navigate|click|fill|extract|submit|wait|condition", "selector": "...", "value": "...", "expected_outcome": "..."}]}"""

ASSIST_SYSTEM = """You are a workflow automation assistant helping configure individual automation steps. Provide specific, actionable guidance for automating insurance agency tasks in browser-based AMS systems."""

COMPILE_SYSTEM = """You are an expert Playwright automation engineer specializing in insurance agency management systems. Generate production-ready Playwright TypeScript scripts. Return ONLY valid JSON: {"script": "...", "description": "..."}"""


@router.post("/parse-sop")
async def parse_sop(body: SopParseRequest, _user_id: str = Depends(get_current_user_id)):
    messages = [{"role": "user", "content": f"Parse this SOP into automation steps:\n\n{body.sop_text}"}]
    text = await complete_chat(messages, system_prompt=PARSE_SYSTEM)
    try:
        return json.loads(text)
    except Exception:
        return {"steps": [], "raw": text}


@router.post("/assist-step")
async def assist_step(body: WorkflowStepAssistRequest, _user_id: str = Depends(get_current_user_id)):
    content = f"Help me configure this automation step:\n{json.dumps(body.step, indent=2)}"
    if body.context:
        content += f"\n\nContext: {body.context}"
    messages = [{"role": "user", "content": content}]
    text = await complete_chat(messages, system_prompt=ASSIST_SYSTEM)
    return {"guidance": text}


@router.post("/compile")
async def compile_workflow(body: SopCompileRequest, _user_id: str = Depends(get_current_user_id)):
    content = f"Generate a Playwright script for this SOP:\n\n{body.sop_text}\n\nSteps:\n{json.dumps(body.steps, indent=2)}"
    messages = [{"role": "user", "content": content}]
    text = await complete_chat(messages, system_prompt=COMPILE_SYSTEM)
    try:
        return json.loads(text)
    except Exception:
        return {"script": text, "description": "Generated automation script"}
