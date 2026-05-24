import logging
import textstat
from langchain_core.messages import HumanMessage, SystemMessage
from app.ingestion.chroma_store import query_chunks
from app.llm.providers import get_llm


SOCRATIC_SYSTEM = """You are a Socratic Skeptic tutor. The user is trying to explain a concept in their own words.
Your job is to probe their understanding with one focused follow-up question.
Keep your question short (1-2 sentences). Do not explain the concept yourself — only ask clarifying questions.
If their explanation is complete and correct, say "Your explanation covers this concept well." and stop asking."""


# Chat variant — used for the back-and-forth modal where the student opened
# the conversation deliberately. Unlike SOCRATIC_SYSTEM, this never declares
# "you're done" — the student is in the chat specifically to be probed, so
# bailing kills the interaction. The LLM must always return a question.
SOCRATIC_CHAT_SYSTEM = """You are a Socratic Skeptic tutor running a back-and-forth chat with a student who is explaining a concept in their own words.

YOUR JOB on every turn: ask ONE focused question that pushes the student deeper. Never declare them done — that's the student's call, not yours.

Rules:
- Always end your reply with a question mark. Always.
- Keep replies short (1-2 sentences). Single question, no lecture.
- Do NOT explain the concept yourself — Socratic means questions only.
- Do NOT say things like "your explanation covers this well", "good job", or "you've got it" — even if their answer is excellent, find the next layer to probe (an edge case, a corollary, a misconception, a real-world application).
- Use the coverage/explanation context (provided as system messages below) to choose which sub-concept to probe — prefer gaps where the rubric shows the student hasn't addressed something yet.
- If the student says "I'm stuck" or asks for a hint, give a leading question that nudges toward the answer without giving it away."""


async def start_feynman_session(
    topic: str,
    study_set_id: str,
    user_id: str,
    document_id: str | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> str:
    """Generate the initial Socratic question to start a Feynman session.

    When document_id is given, the opening probe is grounded in that source
    so the question references the chosen material specifically (G.2).
    """
    llm = get_llm(provider, model)

    source_context = ""
    source_chunks: list = []
    if document_id:
        try:
            results = query_chunks(
                None, user_id, study_set_id,
                top_k=3, document_id=document_id,
            )
            docs = results.get('documents', [[]])
            source_chunks = docs[0] if docs and docs[0] else []
            if source_chunks:
                joined = "\n\n".join(c[:500] for c in source_chunks[:3])
                source_context = (
                    "\n\nSource context (first chunks of the chosen material):\n"
                    f"{joined}\n\nGround your question in this material."
                )
        except Exception as exc:
            logging.warning('Feynman start: source fetch failed: %s', exc)

    system_prompt = SOCRATIC_SYSTEM + source_context
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"The user wants to explain: '{topic}'. Ask them to begin their explanation."),
    ]
    # Rule (f): structured log line proving retrieval entered the prompt.
    from app.logging.rag_log import log_feynman_event
    log_feynman_event(
        'feynman.start',
        user_id=user_id, study_set_id=study_set_id, document_id=document_id,
        chunks=len(source_chunks), prompt_chars=len(system_prompt),
    )
    response = await llm.ainvoke(messages)
    return response.content


async def socratic_chat_turn(
    topic: str,
    explanation: str,
    history: list[dict],
    user_message: str,
    *,
    user_id: str,
    study_set_id: str,
    document_id: str | None = None,
    coverage: list[dict] | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> str:
    """One Socratic question in a back-and-forth chat (Feature 4).

    Builds a multi-turn message list so the LLM can reference both the
    student's canvas explanation AND prior chat turns. Same source-grounding
    pass as start_feynman_session — when document_id is given, the first few
    chunks are injected into the system prompt.

    `coverage` is the current rubric state for the session — when present,
    the tutor uses it to probe specific gaps (missing/partial concepts)
    rather than asking generic questions.
    """
    llm = get_llm(provider, model)

    source_context = ""
    source_chunks: list = []
    if document_id:
        try:
            results = query_chunks(
                None, user_id, study_set_id,
                top_k=3, document_id=document_id,
            )
            docs = results.get('documents', [[]])
            source_chunks = docs[0] if docs and docs[0] else []
            if source_chunks:
                joined = "\n\n".join(c[:500] for c in source_chunks[:3])
                source_context = (
                    "\n\nSource context (first chunks of the chosen material):\n"
                    f"{joined}\n\nGround your question in this material."
                )
        except Exception as exc:
            logging.warning('Feynman socratic chat: source fetch failed: %s', exc)

    # Chat-specific prompt — never bails with "you're done", always asks
    # the next question.
    system_prompt = SOCRATIC_CHAT_SYSTEM + source_context
    explanation_context = (
        f"The student is explaining: '{topic}'.\n\n"
        f"Their current canvas explanation:\n{explanation or '(empty so far)'}"
    )

    # Coverage hint — the tutor sees which sub-concepts are currently missing
    # or partial so it can probe the gaps directly instead of asking generic
    # questions. The student doesn't see this; it goes only to the LLM.
    coverage_context = ''
    missing_labels = [c.get('label', '') for c in (coverage or []) if c.get('status') == 'missing' and c.get('label')]
    partial_labels = [c.get('label', '') for c in (coverage or []) if c.get('status') == 'partial' and c.get('label')]
    if missing_labels or partial_labels:
        parts = []
        if missing_labels:
            parts.append(f"NOT YET addressed: {', '.join(missing_labels[:6])}")
        if partial_labels:
            parts.append(f"only partially addressed: {', '.join(partial_labels[:6])}")
        coverage_context = (
            "Current rubric state for this topic — use it to choose what to probe:\n"
            + "\n".join(f"- {p}" for p in parts)
            + "\n\nPrefer asking a question that nudges them toward one of these gaps."
        )

    messages: list = [
        SystemMessage(content=system_prompt),
        SystemMessage(content=explanation_context),
    ]
    if coverage_context:
        messages.append(SystemMessage(content=coverage_context))
    # Replay prior turns so the LLM doesn't repeat itself.
    for turn in history:
        role = (turn.get('role') or '').lower()
        content = str(turn.get('content') or '')
        if not content:
            continue
        if role == 'assistant':
            messages.append(SystemMessage(content=f"[your previous question] {content}"))
        elif role == 'user':
            messages.append(HumanMessage(content=content))
    messages.append(HumanMessage(content=user_message))

    from app.logging.rag_log import log_feynman_event
    log_feynman_event(
        'feynman.socratic_chat',
        user_id=user_id, study_set_id=study_set_id, document_id=document_id,
        chunks=len(source_chunks), history_turns=len(history),
        prompt_chars=sum(len(m.content) for m in messages),
    )
    response = await llm.ainvoke(messages)
    return response.content


def _clarity_score(text: str) -> dict:
    """Deterministic NLP clarity metrics via textstat. No LLM call."""
    fk_grade = textstat.flesch_kincaid_grade(text)
    reading_ease = textstat.flesch_reading_ease(text)
    word_count = len(text.split())
    long_words = sum(1 for w in text.split() if textstat.syllable_count(w) > 3)
    jargon_pct = round((long_words / max(word_count, 1)) * 100, 1)
    return {
        'fleschKincaidGrade': round(fk_grade, 1),
        'readingEase': round(reading_ease, 1),
        'wordCount': word_count,
        'jargonPercent': jargon_pct,
        'clarityLabel': 'clear' if reading_ease >= 60 else 'dense' if reading_ease >= 30 else 'very_dense',
    }


async def _accuracy_evaluation(
    explanation: str,
    study_set_id: str,
    user_id: str,
    document_id: str | None = None,
    difficulty: str = 'medium',
    topic: str | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> dict:
    """
    Cross-reference explanation against ChromaDB chunks via a rubric pipeline
    (G.4). When document_id is given, chunks are scoped to that source.
    `topic` (when set) is used as the semantic query, and triggers the
    LLM-only fallback if no chunks match. `difficulty` is passed to the
    per-concept judge as a strictness directive.
    """
    from app.reasoning.accuracy_rubric import score_accuracy
    return await score_accuracy(
        explanation,
        user_id=user_id,
        study_set_id=study_set_id,
        document_id=document_id,
        difficulty=difficulty,
        topic=topic,
        provider=provider,
        model=model,
    )


async def evaluate_feynman(
    explanation: str,
    study_set_id: str,
    user_id: str,
    document_id: str | None = None,
    difficulty: str = 'medium',
    topic: str | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> dict:
    """
    Full Feynman evaluation — bifurcated pipeline:
    - Clarity: deterministic textstat (no LLM)
    - Accuracy: rubric-backed concept scoring (see accuracy_rubric.py)
    Returns CoverageMap + CognitiveProfileReport.
    """
    # Empty / trivially short text → zero out cleanly. Without this, the FE
    # keeps showing stale coverage after the user wipes the canvas, and
    # textstat returns nonsense Flesch scores for 1–2 word inputs ("coulombs
    # law" → 100% clarity). Word-count and char-length cover both: a single
    # sentence of real prose still grades, but bare topic strings do not.
    stripped = (explanation or '').strip()
    word_count = len(stripped.split())
    if not stripped or len(stripped) < 15 or word_count < 5:
        clarity = _clarity_score(stripped)
        clarity['clarityLabel'] = 'too_short'
        return {
            'clarity':       clarity,
            'accuracy':      {'score': 0.0, 'concepts': [], 'coverage': [],
                              'summary': 'Explanation is empty or too short to grade.',
                              'source':  'none'},
            'coverage':      [],
            'clarityScore':  0.0,
            'accuracyScore': 0.0,
            'source':        'none',
            'cognitiveProfile': {
                'clarityScore':  0.0,
                'accuracyScore': 0.0,
                'overallGrade':  _letter_grade(0.0),
            },
        }

    clarity = _clarity_score(explanation)
    accuracy = await _accuracy_evaluation(
        explanation, study_set_id, user_id,
        document_id=document_id, difficulty=difficulty,
        topic=topic, provider=provider, model=model,
    )

    coverage = accuracy.get('coverage') or []
    accuracy_score = float(accuracy.get('score', 0.0))
    clarity_score = max(0.0, min(1.0, clarity['readingEase'] / 100))

    # Relevance gate. Clarity (Flesch reading ease) measures prose readability,
    # not whether the prose is on-topic. Without this gate, fluent gibberish
    # like "So what are we explaining. here this is a sentence." scores 91%
    # clarity even when accuracy is 0 — readability of irrelevant text isn't
    # an achievement worth rewarding. If the rubric judged no concept above
    # the floor, treat the explanation as off-topic and zero clarity too.
    _RELEVANCE_GATE = 0.10
    if accuracy_score < _RELEVANCE_GATE:
        clarity_score = 0.0
        clarity['clarityLabel'] = 'irrelevant'

    from app.logging.rag_log import log_feynman_event
    log_feynman_event(
        'feynman.evaluate',
        user_id=user_id, study_set_id=study_set_id, document_id=document_id,
        concepts=len(coverage), accuracy_score=accuracy_score,
        clarity_score=clarity_score, model=model,
    )

    return {
        'clarity':       clarity,
        'accuracy':      accuracy,
        'coverage':      coverage,
        'clarityScore':  clarity_score,
        'accuracyScore': accuracy_score,
        # 'study_set' | 'generic' | 'none' — surfaces whether the rubric was
        # grounded in the user's chunks or fell back to the LLM's general
        # knowledge of the topic. FE shows a generic-mode label when set to
        # 'generic' so the user knows what they're being graded against.
        'source':        accuracy.get('source', 'study_set'),
        'cognitiveProfile': {
            'clarityScore':  clarity_score,
            'accuracyScore': accuracy_score,
            'overallGrade':  _letter_grade(clarity_score * 0.3 + accuracy_score * 0.7),
        },
    }


def _letter_grade(score: float) -> str:
    if score >= 0.9:
        return 'A'
    if score >= 0.8:
        return 'B'
    if score >= 0.7:
        return 'C'
    if score >= 0.6:
        return 'D'
    return 'F'
