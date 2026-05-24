import json
import logging
import uuid
import asyncio

import httpx
import redis
from langchain_core.messages import HumanMessage

from app.config import settings
from app.ingestion.chroma_store import get_collection
from app.llm.providers import get_llm
from workers._retry import run_with_retry

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

QUEUE = 'flashcard-batch'

r = redis.from_url(settings.redis_url)
pub = redis.from_url(settings.redis_url)


def publish_batch_result(user_id: str, job_id: str, flashcards: list[dict], error: str | None = None) -> None:
    payload = json.dumps({
        'event': 'batch:complete',
        'jobId': job_id,
        'flashcards': flashcards,
        'error': error,
    })
    pub.publish(f'user:{user_id}', payload)


def publish_batch_failed(user_id: str, job_id: str, reason: str) -> None:
    payload = json.dumps({
        'event': 'batch:failed',
        'jobId': job_id,
        'error': reason,
    })
    pub.publish(f'user:{user_id}', payload)


def fetch_document_chunks(user_id: str, study_set_id: str, document_id: str) -> list[str]:
    """Retrieve all chunks for a specific document from ChromaDB."""
    col = get_collection()
    # ARCHITECTURE.md §4.2: always filter by user_id + study_set_id
    results = col.get(
        where={"$and": [{"user_id": user_id}, {"study_set_id": study_set_id}, {"document_id": document_id}]},
    )
    return results['documents'] if results['documents'] else []


async def generate_flashcards_from_chunks(
    chunks: list[str],
    study_set_id: str,
    count: int,
) -> list[dict]:
    """Use LLM to generate flashcards from document chunks."""
    context_chunks = chunks[:10]
    context = "\n\n---\n\n".join(context_chunks)

    llm = get_llm()
    prompt = f"""Generate {count} flashcards from the following study material.

MATERIAL:
{context}

Return ONLY a valid JSON array of flashcard objects with this exact shape:
[
  {{"front": "<question or concept>", "back": "<answer or explanation>", "type": "standard"}}
]

Rules:
- Each card tests exactly ONE concept
- Front: concise question or term
- Back: clear, complete answer (1-3 sentences max)
- Generate exactly {count} cards or as many as the material supports
- Do not include numbering, markdown, or any text outside the JSON array"""

    response = await llm.ainvoke([HumanMessage(content=prompt)])
    content = response.content
    start = content.find('[')
    end = content.rfind(']') + 1
    if start == -1 or end == 0:
        return []
    return json.loads(content[start:end])


def store_flashcards(
    user_id: str,
    study_set_id: str,
    document_id: str,
    flashcards: list[dict],
) -> list[dict]:
    """POST each flashcard to core-service /internal/flashcards."""
    stored = []
    for fc in flashcards:
        try:
            resp = httpx.post(
                f'{settings.core_service_url}/internal/flashcards',
                json={
                    'userId': user_id,
                    'studySetId': study_set_id,
                    'type': fc.get('type', 'standard'),
                    'front': fc.get('front', ''),
                    'back': fc.get('back', ''),
                    'sourceDocumentId': document_id,
                },
                timeout=10.0,
            )
            if resp.status_code == 201:
                stored.append(resp.json())
        except Exception as exc:
            logging.warning(f'Failed to store flashcard: {exc}')
    return stored


def process_job(job: dict) -> None:
    job_id = job.get('jobId') or str(uuid.uuid4())
    user_id = job['userId']
    study_set_id = job['studySetId']
    document_id = job['documentId']
    count = job.get('count', 50)

    chunks = fetch_document_chunks(user_id, study_set_id, document_id)
    if not chunks:
        # Empty source is a terminal, non-retryable user-facing failure.
        publish_batch_result(user_id, job_id, [], error='No chunks found for document')
        return

    flashcards_raw = asyncio.run(generate_flashcards_from_chunks(chunks, study_set_id, count))
    stored = store_flashcards(user_id, study_set_id, document_id, flashcards_raw)
    publish_batch_result(user_id, job_id, stored)
    logging.info(f'Generated {len(stored)} flashcards for job {job_id}')


def run() -> None:
    logging.info(f'Flashcard batch worker started, listening on redis list {QUEUE}')
    while True:
        result = r.brpop(QUEUE, timeout=5)
        if not result:
            continue
        _, raw = result
        job = json.loads(raw)
        job_id = job.get('jobId') or str(uuid.uuid4())
        user_id = job.get('userId', '')
        try:
            run_with_retry(r, QUEUE, job, process_job)
        except Exception as exc:
            reason = str(exc)
            logging.error(f'Batch generation permanently failed for job {job_id}: {reason}')
            if user_id:
                publish_batch_failed(user_id, job_id, reason)


if __name__ == '__main__':
    run()
