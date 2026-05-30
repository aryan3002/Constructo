"""Phase B search: indexing + hybrid (semantic + structured) query over the site ledger.

Public surface:
  - :func:`app.search.embeddings.get_embeddings_client` — env-selected embeddings client
    (Azure / OpenAI / deterministic Fake fallback, mirroring ``app.extraction.llm``).
  - :func:`app.search.index.index_event` / :func:`app.search.index.index_all_unindexed` —
    embed a SiteEvent's text and upsert into ``event_embeddings``.
  - :data:`app.search.router.router` — the ``/api/v1/search`` endpoint.

See ``README.md`` for the search schema (what gets embedded, filter fields, ranking).
"""
