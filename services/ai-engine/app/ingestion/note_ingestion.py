"""Index notes into the same Chroma collection as PDF chunks.

Notes appear in the @-mention picker so users can scope Coach retrieval
to a specific note the same way they scope to a PDF. For that to work the
note text must live in the vector store with parallel metadata: same
`user_id` + `study_set_id` keys, plus `source_type: 'note'` and `note_id`
so retrieval can discriminate and the citation payload can deeplink.

Reindex is idempotent — every call deletes the note's prior chunks before
upserting, so frequent edits don't accumulate stragglers.
"""
from __future__ import annotations

import logging
import uuid

from llama_index.core import Document
from llama_index.core.node_parser import SentenceSplitter

from app.ingestion.chroma_store import get_collection
from app.llm.embeddings import get_embedding_model

logger = logging.getLogger(__name__)


def _delete_note_chunks(user_id: str, note_id: str) -> int:
    col = get_collection()
    existing = col.get(
        where={
            "$and": [
                {"user_id": user_id},
                {"note_id": note_id},
                {"source_type": "note"},
            ]
        },
        include=[],
    )
    ids = list(existing.get("ids") or [])
    if not ids:
        return 0
    col.delete(ids=ids)
    return len(ids)


def delete_note_chunks(user_id: str, note_id: str) -> int:
    """Public wrapper used by the delete-note path."""
    removed = _delete_note_chunks(user_id, note_id)
    logger.info("note_ingestion: deleted %d chunks for note=%s", removed, note_id)
    return removed


def index_note(
    *,
    note_id: str,
    user_id: str,
    study_set_id: str,
    plain_text: str,
    title: str | None = None,
) -> list[str]:
    """Reindex a note: drop prior chunks, split, embed, upsert.

    Returns the IDs that were written. Empty list when `plain_text` is
    blank — we still wipe the old chunks so an empty note doesn't leak
    stale content into retrieval.
    """
    removed = _delete_note_chunks(user_id, note_id)
    stripped = (plain_text or "").strip()
    if not stripped:
        logger.info(
            "note_ingestion: cleared %d stale chunks for empty note=%s",
            removed,
            note_id,
        )
        return []

    splitter = SentenceSplitter(chunk_size=512, chunk_overlap=50)
    document = Document(text=stripped)
    nodes = splitter.get_nodes_from_documents([document])
    if not nodes:
        return []

    doc_title = (title or "Note").strip() or "Note"
    for i, node in enumerate(nodes):
        # Use a deterministic-ish ID so reruns don't collide with leftovers.
        node.id_ = f"note:{note_id}:{i}:{uuid.uuid4().hex[:8]}"
        node.metadata = {
            "user_id":       user_id,
            "study_set_id":  study_set_id,
            "document_id":   note_id,  # kept for shared scoping helpers
            "note_id":       note_id,
            "document_title": doc_title,
            "page_number":   0,
            "section_path":  "",
            "chunk_index":   i,
            "source_type":   "note",
        }

    embed_model = get_embedding_model()
    texts = [n.get_content() for n in nodes]
    embeddings = embed_model.get_text_embedding_batch(texts, show_progress=False)
    for node, embedding in zip(nodes, embeddings):
        node.embedding = embedding

    col = get_collection()
    col.upsert(
        ids=[node.node_id for node in nodes],
        embeddings=[node.embedding for node in nodes],
        documents=[node.get_content() for node in nodes],
        metadatas=[node.metadata for node in nodes],
    )
    logger.info(
        "note_ingestion: indexed note=%s with %d chunks (removed %d prior)",
        note_id,
        len(nodes),
        removed,
    )
    return [node.node_id for node in nodes]
