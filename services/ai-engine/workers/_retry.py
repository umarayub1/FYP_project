"""Shared retry + dead-letter helper for ingestion workers.

Job envelopes carry an ``attempts`` counter. On exception inside the job
body, the helper re-pushes the envelope (with ``attempts += 1``) onto the
same queue up to ``INGEST_MAX_ATTEMPTS`` times, then routes terminal
failures to a ``{queue}-dead`` queue for ops visibility.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Callable

import redis

from app.config import settings


def run_with_retry(
    r: redis.Redis,
    queue: str,
    job: dict,
    fn: Callable[[dict], None],
) -> None:
    """Execute ``fn(job)`` with retry-on-exception and dead-letter routing.

    The caller is responsible for any "terminal failure" side effects
    (status updates, user-visible events) — those should be triggered by
    ``on_terminal_failure`` if provided in the job envelope, or done
    explicitly via the returned exception in the caller. This helper
    only handles re-queue / DLQ mechanics.
    """
    attempts = int(job.get('attempts', 0))
    try:
        fn(job)
    except Exception as exc:
        attempts += 1
        if attempts < settings.ingest_max_attempts:
            job['attempts'] = attempts
            logging.warning(
                f'Job on {queue} failed (attempt {attempts}/{settings.ingest_max_attempts}): {exc} — retrying'
            )
            time.sleep(settings.ingest_retry_delay_s)
            r.lpush(queue, json.dumps(job))
            return
        job['attempts'] = attempts
        job['failureReason'] = str(exc)
        dead_queue = f'{queue}-dead'
        r.lpush(dead_queue, json.dumps(job))
        logging.error(f'Job on {queue} terminal failure after {attempts} attempts: {exc} — moved to {dead_queue}')
        raise
