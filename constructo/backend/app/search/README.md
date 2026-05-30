# Search — index + query design (Phase B)

Search over the **site ledger** (extracted `site_events`): hybrid **semantic
(pgvector cosine) + structured filters**, scoped to the caller's visible sites
and role. Answers plain-language questions like *"show cement deliveries Site A
this week"* or *"which sites had labor below plan"* and returns a list of events,
**each carrying its evidence** (the source WhatsApp messages it was extracted
from) — the product's "evidence on tap" promise (P1). When nothing is a real
match it says **"not sure"** rather than inventing an answer (P5).

## Search schema — what gets indexed

One embedding row per `SiteEvent`, stored in the B0-owned `event_embeddings`
table (`vector(1536)`, HNSW cosine index `ix_event_embeddings_embedding_hnsw`).
**No new migrations** — the table already exists.

### The embedded document (`index.build_document`)
We embed a compact natural-language rendering of the event, **not** raw JSON:

```
"<event_type>: <summary> | <label>=<value>; <label>=<value> ..."
e.g. "material delivery: 50 bags cement delivered by ACC | material=cement; quantity=50; vendor=ACC"
```

- `event_type` is spelled with spaces (`material_delivery` -> `material
  delivery`) so a query for *"deliveries"* lands near it semantically.
- `summary` is the human sentence — the main signal.
- A short, **stable, ordered** tail of salient `fields` (material, quantity,
  vendor, headcount, amount, severity, description, …). Stable ordering makes
  re-indexing idempotent.

The producing model id (`text-embedding-3-small`, Azure deployment name, or
`fake-deterministic-v1` in tests) is stored in `event_embeddings.model` so a
future re-index can detect stale vectors.

### Metadata filter fields (NOT embedded — joined at query time)
These already live on `site_events`; pushing them down to SQL is cheaper and
exact, so they are filters, not vector signal:

| Field         | Source column            | Used for                                  |
|---------------|--------------------------|-------------------------------------------|
| `site_id`     | `site_events.site_id`    | scoping + explicit site filter            |
| `occurred_on` | `site_events.occurred_on`| date-range filters (today / this week / …)|
| `event_type`  | `site_events.event_type` | type filter (deliveries, attendance, …)   |

Scope is always intersected with `effective_visible_site_ids` (owner/pm → all
company sites; others → assigned sites). A requested `site_id` can only *narrow*
scope, never widen it.

## Query design

`POST /api/v1/search` `{ q, site_id?, event_type?, date_from?, date_to?, limit? }`

1. **Parse** `q` (`query.parse_query`, deterministic keyword heuristics):
   lifts high-precision structured filters out of the sentence —
   - event type (`"deliveries"` → `material_delivery`, `"labor"` → `attendance`, …)
   - relative date range (`today`, `yesterday`, `this/last week`, `this month`, `last N days`)
   - a `Site X` name hint (resolved against visible site names; only an
     unambiguous single match narrows scope)
   The **residual** words become the semantic text we embed.
   Explicit request filters always **override** the parsed ones (the UI sends
   them when the user taps a chip). The parse result is echoed back in
   `query` so the user sees exactly how we understood them.
2. **Embed** the residual semantic text (env-selected client; `FakeEmbeddings`
   offline / in tests — never hits the network).
3. **Hybrid query**: ANN over `event_embeddings` `JOIN site_events JOIN sites`,
   `WHERE site_id IN (visible)` + the structured filters, ordered by cosine
   distance (`embedding <=> :q`), limited.

### Ranking
- Primary signal: **cosine similarity** = `1 - (embedding <=> query)`, range
  `0..1` (HNSW index, `vector_cosine_ops`).
- Structured filters act as **hard pre-filters** (they constrain the candidate
  set; they don't re-weight scores).
- **Relevance floor** `SIMILARITY_FLOOR = 0.15`: hits below it are dropped. If
  *nothing* clears the floor (or the caller has no visible sites), the response
  is `answerable=false` → the UI shows a "not sure" state and offers to broaden
  the search. This is the honest-AI guardrail.

## Indexing

- `index_event(session, site_event_id)` — embed one event's document and **upsert**
  into `event_embeddings` (idempotent; unique on `site_event_id`).
- `index_all_unindexed(session)` — backfill every event without an embedding
  (batched). Safe to re-run.

### Where this should hook into ingestion (NOT wired here)
After a `SiteEvent` is persisted in the extraction pipeline
(`app/extraction/worker.py` / `app/ingestion/*`), call
`await index_event(session, event.id)` — ideally enqueued / fire-and-forget so
indexing never blocks ingestion, and so an embeddings-provider outage degrades
to "searchable later" rather than failing the write. Deliberately left unwired
to respect ownership boundaries; `index_all_unindexed` covers the gap until then.

## Testing

Tests use `FakeEmbeddings` (deterministic bag-of-words hashing → unit vectors,
no network). They assert **plumbing**: filter push-down, site scoping, evidence
presence, idempotent upsert, and the `answerable=false` ("not sure") path — NOT
ANN recall quality, which a fake embedder can't represent.
