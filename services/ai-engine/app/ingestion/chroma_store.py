import chromadb
from app.config import settings

_client: chromadb.HttpClient = None  # type: ignore[assignment]


def _get_client() -> chromadb.HttpClient:
    global _client
    if _client is None:
        _client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
    return _client


def get_collection(name: str = 'synapse'):
    return _get_client().get_or_create_collection(name)


def upsert_chunks(nodes: list, collection_name: str = 'synapse') -> list[str]:
    col = get_collection(collection_name)
    col.upsert(
        ids=[node.node_id for node in nodes],
        embeddings=[node.embedding for node in nodes],
        documents=[node.get_content() for node in nodes],
        metadatas=[node.metadata for node in nodes],
    )
    return [node.node_id for node in nodes]


def get_chunks_in_scope(user_id: str, study_set_id: str | None, limit: int = 500) -> dict:
    """Fetch a corpus of chunks for BM25 indexing, scoped to user/study_set."""
    col = get_collection()
    where = (
        {"user_id": user_id}
        if study_set_id is None
        else {"$and": [{"user_id": user_id}, {"study_set_id": study_set_id}]}
    )
    return col.get(where=where, limit=limit, include=["documents", "metadatas"])


def query_chunks(
    query_embedding: list | None,
    user_id: str,
    study_set_id: str | None,
    top_k: int = 10,
    document_id: str | None = None,
):
    """Semantic search over the user's chunks.

    - user_id always filters (ARCHITECTURE.md §4.2).
    - study_set_id filters when set (scoped mode); global mode is §5.3.
    - document_id (optional) narrows to a single PDF/note — used by Feynman
      when the user picks a specific source.
    - When query_embedding is None, falls back to `col.get(...)` so callers
      can fetch the first `top_k` chunks of a document without computing an
      embedding (G.2 opening-question grounding).
    """
    col = get_collection()
    filters = [{"user_id": user_id}]
    if study_set_id is not None:
        filters.append({"study_set_id": study_set_id})
    if document_id is not None:
        filters.append({"document_id": document_id})
    where = filters[0] if len(filters) == 1 else {"$and": filters}

    if query_embedding is None:
        res = col.get(where=where, limit=top_k, include=["documents", "metadatas"])
        # Shape match: query() returns {documents: [[...]]} (list of lists).
        docs = list(res.get("documents") or [])
        metas = list(res.get("metadatas") or [])
        ids = list(res.get("ids") or [])
        return {
            'documents': [docs],
            'metadatas': [metas],
            'ids':       [ids],
        }

    return col.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        where=where,
    )


def delete_chunks_for_document(user_id: str, document_id: str) -> int:
    """Remove every chunk for one document. Returns the count removed.

    Scoped by both user_id and document_id so a malicious or misrouted
    request can't wipe another user's chunks even if document_id collides.
    """
    col = get_collection()
    where = {"$and": [{"user_id": user_id}, {"document_id": document_id}]}
    existing = col.get(where=where, include=[])
    ids = list(existing.get("ids") or [])
    if not ids:
        return 0
    col.delete(ids=ids)
    return len(ids)


def move_chunks_to_study_set(user_id: str, document_id: str, study_set_id: str) -> int:
    """Rewrite study_set_id metadata on all chunks for a document.

    Used when a document is moved between StudySets so scoped retrieval
    surfaces it under the new set immediately. Returns the count updated.
    """
    col = get_collection()
    where = {"$and": [{"user_id": user_id}, {"document_id": document_id}]}
    existing = col.get(where=where, include=["metadatas"])
    ids       = list(existing.get("ids") or [])
    metadatas = list(existing.get("metadatas") or [])
    if not ids:
        return 0
    for meta in metadatas:
        if isinstance(meta, dict):
            meta["study_set_id"] = study_set_id
    col.update(ids=ids, metadatas=metadatas)
    return len(ids)


def get_chunks_for_page(user_id: str, document_id: str, page: int, limit: int = 6) -> list[str]:
    """Fetch up to `limit` chunks for a specific document page.

    Used by comprehension checkpoints to ground question generation in the
    text the user just read.
    """
    col = get_collection()
    res = col.get(
        where={"$and": [
            {"user_id": user_id},
            {"document_id": document_id},
            {"page_number": page},
        ]},
        limit=limit,
        include=["documents"],
    )
    return list(res.get("documents") or [])
