import json
import logging

import httpx
import redis

from app.config import settings
from app.ingestion.pipeline import ingest_pdf
from app.ingestion.retrieval import invalidate_bm25
from workers._retry import run_with_retry

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

QUEUE = 'pdf-ingestion'

r = redis.from_url(settings.redis_url)
pub = redis.from_url(settings.redis_url)


def publish_progress(
    document_id: str,
    stage: str,
    percent: int,
    message: str,
    user_id: str | None = None,
    study_set_id: str | None = None,
) -> None:
    payload = json.dumps({
        'event': 'ingestion:progress',
        'stage': stage,
        'percent': percent,
        'message': message,
        'documentId': document_id,
        'userId': user_id,
        'studySetId': study_set_id,
    })
    pub.publish(f'ingestion:{document_id}', payload)


def publish_failed(document_id: str, reason: str, user_id: str | None = None) -> None:
    payload = json.dumps({
        'event': 'ingestion:failed',
        'stage': 'error',
        'percent': 0,
        'message': reason,
        'documentId': document_id,
        'userId': user_id,
    })
    pub.publish(f'ingestion:{document_id}', payload)


def update_document_status(
    document_id: str,
    ingestion_status: str,
    vector_chunk_ids: list[str] | None = None,
    failure_reason: str | None = None,
) -> None:
    body: dict = {'ingestionStatus': ingestion_status}
    if vector_chunk_ids is not None:
        body['vectorChunkIds'] = vector_chunk_ids
    if failure_reason is not None:
        body['failureReason'] = failure_reason
    headers: dict[str, str] = {}
    if settings.internal_secret:
        headers['x-internal-secret'] = settings.internal_secret
    httpx.patch(
        f'{settings.core_service_url}/internal/documents/{document_id}/status',
        json=body,
        headers=headers,
        timeout=10.0,
    )


def process_job(job: dict) -> None:
    document_id = job['documentId']
    user_id = job['userId']
    study_set_id = job['studySetId']
    storage_path = job['storagePath']

    publish_progress(document_id, 'processing', 0, 'Starting ingestion', user_id, study_set_id)
    update_document_status(document_id, 'processing')

    def on_progress(stage: str, percent: int, message: str) -> None:
        publish_progress(document_id, stage, percent, message, user_id, study_set_id)

    chunk_ids = ingest_pdf(storage_path, user_id, study_set_id, document_id, on_progress)
    invalidate_bm25(user_id, study_set_id)
    update_document_status(document_id, 'ready', chunk_ids)
    publish_progress(document_id, 'complete', 100, 'Processing complete', user_id, study_set_id)
    logging.info(f'Ingested {len(chunk_ids)} chunks for document {document_id}')


HEARTBEAT_INTERVAL_S = 30


def run() -> None:
    logging.info(f'PDF ingestion worker started, listening on redis list {QUEUE}')
    import time
    last_heartbeat = time.monotonic()
    while True:
        result = r.brpop(QUEUE, timeout=5)
        now = time.monotonic()
        if now - last_heartbeat >= HEARTBEAT_INTERVAL_S:
            logging.info(f'PDF ingestion worker waiting for jobs on {QUEUE}…')
            last_heartbeat = now
        if not result:
            continue
        _, raw = result
        job = json.loads(raw)
        document_id = job.get('documentId', 'unknown')
        try:
            run_with_retry(r, QUEUE, job, process_job)
        except Exception as exc:
            reason = str(exc)
            logging.error(f'Ingestion permanently failed for {document_id}: {reason}')
            try:
                update_document_status(document_id, 'failed', failure_reason=reason)
            except Exception as status_exc:
                logging.error(f'Failed to mark document {document_id} failed: {status_exc}')
            publish_failed(document_id, reason, job.get('userId'))


if __name__ == '__main__':
    run()
