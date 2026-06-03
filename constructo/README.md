# Constructo — Backend

[![CI](https://github.com/aryan3002/Constructo/actions/workflows/ci.yml/badge.svg)](https://github.com/aryan3002/Constructo/actions/workflows/ci.yml)

> This is the **backend** setup & development guide. For the project overview and the other
> apps (mobile, web, WhatsApp bridge), see the **[root README](../README.md)**.

The FastAPI backend + AI pipeline. The full loop is wired end-to-end: a WhatsApp message is
ingested, extracted into structured site events by a background worker, aggregated into a
nightly owner brief, and delivered over WhatsApp.

Pipeline: **bridge → `POST /api/v1/ingest` → Redis queue → extraction worker → `site_events`
→ nightly brief → WhatsApp send**, with the web dashboard reading events via
`GET /api/v1/sites/{id}/events`.

For a step-by-step run of the whole loop and a 5-minute demo script, see **[DEMO.md](DEMO.md)**.

## Tech stack

Python 3.12 · FastAPI · SQLAlchemy 2.x (async) · Alembic · Pydantic v2 · pydantic-settings ·
PostgreSQL 16 + pgvector · Redis 7 · pytest + pytest-asyncio · ruff · [uv](https://docs.astral.sh/uv/).

## Prerequisites

- [uv](https://docs.astral.sh/uv/getting-started/installation/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Docker (for Postgres + Redis)

## 1. Start infrastructure

```bash
# from the repo root (where docker-compose.yml lives)
docker compose up -d
```

Brings up:
- `postgres` (image `pgvector/pgvector:pg16`) on host port **5433** (container 5432)
- `redis` (image `redis:7`) on host port **6379**

Check health: `docker compose ps`.

## 2. Configure environment

Defaults in `app/config.py` already match docker-compose, so a `.env` is optional. To override:

```bash
cp .env.example backend/.env   # then edit
```

| Var | Default | Purpose |
|-----|---------|---------|
| `DATABASE_URL` | `…/constructo` (use `constructo_wave2` for this branch) | async Postgres DSN |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis DSN for the extraction queue |
| `JWT_SECRET` | dev placeholder (≥32 bytes) | HS256 signing key — **change in prod** |
| `INGEST_API_KEY` | `dev-ingest-key` | required `X-Ingest-Key` for `/api/v1/ingest` |
| `EXTRACTION_SYNC` | `false` | run extraction inline on ingest (no worker) — handy for tests/local |
| `EXTRACTION_QUEUE` | `extraction` | RQ queue name |
| `MEDIA_DIR` | `./media` | **shared** folder: bridge writes media, extraction reads it — set both to the same absolute path |
| `ENABLE_SCHEDULER` | `false` | enable the in-process nightly-brief scheduler |
| `BRIEF_HOUR` / `BRIEF_TIMEZONE` | `7` / `Asia/Kolkata` | when the nightly brief runs |
| `WHATSAPP_SEND_MODE` | `dry_run` | `dry_run` \| `url` \| `cloud_api` |
| `WHATSAPP_SEND_URL` | — | relay endpoint for `url` mode |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | — | Cloud API Bearer token + phone number id (`cloud_api` mode) |
| `OPENAI_API_KEY` | — | enables real LLM/OCR/STT; absent → deterministic Fakes |

> **Wave 2 DB:** set the DB name to `constructo_wave2`
> (`…@localhost:5433/constructo_wave2`). Create it once with
> `docker exec constructo-postgres-1 psql -U constructo -d constructo -c "CREATE DATABASE constructo_wave2"`.

## 3. Install dependencies

```bash
cd backend
uv sync
```

## 4. Run migrations

```bash
cd backend
uv run alembic upgrade head     # creates all tables + enables pgvector
uv run alembic downgrade base   # tear everything down (reversible)
```

## 5. Run the API

```bash
cd backend
uv run uvicorn app.main:app --reload
```

- Health check: <http://127.0.0.1:8000/healthz> → `{"status":"ok"}`
- OpenAPI: <http://127.0.0.1:8000/openapi.json> · Swagger UI: <http://127.0.0.1:8000/docs>

## 5b. Run the extraction worker

`/api/v1/ingest` stores the message then enqueues an extraction job on Redis. A worker
process drains that queue and writes `site_events`:

```bash
cd backend
uv run python -m app.queue_worker
```

The worker runs `app.extraction.worker.handle_ingested` for each message (via a small sync
wrapper, since RQ workers are synchronous). If Redis is down, `/ingest` still returns 200 —
the row is stored and the enqueue is skipped with a warning (no 500). For tests / quick local
runs without a worker, set `EXTRACTION_SYNC=true` to run extraction inline on ingest.

## 5c. Nightly brief scheduler (optional)

The API can schedule the nightly owner brief in-process (APScheduler). Off by default:

```bash
cd backend
ENABLE_SCHEDULER=true BRIEF_HOUR=7 uv run uvicorn app.main:app
# runs brief.schedule.run_nightly() daily at 07:00 Asia/Kolkata
```

You can also run it once, on demand: `uv run python -m app.brief.schedule`.

## 5d. WhatsApp send modes

`app.brief.send.send_brief(to_phone, text)` supports three modes via `WHATSAPP_SEND_MODE`:

- `dry_run` (default): logs and returns `False`. No network.
- `url`: POSTs `{to_phone, text}` to `WHATSAPP_SEND_URL`.
- `cloud_api`: POSTs to `https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_NUMBER_ID}/messages`
  with `Authorization: Bearer {WHATSAPP_TOKEN}` and a WhatsApp text body.

> **Cloud API caveats.** Free-form text only delivers inside the **24-hour customer-service
> window** — the owner/test number must have messaged your WhatsApp number within the last
> 24h; otherwise Meta requires a **pre-approved template**. The Meta test access token also
> **expires every 24h** — use a permanent **System User** token for a real pilot.
> Pilot `phone_number_id`: `1094260843779305`.

## 5f. WhatsApp bot "Nivaan" (the live loop)

The bot is wired into the running system (W3):

- **Inbound → bot.** After a message is ingested and extracted, the worker calls
  `app.bot.handle.handle_inbound` (best-effort — a bot failure never fails ingestion).
  Routine site updates get a quiet ✅ reaction; direct questions get an evidence-bearing
  answer; replies to the morning brief settle the matching decision (the one-ledger handoff).
  Gated by `BOT_ENABLED` (default true).
- **Brief → WhatsApp.** When `ENABLE_SCHEDULER=true`, the nightly job now delivers the
  brief over WhatsApp per company via `app.bot.brief_delivery.deliver_brief` — it sends the
  brief with numbered, tappable actions and persists the number→decision map into
  `owner_briefs.payload.reply_map` (no new table). The owner replies "1" / "approve" /
  "hold 1" / "show proof 2" and the bot acts on the right decision, idempotently.
- **Transport.** `BOT_SEND_VIA` selects `dry_run` (default, no network) | `bridge` (the Node
  Baileys bridge — can post to groups and react; **pilot setting**) | `cloud_api`. For the
  bridge, set `BRIDGE_URL` (default `http://localhost:8088`) and a `BRIDGE_KEY` that matches
  the bridge's. The Node bridge exposes `POST /send` + `GET /health` (see
  `whatsapp-bridge/`); start it with the same `BRIDGE_KEY`.

Thin test/trigger endpoints (bearer-auth'd): `POST /api/v1/bot/handle {raw_message_id}`,
`/api/v1/bot/deliver-brief {company_id?, date?}`, `/api/v1/bot/reply {chat_jid, text}`.

## 5e. Site events read endpoint

`GET /api/v1/sites/{site_id}/events?date=YYYY-MM-DD&limit=&cursor=` returns
`{items: [SiteEvent…], next_cursor}`, scoped by site visibility (owner/pm see any company
site; supervisors only assigned sites). The web dashboard reads this directly (it no longer
needs mock fallback once the API is up).

### Try the auth + ingest flow

```bash
# login (OTP stub: any phone + otp "000000" -> token; user auto-created)
TOKEN=$(curl -s -X POST localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+15551112222","otp":"000000"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

# current user
curl -s localhost:8000/api/v1/auth/me -H "Authorization: Bearer $TOKEN"

# ingest a WhatsApp message (requires the ingest key)
curl -s -X POST localhost:8000/api/v1/ingest \
  -H 'Content-Type: application/json' -H 'X-Ingest-Key: dev-ingest-key' \
  -d '{"source":"baileys","external_group_id":"g1","sender_id":"s1","media_type":"text","text":"Cement delivered","sent_at":"2026-05-28T08:00:00"}'
```

## 6. Tests

```bash
cd backend
uv run pytest          # spins up a transactional `<db>_test` database automatically
```

Postgres must be running (tests use a real DB; `uuid[]`/`jsonb` need Postgres, not SQLite).
Each test runs inside a rolled-back transaction, so nothing persists between tests.

## 7. Lint / format

```bash
cd backend
uv run ruff check .     # lint (must be clean)
uv run ruff format .    # format
```

## Conventions for downstream waves

- All routes under `/api/v1`, JSON snake_case, OpenAPI at `/openapi.json`.
- Cursor pagination: `?limit=50&cursor=...` → `{"items": [...], "next_cursor": ...}`
  (`app.common.pagination.Page`, `encode_cursor`, `decode_cursor`).
- Errors: `{"error": {"code": str, "message": str}}` — raise `app.common.errors.AppError`.
- Auth: JWT bearer. `app.auth.deps.get_current_user` / `require_role(*roles)`;
  `app.auth.scoping.visible_site_ids(session, user)`.

### Wave 0 deviations / notes (intentional)

- **Login auto-creates users** in a shared `"Default Company"` with role `owner`. Real
  onboarding/role assignment is a later wave.
- **`visible_site_ids`** takes `(session, user)` (the spec wrote `(user)`) because it queries
  the DB. `owner`/`pm` see all company sites; `supervisor` returns `[]` until Wave 1 adds a
  user↔site assignment table.
- **`enqueue_extraction`** now enqueues a real RQ job on Redis (Wave 2) — see
  `app/queue.py` and `app/queue_worker.py`. It is resilient (no 500 if Redis is down) and
  supports inline `EXTRACTION_SYNC` mode for tests/local.

See `ARCHITECTURE.md` for the full contracts and import paths, and **[DEMO.md](DEMO.md)** for
the full end-to-end run + demo script.
