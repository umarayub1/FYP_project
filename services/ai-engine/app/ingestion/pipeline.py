import logging
import math
import pathlib
from typing import Callable, Optional
from llama_index.core import SimpleDirectoryReader
from llama_index.core.node_parser import SentenceSplitter
from app.llm.embeddings import get_embedding_model
from app.ingestion.chroma_store import upsert_chunks

logger = logging.getLogger(__name__)

# Smaller batch keeps per-batch progress events frequent even for small PDFs.
# At 32 chunks/batch, a 47-page PDF (~120 chunks) produces ≥3 embedding ticks,
# plus the chunking ticks below.
_EMBED_BATCH_SIZE = 32
_CHUNK_PROGRESS_EVERY = 25

ProgressCallback = Callable[[str, int, str], None]


def ingest_pdf(
    storage_path: str,
    user_id: str,
    study_set_id: str,
    document_id: str,
    on_progress: Optional[ProgressCallback] = None,
) -> list[str]:
    if on_progress:
        on_progress('ingestion:parsing', 2, 'Parsing PDF document')

    loader = SimpleDirectoryReader(input_files=[storage_path])
    documents = loader.load_data()

    if on_progress:
        on_progress('ingestion:parsing', 5, f'Parsed {len(documents)} page(s)')

    splitter = SentenceSplitter(chunk_size=512, chunk_overlap=50)
    nodes = splitter.get_nodes_from_documents(documents)

    total = len(nodes)
    if on_progress:
        on_progress('ingestion:chunking', 8, f'Chunking {total} segments')

    doc_title = pathlib.Path(storage_path).stem
    for i, node in enumerate(nodes):
        page_num = node.metadata.get('page_label', node.metadata.get('page_number', 0))
        node.metadata = {
            'user_id': user_id,
            'study_set_id': study_set_id,
            'document_id': document_id,
            'document_title': doc_title,
            'page_number': int(page_num) if str(page_num).isdigit() else 0,
            'section_path': '',
            'chunk_index': i,
        }
        # Emit chunking progress every _CHUNK_PROGRESS_EVERY nodes so the bar
        # advances during metadata assembly on multi-hundred-chunk PDFs.
        if on_progress and total > _CHUNK_PROGRESS_EVERY and (i + 1) % _CHUNK_PROGRESS_EVERY == 0:
            pct = 8 + int((i + 1) / total * 7)  # chunking spans 8 → 15 %
            on_progress('ingestion:chunking', pct, f'Prepared {i + 1}/{total} chunks')

    if on_progress:
        on_progress('ingestion:chunking', 15, f'{total} chunks ready')

    embed_model = get_embedding_model()
    num_batches = math.ceil(total / _EMBED_BATCH_SIZE) if total else 0
    logger.info("Embedding %d chunks in %d batch(es)", total, num_batches)

    for batch_start in range(0, total, _EMBED_BATCH_SIZE):
        batch = nodes[batch_start:batch_start + _EMBED_BATCH_SIZE]
        texts = [node.get_content() for node in batch]
        batch_embeddings = embed_model.get_text_embedding_batch(texts, show_progress=False)
        for node, embedding in zip(batch, batch_embeddings):
            node.embedding = embedding
        if on_progress:
            embedded_so_far = batch_start + len(batch)
            # embedding spans 15 → 90 %
            pct = int(15 + embedded_so_far / total * 75)
            on_progress(
                'ingestion:embedding',
                pct,
                f'Embedded {embedded_so_far}/{total} chunks',
            )

    if on_progress:
        on_progress('ingestion:embedding', 95, 'Writing to vector store')

    chunk_ids = upsert_chunks(nodes)

    if on_progress:
        on_progress('ingestion:embedding', 98, f'Stored {len(chunk_ids)} chunks')

    return chunk_ids
