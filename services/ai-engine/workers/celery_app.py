import logging
from celery import Celery
from kombu import Queue

from app.config import settings

celery_app = Celery("synapse", broker=settings.redis_url, backend=settings.redis_url)

celery_app.conf.task_queues = [
    Queue("pdf-ingestion"),
    Queue("flashcard-batch"),
    Queue("feynman-eval"),
]
celery_app.conf.task_default_queue = "pdf-ingestion"
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]


@celery_app.task(name="process_pdf_ingestion", bind=True, max_retries=3)
def process_pdf_ingestion(self, job_id: str) -> dict:
    logging.info("stub: received pdf-ingestion job %s", job_id)
    return {"status": "stub", "job_id": job_id}


@celery_app.task(name="generate_flashcard_batch", bind=True, max_retries=3)
def generate_flashcard_batch(self, job_id: str) -> dict:
    logging.info("stub: received flashcard-batch job %s", job_id)
    return {"status": "stub", "job_id": job_id}


@celery_app.task(name="evaluate_feynman_session", bind=True, max_retries=3)
def evaluate_feynman_session(self, job_id: str) -> dict:
    logging.info("stub: received feynman-eval job %s", job_id)
    return {"status": "stub", "job_id": job_id}
