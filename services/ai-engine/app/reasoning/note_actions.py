"""Block-editor AI slash commands — /ai-summarize, /ai-explain, /ai-key-points.

Each action is a single-shot prompt over a snippet of note text and streams the
LLM response as SSE tokens. Templates are kept short and deterministic so the
output reads as a clean note insertion, not a chat reply.
"""
from __future__ import annotations

import json
from typing import AsyncGenerator

from langchain_core.messages import HumanMessage, SystemMessage

from app.llm.providers import get_llm


# Prompt templates — keep these compact and audit-friendly.
# The system message defines the output shape; the user message is the
# selection. We never include conversation history because slash commands are
# stateless transformations.
PROMPT_TEMPLATES: dict[str, str] = {
    "summarize": (
        "Summarize the following note content as 3–5 concise bullet points. "
        "Each bullet should stand alone. No preamble, no closing remarks — "
        "just the bullets."
    ),
    "explain": (
        "Explain the following content in plain language for a student "
        "reviewing it. Keep to 2–4 short paragraphs. No preamble."
    ),
    "key-points": (
        "Extract the key points from the following content as a numbered "
        "list. Each item should be a single sentence. No preamble, no "
        "closing remarks."
    ),
}


def _system_for(action: str) -> str:
    return PROMPT_TEMPLATES.get(action, PROMPT_TEMPLATES["summarize"])


async def stream_note_action(
    action: str,
    text: str,
    *,
    provider: str | None = None,
    model: str | None = None,
) -> AsyncGenerator[str, None]:
    """Stream SSE-formatted token events for a single note action."""
    if action not in PROMPT_TEMPLATES:
        yield f"data: {json.dumps({'error': f'Unknown action: {action}'})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"
        return

    if not text.strip():
        yield f"data: {json.dumps({'error': 'No text selected.'})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"
        return

    llm = get_llm(provider=provider, model=model)
    messages = [
        SystemMessage(content=_system_for(action)),
        HumanMessage(content=text[:8000]),  # cap to keep latency predictable
    ]

    try:
        async for chunk in llm.astream(messages):
            token = chunk.content if hasattr(chunk, "content") else ""
            if token:
                yield f"data: {json.dumps({'token': token})}\n\n"
    except Exception as exc:
        yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    yield f"data: {json.dumps({'done': True})}\n\n"
