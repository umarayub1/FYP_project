import json
import uuid

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.reasoning.coach_graph import CoachState, run_coach_stream

router = APIRouter()


class ChatMessage(BaseModel):
    role: str   # 'user' | 'assistant'
    content: str


class ChatRequest(BaseModel):
    userId: str
    studySetId: str | None = None
    message: str
    history: list[ChatMessage] = []
    socratic: bool = False
    documentIds: list[str] = []
    commandType: str | None = None
    conversationId: str | None = None


class FeynmanStartRequest(BaseModel):
    userId: str
    studySetId: str
    topic: str
    sessionId: str | None = None
    documentId: str | None = None


class FeynmanEvaluateRequest(BaseModel):
    userId: str
    studySetId: str
    explanation: str
    sessionId: str | None = None
    documentId: str | None = None
    # Topic of the session — used as the semantic query into Chroma so the
    # rubric grounds in topic-relevant chunks instead of an arbitrary sample.
    # When absent (legacy callers) the rubric falls back to col.get() behavior.
    topic: str | None = None
    # Per-session rubric strictness — easy/medium/hard. Defaults to medium
    # which matches the calibration baked into the v4 prompt examples.
    difficulty: str = 'medium'


class CoverageItem(BaseModel):
    id:     str
    label:  str
    status: str  # 'covered' | 'partial' | 'missing'


class FeynmanTopicFitRequest(BaseModel):
    userId: str
    topic: str
    # The study set the user picked at /start. Used to decide whether to
    # suggest a switch — set to None to just learn which set fits best.
    currentStudySetId: str | None = None


class FeynmanSocraticChatRequest(BaseModel):
    userId: str
    studySetId: str
    topic: str
    explanation: str = ''
    message: str
    history: list[ChatMessage] = []
    documentId: str | None = None
    sessionId: str | None = None
    # Coverage map at the time of this turn — lets the tutor probe specific
    # gaps instead of asking generic questions.
    coverage: list[CoverageItem] = []


class GenerateFlashcardsRequest(BaseModel):
    userId: str
    studySetId: str
    documentId: str
    count: int = 50


@router.post("/chat")
async def chat(request: Request, body: ChatRequest) -> StreamingResponse:
    state: CoachState = {
        "user_id": body.userId,
        "study_set_id": body.studySetId,
        "user_llm_provider": request.headers.get("x-llm-provider"),
        "user_llm_model": request.headers.get("x-llm-model"),
        "message": body.message,
        "messages": [{"role": m.role, "content": m.content} for m in body.history],
        "recent_documents": [],
        "weak_concepts": [],
        "active_document_id": None,
        "referenced_documents": list(body.documentIds or []),
        "retrieved_chunks": [],
        "needs_retrieval": False,
        "iteration": 0,
        "no_retrieval": False,
        "socratic": bool(body.socratic),
    }
    return StreamingResponse(
        run_coach_stream(state),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/feynman/start")
async def feynman_start(request: Request, body: FeynmanStartRequest) -> dict:
    from app.reasoning.feynman import start_feynman_session
    question = await start_feynman_session(
        body.topic, body.studySetId, body.userId,
        document_id=body.documentId,
        provider=request.headers.get("x-llm-provider"),
        model=request.headers.get("x-llm-model"),
    )
    return {'question': question, 'topic': body.topic}


@router.post("/feynman/evaluate")
async def feynman_evaluate(request: Request, body: FeynmanEvaluateRequest) -> dict:
    from app.reasoning.feynman import evaluate_feynman
    result = await evaluate_feynman(
        body.explanation, body.studySetId, body.userId,
        document_id=body.documentId,
        difficulty=body.difficulty,
        topic=body.topic,
        provider=request.headers.get("x-llm-provider"),
        model=request.headers.get("x-llm-model"),
    )
    return result


@router.post("/feynman/topic-fit")
async def feynman_topic_fit(body: FeynmanTopicFitRequest) -> dict:
    """Cross-set fit hint. Returns the user's best-matching study set for a
    topic and whether the FE should suggest switching from the chosen set.
    A null fit means we have nothing useful to say (no chunks indexed)."""
    from app.reasoning.accuracy_rubric import topic_fit_check
    fit = await topic_fit_check(
        topic=body.topic,
        user_id=body.userId,
        current_study_set_id=body.currentStudySetId,
    )
    return {'fit': fit}


@router.post("/feynman/socratic-chat")
async def feynman_socratic_chat(request: Request, body: FeynmanSocraticChatRequest) -> dict:
    """One Socratic chat turn for the Feynman session modal (Feature 4).

    The conversation history is owned by the FE — this endpoint is stateless
    and just produces the next question. Grading isn't done here; the chat
    transcript folds into the canvas before /evaluate is called.
    """
    from app.reasoning.feynman import socratic_chat_turn
    question = await socratic_chat_turn(
        body.topic, body.explanation,
        [{'role': m.role, 'content': m.content} for m in body.history],
        body.message,
        user_id=body.userId, study_set_id=body.studySetId,
        document_id=body.documentId,
        coverage=[{'label': c.label, 'status': c.status} for c in body.coverage],
        provider=request.headers.get("x-llm-provider"),
        model=request.headers.get("x-llm-model"),
    )
    return {'question': question}


@router.post("/generate-flashcards")
async def generate_flashcards(body: GenerateFlashcardsRequest) -> dict:
    import redis as redis_lib
    from app.config import settings
    job_id = str(uuid.uuid4())
    r = redis_lib.from_url(settings.redis_url)
    r.lpush('flashcard-batch', json.dumps({
        'jobId': job_id,
        'userId': body.userId,
        'studySetId': body.studySetId,
        'documentId': body.documentId,
        'count': body.count,
    }))
    return {'jobId': job_id, 'message': 'Flashcard generation queued'}


# ── Comprehension checkpoints ────────────────────────────────────────────────

class ComprehensionQuestionRequest(BaseModel):
    userId: str
    documentId: str
    page: int


class ComprehensionScoreRequest(BaseModel):
    question: str
    expected: str
    answer: str


@router.post("/comprehension/question")
async def comprehension_question(
    request: Request, body: ComprehensionQuestionRequest,
) -> dict:
    from app.reasoning.comprehension import generate_question
    return await generate_question(
        body.userId, body.documentId, body.page,
        provider=request.headers.get("x-llm-provider"),
        model=request.headers.get("x-llm-model"),
    )


@router.post("/comprehension/score")
async def comprehension_score(
    request: Request, body: ComprehensionScoreRequest,
) -> dict:
    from app.reasoning.comprehension import score_answer
    return await score_answer(
        body.question, body.expected, body.answer,
        provider=request.headers.get("x-llm-provider"),
        model=request.headers.get("x-llm-model"),
    )


# ── Note actions (slash commands in the Block Editor) ─────────────────────────

class NoteActionRequest(BaseModel):
    userId: str
    action: str   # 'summarize' | 'explain' | 'key-points'
    text: str
    studySetId: str | None = None


@router.post("/note-action")
async def note_action(request: Request, body: NoteActionRequest) -> StreamingResponse:
    from app.reasoning.note_actions import stream_note_action
    provider = request.headers.get("x-llm-provider")
    model = request.headers.get("x-llm-model")
    return StreamingResponse(
        stream_note_action(body.action, body.text, provider=provider, model=model),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
