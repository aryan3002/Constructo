# Constructo — Backend Foundation (Wave 0)

AI-native construction-management backend. Wave 0 is the foundation other agents build on:
Pydantic contracts, the database schema, JWT auth, and the WhatsApp ingestion endpoint.
Event extraction, briefs, site CRUD, and the bridge/web app are **not** built here
(see `app/extraction`, `app/sites`, `app/brief` — empty packages marked "implemented in Wave 1").

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
| `DATABASE_URL` | `postgresql+asyncpg://constructo:constructo@localhost:5433/constructo` | async Postgres DSN |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis DSN (reserved for Wave 1 worker) |
| `JWT_SECRET` | dev placeholder (≥32 bytes) | HS256 signing key — **change in prod** |
| `INGEST_API_KEY` | `dev-ingest-key` | required `X-Ingest-Key` for `/api/v1/ingest` |

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
- **`enqueue_extraction`** in `app.ingestion.router` is a stub (returns `None`). Wave 1 wires
  it to Redis / a worker.

See `ARCHITECTURE.md` for the full contracts and import paths.
