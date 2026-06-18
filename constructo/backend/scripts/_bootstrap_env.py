"""Load the backend ``.env`` into ``os.environ`` for standalone scripts.

Why this exists: the app server gets its environment from the container (real
``os.environ``); pydantic ``Settings`` reads ``.env`` into the *Settings object*
but NOT into ``os.environ``. The extraction clients
(:func:`app.extraction.llm.get_llm_client`, OCR, STT, embeddings) read
``os.environ`` directly, so a script run via ``uv run`` sees no Azure creds and
silently falls back to the deterministic ``FakeLLMClient`` — which looks like it
"ran" but produces fake extractions.

Call :func:`load` from a script's ``main()`` entry point (NOT at import time)
to populate ``os.environ`` from ``constructo/backend/.env`` WITHOUT overriding
anything already set, so:
  * explicit CLI overrides (``DATABASE_URL=... STORAGE_BACKEND=s3 uv run ...``) win,
  * prod container env wins,
  * otherwise the local ``.env`` (incl. ``AZURE_OPENAI_*``) is used.

``load`` is called from CLI entry points only — never at import time — so a test
that imports a script module does NOT pull real creds into ``os.environ`` and
test isolation (no network, FakeLLM) is preserved.
"""
from __future__ import annotations

from pathlib import Path


def load() -> None:
    """Load the backend ``.env`` into ``os.environ`` (no override). Idempotent."""
    try:
        from dotenv import load_dotenv
    except ImportError:  # pragma: no cover - dotenv ships with pydantic-settings
        return
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.is_file():
        load_dotenv(env_path, override=False)
