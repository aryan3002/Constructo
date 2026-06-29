# Constructo

[![CI](https://github.com/aryan3002/Constructo/actions/workflows/ci.yml/badge.svg)](https://github.com/aryan3002/Constructo/actions/workflows/ci.yml)

**AI-native construction management for Indian SMB builders — and the homeowners they build for.**

Construction teams already run their projects on WhatsApp: photos, voice notes, "24 mazdoor aaye," challans, "slab poured today." Constructo turns that chaos into a single, trustworthy source of operational truth, then hands **each person exactly the slice they need** — in the language and format they already use.

> One ledger, three surfaces. **WhatsApp** captures, the **contractor app/dashboard** decides, the **homeowner app** reassures.

---

## How it works

```
 WhatsApp groups                Constructo backend (FastAPI)                   Surfaces
 ───────────────                ────────────────────────────                  ────────
 photos · voice ──┐   POST /api/v1/ingest                         ┌─▶ Contractor web dashboard
 challans · text  ├──▶  raw_messages ──▶ extraction worker ──▶ site_events ─┤   (owner / PM today)
 "slab poured"  ──┘   (Redis queue, LLM/OCR/STT)              │           ├─▶ WhatsApp bot "Nivaan"
                                                              │           │   (7am owner brief, Q&A,
                                                  nightly owner brief ────┘   tappable approvals)
                                                              │
                                                  published slice ──────────▶ Homeowner app
                                                  (human-curated, calm)         (Daylight theme)
```

**The two postures (the core product idea).** Same binary, same ledger, opposite stance:
- **Contractor side — AI is an *accelerator*.** Dense, evidence-first, decision-ready. A 7am brief turns five noisy WhatsApp groups into "here are the 3 things that need you today, each with proof one tap away."
- **Homeowner side — AI is a *translator behind glass*.** Calm, warm, anxiety-reducing. The contractor is the publisher; **raw AI never reaches the homeowner** — every photo is a real human-taken photo, status is a *time-bar* (never a fake "% complete"), and the app's success is *earned absence* ("nothing needs you today").

This trust boundary — the **Trust Membrane** — is the moat, and it's enforced in code (curated "published slice" tables, human-gated captions, abstain-on-uncertainty).

---

## Monorepo layout

Everything lives under [`constructo/`](constructo/):

| Component | Path | What it is | Stack |
|---|---|---|---|
| **Backend** | [`constructo/backend`](constructo/backend) | The API + AI pipeline (ingest → extract → brief → bot), and every role's data surface | Python 3.12 · FastAPI · SQLAlchemy 2 (async) · Postgres 16 + pgvector · Redis 7 · [uv](https://docs.astral.sh/uv/) |
| **Mobile** | [`constructo/mobile`](constructo/mobile) | One role-branched Expo app — **homeowner** (Daylight) shipped, **contractor** (Blueprint) phased | Expo (SDK 56) · expo-router · TanStack Query · i18n en/hi |
| **Web** | [`constructo/web`](constructo/web) | The owner/PM dashboard over the backend | React 18 · Vite · TypeScript · TanStack Query · Tailwind |
| **WhatsApp bridge** | [`constructo/whatsapp-bridge`](constructo/whatsapp-bridge) | Streams WhatsApp **group** messages into `/api/v1/ingest` | Node · TypeScript · Baileys — **⚠ pilot only** (see its README) |

Backend modules of note: `auth · ingestion · extraction · brief · bot · capture · homeowner · search · sites · dpr · reconcile · payments · permits · notifications · publish · storage`.

---

## Quick start (≈5 min to the full loop)

**Prereqs:** [uv](https://docs.astral.sh/uv/getting-started/installation/) · Docker (Postgres + Redis) · Node 18+ (for the apps).

```bash
# 1. Infra (Postgres+pgvector on :5433, Redis on :6379)
cd constructo && docker compose up -d

# 2. Backend
cd backend
[ -f .env ] || cp ../.env.example .env
uv sync
uv run alembic upgrade head
EXTRACTION_SYNC=true uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
#  → health: http://127.0.0.1:8000/healthz   · docs: /docs

# 3. (optional) seed demo data + smoke every role
uv run python -m scripts.seed_demo
bash scripts/smoke_login.sh
```

Then run a client:

```bash
# Web dashboard — runs on mock data with zero backend:
cd constructo/web && npm install && VITE_USE_MOCKS=true npm run dev   # http://localhost:5173

# Mobile app:
cd constructo/mobile && npm install
[ -f .env ] || cp .env.example .env     # set EXPO_PUBLIC_API_BASE (see mobile README for device/emulator URLs)
npx expo start -c
```

**Auth everywhere is phone + OTP `000000`** (dev stub). Homeowners sign in with a builder-minted join code; staff sign in with phone + OTP.

📖 **Deeper guides:** end-to-end run + 5-minute demo script → [`constructo/DEMO.md`](constructo/DEMO.md) · backend setup, env vars, WhatsApp modes → [`constructo/README.md`](constructo/README.md) · architecture & contracts → [`constructo/ARCHITECTURE.md`](constructo/ARCHITECTURE.md).

---

## AI providers

Every AI seam (LLM, OCR, STT, embeddings, vision, translation) is a **provider-agnostic Protocol with a network-free Fake**. With **no API key**, the system runs end-to-end on deterministic Fakes (great for tests/local). Set a provider + key (`OPENAI_*` or `AZURE_OPENAI_*`) to switch on real inference — no code change, just env vars.

## Deployment

Pilot stack: **Azure Container Apps** (API) · **Neon** (Postgres 16 + pgvector) · **Cloudflare R2** (media) · **Azure OpenAI** (inference). One always-on replica running extraction inline (`EXTRACTION_SYNC=true`) with the in-process 7am-brief scheduler. Full step-by-step runbook: [`constructo/backend/DEPLOY.md`](constructo/backend/DEPLOY.md).

## Tests & CI

[CI](.github/workflows/ci.yml) gates `main` and every PR on two jobs:
- **Backend** — `ruff check` + `pytest` (real Postgres+pgvector + Redis services; each test in a rolled-back transaction).
- **Mobile** — `npm run typecheck` + `jest`.

```bash
cd constructo/backend && uv run ruff check . && uv run pytest   # backend
cd constructo/mobile  && npm run typecheck && npm test          # mobile
```

## Status

- **Backend** — full WhatsApp→truth→brief loop wired and deployable; role surfaces for owner/PM/supervisor + the homeowner published slice.
- **Homeowner app** — the flagship; built first (auth, the 4-tab Daylight shell, photos, updates, design, settings, offline/i18n).
- **Contractor app** — phased; the web dashboard + WhatsApp bot serve contractors today, with the Blueprint mobile branch following.
- **WhatsApp bridge** — pilot-only (Baileys is against WhatsApp ToS; use a disposable pilot number).

## Repository conventions

- All API routes under `/api/v1`, JSON snake_case, OpenAPI at `/openapi.json`.
- Cursor pagination `?limit=&cursor=` → `{items, next_cursor}`; errors as `{error:{code,message}}`.
- Auth: JWT bearer; role + per-member scoping. Status is **always color + glyph + label**, never color alone. Devanagari-first, voice/photo before forms.

---

*Pilot-stage project — no open-source license yet. The product strategy, AI-native specs, and design system live in a separate Obsidian vault.*

<!-- 2026-06-28: chat photo reliability — load, send, and photo-as-face fixes shipped (#226–#230). -->
