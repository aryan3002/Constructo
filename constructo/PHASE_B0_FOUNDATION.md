# Phase B0 — Shared Foundation (read before building Phase B features)

This branch lands the **shared schema + i18n scaffolding** that all Phase B
feature agents build on. It exists so the Alembic chain stays linear.

> **RULE FOR FEATURE AGENTS: do NOT add new Alembic migrations.** Every table
> you need already exists below. Add endpoints/screens against these tables. If
> you genuinely need a schema change, coordinate — don't autogenerate a parallel
> migration (they collide).

Migration: `backend/alembic/versions/b9b464b07c0b_phase_b0_foundation_*.py`
(down_revision `5e049b843974`). Verified to apply cleanly on a fresh DB.

New dependency: **`pgvector`** (Python) for the embedding column. `conftest.py`
now runs `CREATE EXTENSION IF NOT EXISTS vector` so `create_all` works in tests.

## New tables & key fields

All models live in `backend/app/models/` and are registered on `Base.metadata`.

### `payments` — payment TRACKING (no rail; Constructo never moves money)
`id, company_id→companies, site_id→sites (nullable), direction[payment_direction:
homeowner_to_contractor|contractor_to_supplier], counterparty_name, amount
Numeric(14,2), currency (default 'INR'), paid_on, method (text, informational:
upi/cash/cheque/bank), reference_no, status[payment_status: recorded(default)|
confirmed|disputed], notes, source_event_id→site_events (nullable),
created_by→users (nullable), created_at`

### `permits` — government approvals / permitting lifecycle
`id, company_id→companies, site_id→sites, permit_type (text e.g. commencement/
RERA/NOC-fire/water/electrical/occupancy), authority, status[permit_status:
not_started(default)|applied|under_review|approved|rejected|expired], applied_on,
expected_on, decided_on, expiry_on, reference_no, notes, created_by→users
(nullable), created_at`
→ expiry/renewal **alerts** are computed by a feature agent off `expiry_on`.

### `decisions` — approvals/decisions with an SLA state machine
`id, company_id→companies, site_id→sites (nullable), kind[decision_kind: approval|
homeowner_question|hold_payment|generic], title, detail, raised_by (bare uuid,
nullable — may be a non-user homeowner), assigned_to (bare uuid, nullable —
usually the owner), state[decision_state: pending(default)|acknowledged|resolved|
rejected|escalated], sla_due_at, resolved_at, resolution_note, evidence_event_ids
(uuid[]), created_at, updated_at`
→ `raised_by`/`assigned_to` are intentionally **FK-free**. The SLA clock +
escalation transitions are owned by a feature agent.

### `site_baselines` — per-site expected values for risk detection
`id, site_id→sites (UNIQUE — one row per site), expected_daily_headcount (int,
nullable), notes, updated_by (uuid, nullable), updated_at`

### `event_embeddings` — semantic-search index (pgvector)
`id, site_event_id→site_events (UNIQUE), embedding vector(1536), model,
created_at` + HNSW index `ix_event_embeddings_embedding_hnsw`
(`vector_cosine_ops`).
→ **No backfill here.** A feature agent owns indexing + the query path. 1536 =
OpenAI text-embedding-3-small; change in your own migration only if you must.

### `users.language` (new column)
`language` text, nullable, server default `'en'`. Added to the model
(`app/models/user.py`) — `users` is not contract-frozen, so this is the
low-risk path (no shadow accessor needed).

## i18n (frontend)

Scaffolding lives in `web/src/i18n/` and `<LanguageProvider>` is already mounted
in `web/src/main.tsx`. **Full key convention + usage:
[`web/src/i18n/README.md`](web/src/i18n/README.md).**

TL;DR: `const t = useT(); t('action.approve')`. Add keys to `en.ts` first
(source of truth + types), then mirror in `hi.ts` (typed, so a missing key fails
the build). `setLanguage('hi')` persists to localStorage and best-effort
`PATCH /api/v1/users/me {language}` — add that endpoint to make server-side
language sync live (the column already exists).
