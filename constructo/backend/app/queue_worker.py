"""RQ worker entrypoint for the extraction queue.

Run it with::

    uv run python -m app.queue_worker

It connects to ``settings.redis_url``, listens on ``settings.extraction_queue``,
and processes jobs enqueued by the ingest endpoint (each job runs
:func:`app.queue.run_handle_ingested`, which drives the async extraction worker).
"""
from __future__ import annotations

import logging

from rq import Queue, SimpleWorker

from app.config import settings
from app.queue import get_redis


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    conn = get_redis()
    queue = Queue(settings.extraction_queue, connection=conn)
    # SimpleWorker runs jobs in-process (no os.fork), which plays nicely with
    # asyncio.run inside the job and avoids macOS fork-safety surprises.
    worker = SimpleWorker([queue], connection=conn)
    logging.getLogger(__name__).info(
        "extraction worker started: queue=%s redis=%s",
        settings.extraction_queue,
        settings.redis_url,
    )
    worker.work()


if __name__ == "__main__":
    main()
