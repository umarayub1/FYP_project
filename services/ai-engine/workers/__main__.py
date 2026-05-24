"""Default entrypoint for the PDF ingestion worker.

Allows `python -m workers` (no submodule path) to launch the BRPOP loop
defined in ``pdf_ingestion_worker.run``. The flashcard batch worker keeps
its dedicated ``python -m workers.flashcard_batch_worker`` invocation.
"""

from workers.pdf_ingestion_worker import run


if __name__ == '__main__':
    run()
