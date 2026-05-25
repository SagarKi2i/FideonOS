import json
from typing import AsyncGenerator
import anthropic
from config import settings

_client: anthropic.AsyncAnthropic | None = None


def get_anthropic() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


DOMAIN_PROMPTS: dict[str, str] = {
    "insurance": "You are an insurance domain expert. Help users analyze policies, compare coverage, identify exclusions, and answer insurance-related questions with accuracy and clarity.",
    "healthcare": "You are a healthcare AI assistant. Help with pre-authorization, clinical summaries, medical Q&A, and diagnosis support.",
    "banking": "You are a banking and finance expert. Assist with KYC analysis, compliance checking, risk assessment, and fraud detection.",
    "legal": "You are a legal AI assistant. Help review contracts, identify clauses, answer legal questions, and assess risks.",
    "travel": "You are a travel knowledge expert. Assist with itinerary planning, visa requirements, destination information.",
}

DEFAULT_PROMPT = "You are a helpful AI assistant in the Fideon OS platform."


async def stream_chat_as_openai_sse(
    messages: list[dict],
    model_id: str | None = None,
    system_prompt: str | None = None,
) -> AsyncGenerator[bytes, None]:
    """Stream Anthropic response as OpenAI-compatible SSE chunks."""
    system = system_prompt or DOMAIN_PROMPTS.get(model_id or "", DEFAULT_PROMPT)
    filtered = [m for m in messages if m.get("role") != "system"]

    client = get_anthropic()
    async with client.messages.stream(
        model=settings.anthropic_model,
        max_tokens=settings.anthropic_max_tokens,
        system=system,
        messages=filtered,
    ) as stream:
        async for text in stream.text_stream:
            payload = json.dumps({"choices": [{"delta": {"content": text}}]})
            yield f"data: {payload}\n\n".encode()
        yield b"data: [DONE]\n\n"


async def complete_chat(
    messages: list[dict],
    system_prompt: str | None = None,
    model_id: str | None = None,
) -> str:
    """Non-streaming chat completion, returns full text."""
    system = system_prompt or DOMAIN_PROMPTS.get(model_id or "", DEFAULT_PROMPT)
    filtered = [m for m in messages if m.get("role") != "system"]

    client = get_anthropic()
    response = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=settings.anthropic_max_tokens,
        system=system,
        messages=filtered,
    )
    return response.content[0].text
