from __future__ import annotations

import json
import re
from typing import AsyncGenerator, Literal, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph

from app.ingestion.retrieval import hybrid_retrieve
from app.llm.providers import get_llm
from app.logging.rag_log import log_coach_synthesize
from app.reasoning.prompts import (
    COACH_DEFAULT_SYSTEM,
    COACH_NO_RETRIEVAL_ADDENDUM,
    SOCRATIC_SYSTEM,
)


class WeakConcept(TypedDict):
    concept: str
    ease_factor: float
    source: str  # 'flashcard' | 'feynman'


class RetrievedChunk(TypedDict):
    chunk_id: str
    content: str
    document_id: str
    document_title: str
    page_number: int
    chunk_index: int


class CoachState(TypedDict, total=False):
    # ── Identity & scope ──────────────────────────────────────────────────
    user_id: str
    study_set_id: str | None

    # ── Per-user LLM preference (from X-LLM-Provider / X-LLM-Model headers) ─
    user_llm_provider: str | None
    user_llm_model: str | None

    # ── Persistent personalization (injected by caller) ───────────────────
    recent_documents: list[str]       # last 5 doc IDs touched
    weak_concepts: list[WeakConcept]  # ease<1.8 cards + Feynman gaps
    active_document_id: str | None    # currently open doc, if any

    # ── Conversation ──────────────────────────────────────────────────────
    messages: list[dict]              # [{role, content}] — full turn history
    message: str                      # latest user input
    referenced_documents: list[str]   # doc IDs parsed from @-mentions

    # ── RAG ───────────────────────────────────────────────────────────────
    retrieved_chunks: list[RetrievedChunk]
    needs_retrieval: bool
    iteration: int                    # loop guard; max 2 retrieve passes
    no_retrieval: bool                # true when retrieval ran but returned []

    # ── Mode flags ─────────────────────────────────────────────────────────
    socratic: bool


# ── Nodes ────────────────────────────────────────────────────────────────────

def _observe(state: CoachState) -> dict:
    # The frontend strips @-mention syntax from the message and sends the
    # selected doc IDs as `documentIds` in the request body (carried into
    # state["referenced_documents"]). Fall back to regex-parsing the raw
    # message only when the caller didn't supply explicit IDs — preserves
    # backward compatibility for direct API users.
    explicit = list(state.get("referenced_documents") or [])
    if explicit:
        return {"referenced_documents": explicit, "iteration": 0}
    refs = re.findall(r"@([\w\-]+)", state["message"])
    return {"referenced_documents": refs, "iteration": 0}


def _decide(state: CoachState) -> dict:
    greetings = {"hi", "hello", "hey", "thanks", "thank you", "ok", "okay"}
    needs = state["message"].strip().lower() not in greetings
    return {"needs_retrieval": needs}


def _retrieve(state: CoachState) -> dict:
    if not state["needs_retrieval"]:
        return {"retrieved_chunks": [], "iteration": state["iteration"] + 1}
    try:
        chunks = hybrid_retrieve(
            query=state["message"],
            user_id=state["user_id"],
            study_set_id=state["study_set_id"],
            referenced_documents=state.get("referenced_documents", []),
            top_k=5,
        )
    except Exception:
        chunks = []
    return {"retrieved_chunks": chunks, "iteration": state["iteration"] + 1}


_TOP_SCORE_FLOOR = -5.0
_KEEP_DELTA      = 3.0

import logging as _logging
_log = _logging.getLogger("coach.evaluate")
if not _log.handlers:
    _h = _logging.StreamHandler()
    _h.setFormatter(_logging.Formatter("%(message)s"))
    _log.addHandler(_h)
    _log.setLevel(_logging.INFO)
    _log.propagate = False


def _evaluate(state: CoachState) -> dict:
    """Mark `no_retrieval` when retrieval returned nothing useful.

    ms-marco-MiniLM-L-6-v2 is a binary-classifier head used in regression
    mode, so its scores are unbounded logits. Empirically:
      - strong topical match:    ~ +5 to +10
      - relevant but generic:    ~  0 to  +5
      - tangential:              ~ -3 to   0
      - clearly off-topic:       ~ -8 to  -3
    The raw values vary a lot by query phrasing, so a fixed absolute
    threshold (e.g. 0) over-filters real hits — "what is photosynthesis"
    against the user's actual notes can land at -1.

    Strategy:
      1. If the best chunk scores below `_TOP_SCORE_FLOOR`, treat the
         whole pool as irrelevant — fire `no_retrieval`. This is the
         "capital of France in a calculus set" case.
      2. Otherwise keep the best chunk AND any chunk within `_KEEP_DELTA`
         of the best (tight cluster of relevant results). Drop the rest
         so the system prompt isn't padded with noise.
      3. If chunks have no scores (rerank fallback path), keep them all.
    """
    needs = state.get("needs_retrieval", False)
    chunks = state.get("retrieved_chunks") or []

    if not chunks:
        if needs:
            return {"no_retrieval": True, "retrieved_chunks": []}
        return {"no_retrieval": False, "retrieved_chunks": []}

    scored = [
        (float(c.get("relevance_score")), c)
        for c in chunks
        if c.get("relevance_score") is not None
    ]

    if not scored:
        # Rerank fallback path — trust upstream ranking, keep everything.
        _log.info("evaluate: no scores available, keeping all %d chunks", len(chunks))
        return {"no_retrieval": False, "retrieved_chunks": chunks}

    scored.sort(key=lambda p: p[0], reverse=True)
    top_score = scored[0][0]
    _log.info(
        "evaluate: top_score=%.3f scores=%s floor=%.1f delta=%.1f",
        top_score,
        [round(s, 3) for s, _ in scored[:5]],
        _TOP_SCORE_FLOOR,
        _KEEP_DELTA,
    )

    if top_score < _TOP_SCORE_FLOOR:
        return {"no_retrieval": True, "retrieved_chunks": []}

    kept = [c for s, c in scored if s >= top_score - _KEEP_DELTA]
    return {"no_retrieval": False, "retrieved_chunks": kept}


def _route_after_evaluate(state: CoachState) -> Literal["retrieve", "synthesize"]:
    # If evaluate already declared the query unmatchable, don't retry the
    # same query — go straight to synthesize so the no-retrieval prompt
    # addendum can take over.
    if state.get("no_retrieval"):
        return "synthesize"
    if (
        not state["needs_retrieval"]
        or state.get("retrieved_chunks")
        or state["iteration"] >= 2
    ):
        return "synthesize"
    return "retrieve"


async def _synthesize(state: CoachState) -> dict:
    socratic = bool(state.get("socratic", False))
    base_system = SOCRATIC_SYSTEM if socratic else COACH_DEFAULT_SYSTEM
    parts: list[str] = [base_system]

    if state.get("no_retrieval"):
        parts.append(COACH_NO_RETRIEVAL_ADDENDUM)

    if state.get("active_document_id"):
        parts.append(
            f"The user is currently working with document: {state['active_document_id']}."
        )

    recent = state.get("recent_documents") or []
    if recent:
        parts.append(f"Recent documents in this session: {', '.join(recent[:5])}.")

    weak = state.get("weak_concepts") or []
    if weak:
        names = ", ".join(c["concept"] for c in weak[:5])
        parts.append(
            f"The user has struggled with: {names}. "
            "If any of these overlap with the current question, proactively offer remediation."
        )

    chunks = state.get("retrieved_chunks") or []
    if chunks:
        blocks = []
        for i, c in enumerate(chunks, start=1):
            title = c.get("document_title") or "Source"
            page = c.get("page_number") or 0
            header = f"[{i}] {title}" + (f" (p.{page})" if page else "")
            blocks.append(f"{header}\n{c.get('content', '')}")
        context_text = "\n\n---\n\n".join(blocks)
        parts.append(
            "Use the following numbered sources when relevant. Cite them inline as "
            "[1], [2], etc., immediately after the claim they support.\n\n"
            f"Sources:\n\n{context_text}"
        )

    system_prompt = "\n\n".join(parts)
    lc_messages = [SystemMessage(content=system_prompt)]
    for turn in state.get("messages", []):
        if turn["role"] == "user":
            lc_messages.append(HumanMessage(content=turn["content"]))
        else:
            lc_messages.append(AIMessage(content=turn["content"]))
    lc_messages.append(HumanMessage(content=state["message"]))

    # Per-turn audit log so we can prove retrieval actually entered the prompt.
    log_coach_synthesize(
        user_id=state.get("user_id", ""),
        study_set_id=state.get("study_set_id"),
        retrieved_chunks_n=len(chunks),
        chunk_ids=[c.get("chunk_id", "") for c in chunks],
        prompt_chars=len(system_prompt),
        no_retrieval=bool(state.get("no_retrieval")),
        socratic=socratic,
        model=state.get("user_llm_model"),
    )

    llm = get_llm(
        provider=state.get("user_llm_provider"),
        model=state.get("user_llm_model"),
    )
    response = await llm.ainvoke(lc_messages)
    updated_messages = (state.get("messages") or []) + [
        {"role": "assistant", "content": response.content}
    ]
    return {"messages": updated_messages}


# ── Graph assembly ────────────────────────────────────────────────────────────

def _build_graph():
    g = StateGraph(CoachState)
    g.add_node("observe", _observe)
    g.add_node("decide", _decide)
    g.add_node("retrieve", _retrieve)
    g.add_node("evaluate", _evaluate)
    g.add_node("synthesize", _synthesize)

    g.set_entry_point("observe")
    g.add_edge("observe", "decide")
    g.add_edge("decide", "retrieve")
    g.add_edge("retrieve", "evaluate")
    g.add_conditional_edges(
        "evaluate",
        _route_after_evaluate,
        {"retrieve": "retrieve", "synthesize": "synthesize"},
    )
    g.add_edge("synthesize", END)

    return g.compile()


_graph = None


def _get_graph():
    global _graph
    if _graph is None:
        _graph = _build_graph()
    return _graph


_FULL_TEXT_CAP = 1500


def _serialize_citations(chunks: list[RetrievedChunk]) -> list[dict]:
    """Map retrieved chunks to the citation payload the frontend renders.

    Each citation carries a short preview snippet (~220 chars) for the
    tooltip header AND a longer `fullText` block (~1500 chars) that the
    HoverCard expands into on long-hover / Space-toggle. Keeping both
    server-side avoids a second fetch when the user inspects a chunk.
    """
    out: list[dict] = []
    for i, c in enumerate(chunks, start=1):
        raw_content = (c.get("content") or "").strip()
        snippet = raw_content.replace("\n", " ")
        if len(snippet) > 220:
            snippet = snippet[:217].rstrip() + "…"

        full_text = raw_content
        if len(full_text) > _FULL_TEXT_CAP:
            full_text = full_text[: _FULL_TEXT_CAP - 1].rstrip() + "…"

        source_type = (c.get("source_type") or "pdf").strip().lower()
        if source_type not in {"pdf", "note"}:
            source_type = "pdf"
        source_id = (
            c.get("note_id")
            if source_type == "note"
            else c.get("document_id", "")
        ) or ""

        out.append({
            "n": i,
            "chunkId": c.get("chunk_id", ""),
            "sourceType": source_type,
            "sourceId": source_id,
            "sourceTitle": c.get("document_title", "Source"),
            "snippet": snippet,
            "fullText": full_text,
            "pageNumber": c.get("page_number", 0) or None,
        })
    return out


# ── Public streaming entrypoint ───────────────────────────────────────────────

async def run_coach_stream(state: CoachState) -> AsyncGenerator[str, None]:
    """
    Run the ReAct graph and yield SSE-formatted token events.
    observe → decide → retrieve → evaluate → [retry loop] → synthesize

    Emits these event shapes on the same stream:
      data: {"mode": "socratic"}            — once, before any tokens
      data: {"stage": "retrieving", ...}    — at the start of each graph stage
      data: {"no_retrieval": true}          — once, when retrieval returned []
      data: {"citations": [...]}            — once, after retrieval completes
      data: {"token": "..."}                — for each LLM token
      data: {"done": true}                  — final marker

    The `stage` events back Plan F's "RAG honesty" goal: the user can see the
    pipeline progressing through retrieve → rerank → synthesize before tokens
    flow, so a fast LLM response can't be mistaken for a fabricated one.
    """
    graph = _get_graph()
    citations_emitted = False
    no_retrieval_emitted = False
    stages_emitted: set[str] = set()

    def stage_event(stage: str, label: str) -> str:
        return f"data: {json.dumps({'stage': stage, 'label': label})}\n\n"

    if state.get("socratic"):
        yield f"data: {json.dumps({'mode': 'socratic'})}\n\n"

    async for event in graph.astream_events(state, version="v2"):
        name = event.get("name")
        kind = event["event"]

        # Stage indicators (each fires at most once per turn).
        if kind == "on_chain_start" and name == "retrieve" and "retrieving" not in stages_emitted:
            stages_emitted.add("retrieving")
            yield stage_event("retrieving", "Searching your sources…")

        # Show the reranking tick when retrieve returned a non-empty pool —
        # before the relevance threshold has decided whether to keep them.
        if kind == "on_chain_end" and name == "retrieve":
            raw_chunks = (event.get("data") or {}).get("output", {}).get("retrieved_chunks") or []
            if raw_chunks and "ranking" not in stages_emitted:
                stages_emitted.add("ranking")
                yield stage_event("ranking", "Reranking by relevance…")

        # Emit citations + no_retrieval from `evaluate`'s output so the
        # relevance threshold (Plan F.1) is honoured: an irrelevant pool is
        # filtered to [] before this point, so no citations chip up and the
        # callout fires correctly.
        if kind == "on_chain_end" and name == "evaluate":
            output = (event.get("data") or {}).get("output", {}) or {}
            filtered = output.get("retrieved_chunks") or []
            if not citations_emitted:
                citations_emitted = True
                yield f"data: {json.dumps({'citations': _serialize_citations(filtered)})}\n\n"
            if not no_retrieval_emitted and output.get("no_retrieval"):
                no_retrieval_emitted = True
                yield f"data: {json.dumps({'no_retrieval': True})}\n\n"

        if kind == "on_chain_start" and name == "synthesize" and "synthesizing" not in stages_emitted:
            stages_emitted.add("synthesizing")
            yield stage_event("synthesizing", "Synthesizing answer…")

        if kind == "on_chat_model_stream":
            chunk = event["data"].get("chunk")
            if chunk:
                token = chunk.content if hasattr(chunk, "content") else ""
                if token:
                    yield f"data: {json.dumps({'token': token})}\n\n"
    yield f"data: {json.dumps({'done': True})}\n\n"
