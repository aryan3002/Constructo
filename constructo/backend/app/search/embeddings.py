"""Embeddings client abstraction for semantic search.

Mirrors the provider pattern in ``app.extraction.llm``: a provider-agnostic
:class:`EmbeddingsClient` protocol, a deterministic :class:`FakeEmbeddings` for
tests / no-key fallback (so importing this module never needs network access or
credentials), real OpenAI + Azure providers, and an env-selected
:func:`get_embeddings_client` factory.

The vector dimension MUST match the ``event_embeddings.embedding`` column
(``EMBEDDING_DIM`` = 1536, text-embedding-3-small). The fake produces unit-norm
vectors of that dimension so cosine math and the pgvector column both work.
"""
from __future__ import annotations

import hashlib
import math
import os
import re
from typing import Protocol, runtime_checkable

from app.models.event_embedding import EMBEDDING_DIM

# Model identifiers stored alongside each embedding row (the ``model`` column),
# so a future re-index can tell which vectors are stale.
FAKE_MODEL = "fake-deterministic-v1"
DEFAULT_OPENAI_EMBED_MODEL = "text-embedding-3-small"


@runtime_checkable
class EmbeddingsClient(Protocol):
    """Embeds a batch of texts into fixed-dimension float vectors.

    ``model`` identifies the producing model (persisted with each row).
    """

    model: str

    async def embed(self, texts: list[str]) -> list[list[float]]: ...


# ---------------------------------------------------------------------------
# Fake (tests / no-key fallback) — deterministic, network-free
# ---------------------------------------------------------------------------


_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall((text or "").lower())


class FakeEmbeddings:
    """Deterministic bag-of-words hashing embedder (no network).

    Each token is hashed into one of ``dim`` buckets and summed; the vector is
    L2-normalised. Two texts sharing tokens get a higher cosine similarity than
    two that share none, which is enough to exercise the *plumbing* (ANN query,
    filters, scoping, ranking) without depending on real semantic recall — tests
    must not assert recall quality, per the spec.
    """

    def __init__(self, dim: int = EMBEDDING_DIM, model: str = FAKE_MODEL) -> None:
        self.dim = dim
        self.model = model

    def _embed_one(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        tokens = _tokenize(text)
        if not tokens:
            # A non-zero but constant vector: avoids an all-zero row (cosine
            # distance is undefined against zero vectors in pgvector).
            vec[0] = 1.0
            return vec
        for tok in tokens:
            h = hashlib.sha256(tok.encode("utf-8")).digest()
            bucket = int.from_bytes(h[:4], "big") % self.dim
            # Sign from a second hash byte so distinct tokens can cancel/reinforce.
            sign = 1.0 if h[4] & 1 else -1.0
            vec[bucket] += sign
        norm = math.sqrt(sum(v * v for v in vec))
        if norm == 0.0:
            vec[0] = 1.0
            return vec
        return [v / norm for v in vec]

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]


# ---------------------------------------------------------------------------
# Real providers (OpenAI / Azure). Network only happens inside ``embed``.
# ---------------------------------------------------------------------------


class OpenAIEmbeddings:
    def __init__(self, api_key: str, model: str = DEFAULT_OPENAI_EMBED_MODEL) -> None:
        self.api_key = api_key
        self.model = model

    async def embed(self, texts: list[str]) -> list[list[float]]:
        try:
            from openai import AsyncOpenAI
        except ImportError as exc:  # pragma: no cover - only with the dep installed
            raise RuntimeError(
                "openai package not installed; install it or use FakeEmbeddings"
            ) from exc
        client = AsyncOpenAI(api_key=self.api_key)
        resp = await client.embeddings.create(model=self.model, input=texts)
        return [d.embedding for d in resp.data]


class AzureOpenAIEmbeddings:
    """Azure OpenAI embeddings — calls a *deployment name*, not a model name."""

    def __init__(
        self,
        *,
        api_key: str,
        endpoint: str,
        deployment: str,
        api_version: str,
        dimensions: int | None = None,
    ) -> None:
        self.api_key = api_key
        self.endpoint = endpoint
        self.deployment = deployment
        self.api_version = api_version
        self.model = deployment
        # When set, ask text-embedding-3-* to output this many dims (e.g. 1536 to
        # match the pgvector(1536) schema even when the deployment is -large/3072).
        self.dimensions = dimensions

    async def embed(self, texts: list[str]) -> list[list[float]]:
        try:
            from openai import AsyncAzureOpenAI
        except ImportError as exc:  # pragma: no cover - only with the dep installed
            raise RuntimeError(
                "openai package not installed; install it or use FakeEmbeddings"
            ) from exc
        client = AsyncAzureOpenAI(
            api_key=self.api_key,
            azure_endpoint=self.endpoint,
            api_version=self.api_version,
        )
        kwargs: dict = {"model": self.deployment, "input": texts}
        if self.dimensions:
            kwargs["dimensions"] = self.dimensions
        resp = await client.embeddings.create(**kwargs)
        return [d.embedding for d in resp.data]


def get_embeddings_client() -> EmbeddingsClient:
    """Return an :class:`EmbeddingsClient` selected by environment.

    Reads ``EMBEDDINGS_PROVIDER`` (falls back to ``LLM_PROVIDER``, default
    ``openai``):
      - ``azure``: needs ``AZURE_OPENAI_API_KEY``, ``AZURE_OPENAI_ENDPOINT``,
        ``AZURE_OPENAI_EMBED_DEPLOYMENT``, ``AZURE_OPENAI_API_VERSION``.
      - ``openai``: needs ``OPENAI_API_KEY`` (+ optional ``EMBEDDINGS_MODEL``).

    If the required credentials are missing, returns :class:`FakeEmbeddings` so
    indexing/search degrade gracefully offline and tests never hit the network.
    """
    provider = os.environ.get(
        "EMBEDDINGS_PROVIDER", os.environ.get("LLM_PROVIDER", "openai")
    ).lower()
    if provider == "azure":
        key = os.environ.get("AZURE_OPENAI_API_KEY")
        endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
        deployment = os.environ.get("AZURE_OPENAI_EMBED_DEPLOYMENT")
        api_version = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21")
        dims_raw = os.environ.get("AZURE_OPENAI_EMBED_DIMENSIONS")
        dimensions = int(dims_raw) if dims_raw else None
        if key and endpoint and deployment:
            return AzureOpenAIEmbeddings(
                api_key=key,
                endpoint=endpoint,
                deployment=deployment,
                api_version=api_version,
                dimensions=dimensions,
            )
    elif provider == "openai":
        key = os.environ.get("OPENAI_API_KEY")
        if key:
            model = os.environ.get("EMBEDDINGS_MODEL", DEFAULT_OPENAI_EMBED_MODEL)
            return OpenAIEmbeddings(api_key=key, model=model)
    return FakeEmbeddings()
