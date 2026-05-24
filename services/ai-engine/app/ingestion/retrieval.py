from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from rank_bm25 import BM25Okapi
from sentence_transformers import CrossEncoder

from app.ingestion.chroma_store import get_chunks_in_scope, query_chunks
from app.llm.embeddings import get_embedding_model

logger = logging.getLogger(__name__)

_CROSS_ENCODER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"
_cross_encoder: CrossEncoder | None = None

BM25_CACHE_TTL = 300  # 5 minutes


@dataclass
class _BM25Entry:
    bm25: BM25Okapi
    corpus_ids: list[str]
    corpus_docs: list[str]
    corpus_metadatas: list[dict]
    cached_at: float


_bm25_cache: dict[str, _BM25Entry] = {}


def invalidate_bm25(user_id: str, study_set_id: str) -> None:
    """Force BM25 rebuild on next query after document ingestion."""
    _bm25_cache.pop(f"{user_id}:{study_set_id}", None)


def _get_cross_encoder() -> CrossEncoder:
    global _cross_encoder
    if _cross_encoder is None:
        _cross_encoder = CrossEncoder(_CROSS_ENCODER_MODEL)
    return _cross_encoder


def _rrf(ranked_lists: list[list[str]], k: int = 60) -> list[str]:
    """Reciprocal Rank Fusion over multiple ranked ID lists."""
    scores: dict[str, float] = {}
    for ranked in ranked_lists:
        for rank, doc_id in enumerate(ranked):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores, key=lambda x: scores[x], reverse=True)


def hybrid_retrieve(
    query: str,
    user_id: str,
    study_set_id: str | None,
    referenced_documents: list[str] | None = None,
    top_k: int = 5,
) -> list[dict]:
    """
    Dense + BM25 retrieval merged via RRF, then reranked with a cross-encoder.

    Returns chunks as dicts: {content, document_id, document_title, page_number,
    chunk_index, chunk_id}. Coach uses the metadata to emit citation references the
    frontend can link back to source.

    Priority bias (ARCHITECTURE.md §5.2): referenced_documents → active doc → recent docs.
    referenced_documents chunks are boosted to the front of the candidate pool before
    cross-encoder scoring so the reranker sees them at their best position.
    """
    embed_model = get_embedding_model()
    query_emb = embed_model.get_query_embedding(query)

    # ── Dense retrieval (top 20 candidates) ───────────────────────────────
    dense_results = query_chunks(query_emb, user_id, study_set_id, top_k=20)
    dense_ids: list[str] = dense_results["ids"][0] if dense_results.get("ids") else []
    dense_docs: list[str] = dense_results["documents"][0] if dense_results.get("documents") else []
    dense_metas: list[dict] = (
        dense_results["metadatas"][0]
        if dense_results.get("metadatas")
        else [{} for _ in dense_ids]
    )

    def _wrap(doc_id: str, content: str, meta: dict, score: float | None = None) -> dict:
        return {
            "chunk_id": doc_id,
            "content": content,
            "document_id": meta.get("document_id", ""),
            "document_title": meta.get("document_title", ""),
            "page_number": meta.get("page_number", 0),
            "chunk_index": meta.get("chunk_index", 0),
            # Notes-vs-PDF discriminator (Plan F.2). PDF chunks omit
            # source_type, so default to "pdf"; notes carry "note" + note_id.
            "source_type": meta.get("source_type", "pdf"),
            "note_id": meta.get("note_id", ""),
            # Cross-encoder relevance score. None when rerank was skipped
            # (candidate pool ≤ top_k or rerank fallback). Used by Plan F.1
            # so Coach can flag "no useful sources" even when the corpus is
            # non-empty but every chunk is irrelevant.
            "relevance_score": score,
        }

    # ── BM25 sparse retrieval (5-minute cache per user+study_set) ────────
    bm25_key = f"{user_id}:{study_set_id}"
    cached_entry = _bm25_cache.get(bm25_key)
    if cached_entry is not None and (time.time() - cached_entry.cached_at) < BM25_CACHE_TTL:
        corpus_ids = cached_entry.corpus_ids
        corpus_docs = cached_entry.corpus_docs
        corpus_metadatas = cached_entry.corpus_metadatas
        bm25 = cached_entry.bm25
    else:
        corpus_results = get_chunks_in_scope(user_id, study_set_id, limit=500)
        corpus_ids = corpus_results.get("ids") or []
        corpus_docs = corpus_results.get("documents") or []
        corpus_metadatas = corpus_results.get("metadatas") or []
        if not corpus_docs:
            return [_wrap(i, d, m) for i, d, m in zip(dense_ids, dense_docs, dense_metas)][:top_k]
        logger.info("Building BM25 index for %s (%d docs)", bm25_key, len(corpus_docs))
        tokenized_corpus = [doc.lower().split() for doc in corpus_docs]
        bm25 = BM25Okapi(tokenized_corpus)
        _bm25_cache[bm25_key] = _BM25Entry(
            bm25=bm25,
            corpus_ids=list(corpus_ids),
            corpus_docs=list(corpus_docs),
            corpus_metadatas=list(corpus_metadatas),
            cached_at=time.time(),
        )

    if not corpus_docs:
        return [_wrap(i, d, m) for i, d, m in zip(dense_ids, dense_docs, dense_metas)][:top_k]

    bm25_scores = bm25.get_scores(query.lower().split())
    top_bm25_indices = sorted(
        range(len(bm25_scores)), key=lambda i: bm25_scores[i], reverse=True
    )[:20]
    bm25_ids = [corpus_ids[i] for i in top_bm25_indices]

    # ── Reciprocal Rank Fusion ────────────────────────────────────────────
    merged_ids = _rrf([dense_ids, bm25_ids])

    id_to_doc: dict[str, str] = dict(zip(corpus_ids, corpus_docs))
    id_to_meta: dict[str, dict] = dict(zip(corpus_ids, corpus_metadatas)) if corpus_metadatas else {}
    for doc_id, doc, meta in zip(dense_ids, dense_docs, dense_metas):
        id_to_doc[doc_id] = doc
        id_to_meta[doc_id] = meta

    candidate_ids: list[str] = [i for i in merged_ids if i in id_to_doc][:15]

    if not candidate_ids:
        return [_wrap(i, d, m) for i, d, m in zip(dense_ids, dense_docs, dense_metas)][:top_k]

    # ── Referenced-document boost ─────────────────────────────────────────
    # Chunks whose metadata document_id matches a referenced doc go first so
    # the cross-encoder can rank them against the query at top position.
    if referenced_documents:
        boosted, rest = [], []
        for doc_id in candidate_ids:
            meta = id_to_meta.get(doc_id, {})
            if meta.get("document_id") in referenced_documents:
                boosted.append(doc_id)
            else:
                rest.append(doc_id)
        candidate_ids = boosted + rest

    # ── Cross-encoder reranking ───────────────────────────────────────────
    # We always score (not only when pool > top_k) because Plan F.1 needs the
    # relevance score to decide whether to surface the "no sources matched"
    # callout on irrelevant queries.
    try:
        cross_enc = _get_cross_encoder()
        pairs = [(query, id_to_doc[i]) for i in candidate_ids]
        scores = cross_enc.predict(pairs)
        reranked = sorted(zip(scores, candidate_ids), reverse=True, key=lambda p: p[0])
        return [
            _wrap(i, id_to_doc[i], id_to_meta.get(i, {}), float(score))
            for score, i in reranked[:top_k]
        ]
    except Exception as exc:
        logger.warning("Cross-encoder reranking failed (%s); falling back to RRF order.", exc)
        return [_wrap(i, id_to_doc[i], id_to_meta.get(i, {})) for i in candidate_ids[:top_k]]
