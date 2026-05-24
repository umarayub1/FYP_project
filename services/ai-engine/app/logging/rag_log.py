"""Structured logging for the Coach RAG path.

Every turn through `_synthesize` emits exactly one `coach.synthesize`
record so engineers can audit "did retrieval actually enter the prompt?"
by grepping the ai-engine logs. The fields are deliberately small and
greppable — `chunk_ids` for cross-referencing with Chroma, `prompt_chars`
to confirm the chunks are bulking up the system message (Plan F.5
acceptance: >1000 when chunks > 0).
"""
from __future__ import annotations

import json
import logging

logger = logging.getLogger("coach.rag")
if not logger.handlers:
    # Force a default handler so the log lines reach stdout even if the
    # process never configured a root handler explicitly. INFO matches the
    # rest of the service.
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


def log_coach_synthesize(
    *,
    user_id: str,
    study_set_id: str | None,
    retrieved_chunks_n: int,
    chunk_ids: list[str],
    prompt_chars: int,
    no_retrieval: bool,
    socratic: bool,
    model: str | None,
) -> None:
    """Emit one structured JSON line per Coach turn."""
    payload = {
        "event": "coach.synthesize",
        "user_id": user_id,
        "study_set_id": study_set_id,
        "retrieved_chunks_n": retrieved_chunks_n,
        "chunk_ids": chunk_ids,
        "prompt_chars": prompt_chars,
        "no_retrieval": no_retrieval,
        "socratic": socratic,
        "model": model,
    }
    logger.info(json.dumps(payload, separators=(",", ":")))


def log_feynman_event(event: str, **fields: object) -> None:
    """Emit one structured JSON line per Feynman start/evaluate.

    Used to satisfy rule (f) — proves source chunks entered the prompt.
    """
    payload = {"event": event, **fields}
    logger.info(json.dumps(payload, separators=(",", ":"), default=str))
