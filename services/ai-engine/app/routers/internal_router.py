"""Internal-only routes (X-Internal-Secret protected).

Used by core-service / gateway to signal state changes that the ai-engine
needs to act on out-of-band — e.g., invalidating the BM25 cache when a
document is deleted so retrieval stops surfacing stale lexical hits.
"""
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from app.config import settings
from app.ingestion.chroma_store import delete_chunks_for_document, move_chunks_to_study_set
from app.ingestion.note_ingestion import delete_note_chunks, index_note
from app.ingestion.retrieval import invalidate_bm25

router = APIRouter()


def _require_internal_secret(request: Request) -> None:
    expected = settings.internal_secret
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="INTERNAL_SECRET not configured on ai-engine",
        )
    provided = request.headers.get("x-internal-secret")
    if provided != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


class InvalidateBM25Request(BaseModel):
    user_id: str
    study_set_id: str


@router.post("/cache/bm25/invalidate")
async def invalidate_bm25_cache(request: Request, body: InvalidateBM25Request) -> dict:
    _require_internal_secret(request)
    invalidate_bm25(body.user_id, body.study_set_id)
    return {"ok": True}


class DeleteChunksRequest(BaseModel):
    user_id: str
    document_id: str


@router.post("/chunks/delete")
async def delete_chunks(request: Request, body: DeleteChunksRequest) -> dict:
    _require_internal_secret(request)
    removed = delete_chunks_for_document(body.user_id, body.document_id)
    return {"ok": True, "removed": removed}


class MoveChunksRequest(BaseModel):
    user_id: str
    document_id: str
    study_set_id: str


@router.post("/chunks/move")
async def move_chunks(request: Request, body: MoveChunksRequest) -> dict:
    _require_internal_secret(request)
    moved = move_chunks_to_study_set(body.user_id, body.document_id, body.study_set_id)
    return {"ok": True, "moved": moved}


class IndexNoteRequest(BaseModel):
    user_id: str
    study_set_id: str
    note_id: str
    plain_text: str
    title: str | None = None


@router.post("/index-note")
async def index_note_endpoint(request: Request, body: IndexNoteRequest) -> dict:
    _require_internal_secret(request)
    chunk_ids = index_note(
        note_id=body.note_id,
        user_id=body.user_id,
        study_set_id=body.study_set_id,
        plain_text=body.plain_text,
        title=body.title,
    )
    # BM25 corpus changed for this scope — drop the cache so the next query
    # rebuilds and surfaces the new chunks.
    invalidate_bm25(body.user_id, body.study_set_id)
    return {"ok": True, "chunks": len(chunk_ids)}


class DeleteNoteChunksRequest(BaseModel):
    user_id: str
    note_id: str
    study_set_id: str | None = None


@router.post("/chunks/delete-note")
async def delete_note_chunks_endpoint(
    request: Request, body: DeleteNoteChunksRequest,
) -> dict:
    _require_internal_secret(request)
    removed = delete_note_chunks(body.user_id, body.note_id)
    if body.study_set_id:
        invalidate_bm25(body.user_id, body.study_set_id)
    return {"ok": True, "removed": removed}
