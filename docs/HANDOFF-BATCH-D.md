# Handoff: Neev launch fixes, from Batch D onward

Written 2026-10-27 for a fresh chat that picks up the pre-launch fix work.
Everything here is on branch `claude/bold-goodall-11ksuo` (pushed). There is no
PR; don't open one unless the founder asks.

## Read first

1. `docs/APP-REVIEW-2026-10-24.md` is the pre-launch review. It has stable IDs:
   - **S1–S9:** stop-ship issues
   - **T1–T9:** wrong facts and lost data
   - **D1–D7:** design
   - the store checklist, backend security table, web console notes and plan
2. This file.
3. `constructo/backend/DEPLOY.md` (updated in Batch C).

## How the founder wants to work

- **Batches, one at a time.** Before each batch, describe what you'll do in plain language and wait for "go". Don't start a batch without it.
- **One remote session per batch.** Run each batch in its own Claude Code session, created with `mcp__claude-code-remote__create_session`:
  - `source_url` https://github.com/aryan3002/Constructo
  - `source_revision` and `outcome_branch`: `claude/bold-goodall-11ksuo`
  - tags `["neev-launch-fixes"]`
  - a self-contained brief
- **Verify independently when the founder says a batch is done:**
  - pull the branch
  - run the full test suites and lint
  - run migrations up, down and up again
  - re-run the original repro or attack against a local server
  - check for stray files
  - fix small gaps yourself with clear commits
- **Then present the next batch.**
- **Commit hygiene:** one commit per item, plain messages, never commit `.env` or `dump.rdb`.

## Status

| Batch | Scope | State |
|---|---|---|
| A | Mobile release blockers: S1 junk tabs, S5/D3 back controls, insets, dev gallery, T7 | Done, verified |
| B | Mobile session and chat integrity: T1 outbox, T2 sign-out reset, T3 401 handling, S9 client push routing | Done, verified |
| C | Backend security: S3 signup, S4 prod guard, S9 approvals, payment roles, T4 audience, rate limits, S6 deletion cleanup, server logout | Done, verified (details below) |
| D | Homeowner wrong facts (T5) and lost captures (T6) | **Next.** Presented to the founder; waiting for "go" |
| E | Money guard rails (T8 client) and capture queue (T9) | Pending |
| F | Account deletion for all roles (S6 client) and store config | Pending |
| G | Web console trust bugs | Pending |

Outside the batches: the real SMS/WhatsApp OTP provider and the launch roles
are still the founder's decisions.

### Batch C: what changed (needed for D–G)

- **Signup (S3).**
  - `POST /auth/login` with an unknown phone now returns 404 `not_registered` unless `signup: true`. The web console sends `signup: true`; mobile doesn't.
  - Each signup gets its own company, still named "Default Company" until the web first-run renames it.
  - `scripts/report_shared_companies.py` (read-only) lists pooled companies; the founder should run it against production.
- **Who can decide (S9).**
  - Kinds `approval` and `hold_payment` are owner-only: approve, reject, batch, assign, respond and acknowledge. Batch skips what the caller may not decide.
  - Kind `generic`: owner or PM. `respond`/`acknowledge` on non-money kinds is also open to the assignee.
  - Refusals return 403 `owner_only` (money) or `forbidden`.
  - Homeowners get 403 on `/approvals`.
- **Decision audience (T4).**
  - New `decisions.audience` column (`internal` | `homeowner`, migration `b5c6d7e8f9a0`).
  - Homeowner endpoints only return `homeowner` decisions.
  - Spec sign-offs and homeowner questions are `homeowner`. Old seeded "Approve revised kitchen layout" rows backfilled as internal; re-running `seed_home_demo` fixes them.
- **Payments and roles.** Payment create/update/delete is limited to owner, pm and accountant. A PM can't create an owner.
- **Rate limits.**
  - In-memory by default (`app/common/ratelimit.py`; Redis optional via `RATE_LIMIT_BACKEND`). Refusals are 429 `rate_limited` with `Retry-After`.
  - Five wrong OTPs lock a phone for 15 minutes.
  - Join codes minted without a phone expire after 14 days (410 `code_expired`).
  - **Production must set `TRUSTED_PROXY_HOPS=1`**, now in DEPLOY.md.
- **Production guard (S4).**
  - `APP_ENV=prod` refuses to boot with the dev or a short (under 24 chars) `INGEST_API_KEY`, or a weak `BRIDGE_KEY` when the bot sends via the bridge.
  - In prod, docs are off, no dev OTP hint is returned, and private-network CORS is off.
  - Step-up tokens aren't accepted as login tokens.
- **Sign-out and deletion.**
  - Access tokens carry a `jti`. `POST /auth/logout` revokes the token (`revoked_tokens`, migration `c6d7e8f9a0b1`). Mobile and web sign-out call it.
  - Account deletion removes push tokens and scrubs the person's name from `raw_messages` and photo comments.

### Follow-ups found while verifying C (already assigned)

- **Batch E:**
  - The mobile owner "approve all" posts `batch/approve`, but the server only accepts `batch/resolve`, so it has always returned 422.
  - Web and mobile approve buttons must handle 403 `owner_only` for PMs and supervisors ("Propose to owner").
- **Batch F:**
  - Invited crew can't sign in on the app until they accept the invite link on the web.
  - Web invite acceptance now creates an empty company per invitee, because the web login sends `signup: true`.
  - Recommended fix: let an invited number sign in directly, matched to its pending invite, on both app and web.
  - Deletion still leaves a deleted person's name inside the `raw_messages.raw` JSON and extracted event text.

## Batch D: what was presented (awaiting "go")

**Homeowner screens show only true facts, and nothing homeowners send gets lost.**
Mostly the homeowner side of the mobile app (`constructo/mobile/app/(homeowner)/`),
with backend additions only where the data is missing.

**Wrong facts (T5)**
1. Home's "Total paid ₹22,500" is really the sum of change-order cost changes. Show the real amount paid from payment records, or label it for what it is.
2. The "Pre-approved" payment pill is hard-coded. Derive it or remove it.
3. The milestone "On track" pill is hard-coded and still shows after the handover date. Derive it from the schedule (on track, behind, handed over) or remove it.
4. The Design screen shows "Pending your approval" on every drawing. Show it only on drawings actually waiting for the homeowner.
5. The Messages participant list is hard-coded. Show the real people, or remove it.

**Lost sends (T6)**
6. Photos on an issue report are never attached to the request. Upload them and attach the keys.
7. Intake reference photos upload a device `file://` path. Use the profiler's presigned upload.
8. The change-comment Send button throws the note away. Wire it to the server, or remove it.

Review locations (line numbers may have drifted):
- `(homeowner)/home.tsx:779, 1024`
- `updates.tsx:431, 1239`
- `design.tsx:836`
- `issue.tsx:320`
- `app/intake.tsx:273`

Every fix needs a test, plus a walk through the homeowner screens in a web export to confirm what's on screen comes from data.

## Local environment recipe

- **Postgres 16 with pgvector:**
  - `apt-get install -y postgresql-16-pgvector`
  - init a cluster in a postgres-owned directory on port 5433
  - role and database `constructo`/`constructo` (superuser)
- **Redis:** start it from `/tmp` (`cd /tmp && redis-server --daemonize yes`) so `dump.rdb` never lands in the repo.
- **`constructo/backend/.env`** (gitignored):
  ```
  DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo
  REDIS_URL=redis://localhost:6379/0
  ```
- **Backend tests:** `JWT_SECRET=ci-test-secret-32-bytes-minimum-aaaa INGEST_API_KEY=ci-ingest-key uv run pytest -q`
  - Baseline is about 1764 passing, 1 skipped and 1 old failure to ignore: `test_profiler_pinterest.py::test_reference_from_board_link_flag_on_creates_references`.
  - Lint: `uv run ruff check`.
- **Seed and serve:**
  ```
  uv run alembic upgrade head
  uv run python -m scripts.seed_demo
  EXTRACTION_SYNC=true uv run uvicorn app.main:app --port 8000
  ```
  Local uvicorn trusts `X-Forwarded-For` from localhost, so use `--no-proxy-headers` when testing per-IP limits.
- **Mobile:** `cd constructo/mobile && npm ci && npm run typecheck && npx jest`
  - Web export for screen checks: `EXPO_PUBLIC_API_BASE=http://localhost:8000 npx expo export --platform web`
  - Then serve with an SPA fallback and drive it with Playwright (already installed; don't reinstall). Put the token in localStorage `constructo.token`.
- **Web:** `cd constructo/web && npm ci && npm test && npm run build`
- **Seed logins (dev OTP `000000`):**
  - Sunrise owner `+919800000001`, PM `+919800000002`, accountant `+919800000004`, mukadam `+919800000006`
  - Homeowner `+919800000010` (join code `SUNRISE-HOME`)
  - Owner `+919810000001`, engineer `+919810000010`, architect `+919810000020`
  - Design-loop homeowners `+919820000001` and `+919820000002`

## Other work on this branch (not part of the batches)

`constructo/video/` holds the Neev launch films (Remotion) and their reusable
motion kit. That work continues in the original chat; leave it alone unless
asked.
