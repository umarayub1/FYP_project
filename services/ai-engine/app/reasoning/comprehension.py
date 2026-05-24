"""Comprehension checkpoints — short Q&A every N pages while reading a PDF.

UX_v3 §6.16: when the user toggles checkpoints on and crosses a checkpoint
page, the overlay asks a single short question grounded in the page text and
scores their answer. Two operations:

  - generate_question(user_id, document_id, page) -> str
  - score_answer(question, expected, answer) -> {correct, expected, feedback}

`expected` is captured at question-generation time so scoring stays anchored
to what the question was actually testing rather than re-deriving on each
answer.
"""
from __future__ import annotations

import json
import re

from langchain_core.messages import HumanMessage, SystemMessage

from app.ingestion.chroma_store import get_chunks_for_page
from app.llm.providers import get_llm


_QUESTION_SYSTEM = (
    "You write a single short comprehension question for a student who just "
    "finished reading a page of their study material. The question must be "
    "answerable in one or two sentences from the text below. Return ONLY JSON "
    'shaped: {"question": "...", "expected": "..."} — no commentary.'
)

_SCORE_SYSTEM = (
    "You grade a student's short answer against the expected answer for a "
    "reading-comprehension checkpoint. Be generous about wording but strict "
    "about meaning. Return ONLY JSON shaped: "
    '{"correct": true|false, "feedback": "<one sentence>"} — no commentary.'
)


def _parse_json(text: str) -> dict:
    """LLMs sometimes wrap JSON in prose or fences; extract the first object."""
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return {}


async def generate_question(
    user_id: str,
    document_id: str,
    page: int,
    *,
    provider: str | None = None,
    model: str | None = None,
) -> dict:
    """Return {"question": str, "expected": str}.

    If no chunks exist for the page (e.g., the PDF wasn't ingested), returns
    a generic prompt so the overlay still works without the LLM hallucinating
    page-specific content.
    """
    chunks = get_chunks_for_page(user_id, document_id, page, limit=6)
    if not chunks:
        return {
            "question": f"In one sentence, what was the main idea on page {page}?",
            "expected": "",
        }

    page_text = "\n\n".join(chunks)[:4000]
    llm = get_llm(provider=provider, model=model)
    response = await llm.ainvoke([
        SystemMessage(content=_QUESTION_SYSTEM),
        HumanMessage(content=f"Page {page} text:\n\n{page_text}"),
    ])
    parsed = _parse_json(getattr(response, "content", "") or "")
    return {
        "question": parsed.get("question") or f"What was the main idea on page {page}?",
        "expected": parsed.get("expected") or "",
    }


async def score_answer(
    question: str,
    expected: str,
    answer: str,
    *,
    provider: str | None = None,
    model: str | None = None,
) -> dict:
    """Return {"correct": bool, "feedback": str, "expected": str}."""
    if not answer.strip():
        return {
            "correct": False,
            "feedback": "You didn't write an answer.",
            "expected": expected,
        }

    llm = get_llm(provider=provider, model=model)
    prompt = (
        f"Question: {question}\n\n"
        f"Expected answer: {expected or '(none — judge whether the student answer is plausibly correct given the question)'}\n\n"
        f"Student answer: {answer}"
    )
    response = await llm.ainvoke([
        SystemMessage(content=_SCORE_SYSTEM),
        HumanMessage(content=prompt),
    ])
    parsed = _parse_json(getattr(response, "content", "") or "")
    return {
        "correct": bool(parsed.get("correct", False)),
        "feedback": parsed.get("feedback") or "Answer recorded.",
        "expected": expected,
    }
