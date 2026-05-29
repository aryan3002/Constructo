# Constructo Wave 0 — Foundation Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. Work test-first (RED→GREEN→REFACTOR), commit per task with conventional-commit messages.

**Goal:** Stand up the backend foundation (contracts, models, auth, ingestion) that Wave 1+ agents build on.

**Architecture:** FastAPI app with SQLAlchemy 2.x async + asyncpg against Postgres 16 (pgvector enabled, unused). Pydantic v2 contracts are the cross-agent source of truth. JWT bearer auth with OTP-stub login. `/api/v1/ingest` stores a `RawMessage` and stub-enqueues extraction. One Alembic migration creates all tables.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x async, Alembic, Pydantic v2, pydantic-settings, PyJWT, pytest + pytest-asyncio, ruff, uv.

---

## File Structure

```
constructo/
├── README.md, ARCHITECTURE.md, docker-compose.yml, .env.example
└── backend/
    ├── pyproject.toml, alembic.ini, alembic/{env.py,script.py.mako,versions/0001_initial.py}
    └── app/
        ├── main.py            # app, /healthz, router registration
        ├── config.py          # Settings (pydantic-settings)
        ├── db.py              # async engine, sessionmaker, Base, get_session
        ├── contracts/events.py
        ├── models/            # one module per table + Base import
        ├── auth/{jwt.py,deps.py,scoping.py,router.py}
        ├── ingestion/{base.py,router.py}
        ├── common/{errors.py,pagination.py}
        └── extraction/ sites/ brief/   # empty pkgs, __init__ docstring "implemented in Wave 1"
    └── tests/{conftest.py,test_contracts.py,test_auth.py,test_ingest.py}
```

## Tasks

### Task 1: Project scaffold + tooling (config — TDD-exempt)
- pyproject.toml (deps + ruff + pytest config), docker-compose.yml (pgvector/pg16 on 5433, redis 7 on 6379), .env.example, alembic.ini/env, package dirs with `__init__.py`. Bring `docker compose up -d`. Commit.

### Task 2: Contracts (`app/contracts/events.py`)
- Paste exact contract code. Test: round-trip `RawMessage` and `SiteEvent` (serialize→deserialize equality; enum values; defaults). RED→GREEN→commit.

### Task 3: DB layer + models + migration
- `db.py` (engine/sessionmaker/Base/get_session). SQLAlchemy models for all 7 tables using pg `UUID`, `JSONB`, `ARRAY(UUID)`. Alembic migration `0001_initial` creating all tables + `CREATE EXTENSION IF NOT EXISTS vector`. Test: `alembic upgrade head` then assert tables exist; model insert round-trip via transactional fixture. Commit.

### Task 4: Auth (`app/auth/*`)
- `jwt.py` encode/decode; `router.py` POST `/api/v1/auth/login` (otp=="000000", get-or-create user in default company, return `{token}`) + GET `/api/v1/auth/me`; `deps.py` `get_current_user`, `require_role`; `scoping.py` `visible_site_ids`. Tests: login→token→/me; wrong otp→401; visible_site_ids for owner vs supervisor. Commit.

### Task 5: Ingestion (`app/ingestion/*`)
- `base.py` exact ABC. `router.py` POST `/api/v1/ingest` validating `X-Ingest-Key`==INGEST_API_KEY, storing RawMessage, stub-enqueue, return `{id}`. Tests: valid key→row stored + id returned; wrong key→401. Commit.

### Task 6: common/errors + pagination
- `errors.py` (error envelope + handler), `pagination.py` (cursor helpers). Wire handler in main. Test envelope shape. Commit.

### Task 7: Docs + final verification
- README (all commands), ARCHITECTURE.md (contracts section). Run full acceptance: compose up, alembic upgrade, uvicorn serves /healthz + /openapi.json, pytest passes, ruff clean. Open PR.

## Self-Review notes
- `visible_site_ids`: no user↔site assignment table exists in Wave 0 schema → owner/pm get all company sites; supervisor returns `[]` with documented TODO for Wave 1 assignment table.
- Auto-created login users default to role `owner` and a shared default company (documented in README).
- Tests run against the Postgres test DB (arrays/jsonb need pg, not sqlite); transactional fixture wraps each test in a rolled-back SAVEPOINT.
