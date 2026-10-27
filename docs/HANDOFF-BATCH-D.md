# Handoff: Neev launch fixes, from Batch D onward

Written 2026-10-27 for a fresh chat that picks up the pre-launch fix work, and
updated the same day as Batches D and E were verified (Batch F is next).
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
| D | Homeowner wrong facts (T5) and lost captures (T6) | Done, verified (details below) |
| E | Money guard rails (T8 client) and capture queue (T9) | Done, verified (details below) |
| F | Account deletion for all roles (S6 client) and store config | **Next.** Presented to the founder; waiting for "go" and the inputs listed under Batch F |
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

### Batch D: what changed (needed for E–G)

Run in session `session_01UneWbgUazQm5EctGtLAiD4` (9 commits, `e89361f`..`c11344c`),
plus 3 fixes from verification (`937ae92`, `5b8096b`, `1c581b6`).

- **Home payments (T5).** `spend_summary` gains `total_paid` (homeowner→builder payments, disputed excluded, via `site_homeowner_paid` in `payments/router.py`, the same rule as the builder's "received"; null when nothing is recorded) and `approved_change_count`. The card shows "Paid so far", "Changes so far" and "N changes · M approved". The "Pre-approved" pill is gone. Updates takes `?tab=changes`.
- **Schedule pills (T5).** `src/screens/homeowner/schedule.util.ts` is the one rule for every schedule pill: on track, running late, past handover date or handed over, judged on the phone's local date. `targetHandoverOn()` gives Home and Updates one handover date for both the label and the pill.
- **Drawings (T5).** No "Pending your approval" anywhere; Plans shows a "Latest drawing" card. The drawing screen's Approve, Comment and Request-changes stubs are untouched (Batch F's placeholder cleanup).
- **Household (T5).** `GET /homeowner/members/roster` now answers every household member. Owners get the manager view. Family and advisors get active members only, with `phone`, `join_code`, `invite_link` null and `notif_prefs` empty. The Messages strip, inbox row and conversation header are built from it.
- **Request photos (T6).** `homeowner_requests.photo_ids` (migration `d7e8f9a0b1c2`). Create takes up to 5 of the caller's own visit-photo ids (else 422 `invalid_photo`). `RequestOut.photos` returns `{id, url}` on the homeowner endpoints and the builder's `GET /api/v1/requests`. My Requests and the web Requests view show thumbnails.
- **Upload guards (T6).** `voice_key` (on `/requests` and `/flag`) must be under `homeowner/{site}/voice/`, else 422 `invalid_voice_key`. A reference `image_url` must be http(s) or under `homeowner/{site}/design/` or `design/{site}/`, else 422 `invalid_image_url`. Old device-path reference rows are hidden, not deleted.
- **Sends (T6).** Intake uploads reference photos before saving them and says when one fails; style picks are awaited and retried. A change comment becomes a request titled "About a change: …".
- **Verified:** backend 1788 passed, plus the known Pinterest failure; mobile 69 suites / 547 tests; web 137 files / 884 tests; ruff, typecheck and build clean; migrations up/down/up clean. On-screen walk-through done as the owner and as a family member.

### Follow-ups found while verifying D (not yet assigned)

- Home still says "Today · all calm" above "One thing for you" (D2; a one-line fix).
- The drawing detail says "Previous version not available" even when v1 is in the list.
- On the web build, the Messages inbox row title ("Your builder") collapses to zero width, and photo uploads fail (React Native file objects aren't web `Blob`s). This only matters if the homeowner app is served on the web (`mobile/vercel.json`).
- `/requests` resolves to the root `app/requests.tsx` on web, not My Requests (known; "two screens answer /requests").
- The demo seeds overlap (two "now" stages, duplicate Foundation and Handover).
- An unnamed member shows as "—" on Members; the role line above it still says who they are.

### Batch E: what changed (needed for F–G)

Run in session `session_01UneWbgAurSR8ZgfTK4kVhy` (12 commits, `7838703`..`1c03547`). Verification needed no code fixes.

- **Approvals route fix.** `POST /approvals/batch/{action}` is now registered before the `/{decision_id}/...` routes. Before, `batch/reject`, `batch/acknowledge` and the app's `batch/approve` matched `/{decision_id}/reject|acknowledge|approve` and failed UUID validation with 422. The app's "Approve all" now sends `resolve`.
- **Money confirm and undo (T8).**
  - Kinds `approval` and `hold_payment` ask once (`MoneyConfirmSheet`, copy in `src/screens/owner/approvals.util.ts`).
  - The action is then held for 5 s with Undo (`src/owner/pendingDecisions.ts`). It is sent early when the app leaves the foreground, and before sign-out revokes the token.
  - Decided rows are hidden until sent or undone.
- **Errors (T8).**
  - `src/ui/Toast.tsx` has tones (success, error, info) and an optional action button.
  - `src/ui/toastBus.ts` lets non-React code show toasts. Every role layout mounts a `ToastProvider`.
  - The root `QueryClient`'s `MutationCache` shows an error toast for any mutation without its own `onError` or `meta: { errorHandled: true }`.
  - `src/api/errorText.ts` maps errors to plain en/hi text.
- **Non-owners (T8).** Web `/approvals` shows "Only the owner can approve this. It's waiting in their inbox." instead of the fake "Propose" toast, and reports batch `skipped`. Supervisors see "Only the owner can decide this." on money asks.
- **Capture queue (T9).**
  - One module-level drainer with a lock (`src/offline/useOutbox.ts`).
  - Per-user queues `constructo.outbox.user.<id>` and a "Couldn't send" list `constructo.outbox.failed.<id>` (`src/offline/outbox.ts`). Sign-out keeps them; account deletion clears them.
  - `client_capture_id` on `POST /api/v1/capture` is stored as `raw_messages.provider_message_id = "{user}:{id}"`, reusing `uq_raw_provider_message`, with no migration. A repeat answers 201 `status: "duplicate"`.
  - Sites are cached per user (`src/offline/siteCache.ts`).
- **Verified:**
  - Test totals: backend 1794 passed, plus the known Pinterest failure; mobile 78 suites / 613 tests; web 137 files / 887 tests. Ruff, typecheck, web lint and build are clean.
  - On screen:
    - The owner confirm, undo and send. The server stays pending after Undo and is resolved after the window.
    - A red error when a send fails, with the row coming back.
    - Approve all with 3 items, 1 of them money.
    - The supervisor and PM owner-only notes.
    - "Couldn't send" with a 403 reason.
    - The cached site with the API unreachable, and the offline message with no cache.
  - Four simultaneous sends of one capture id gave one row.

### Follow-ups found while verifying E (not yet assigned)

- Sign-out waits for a money decision still in its undo window. Offline that can take about 15 s and then fail; the decision simply stays pending, but the owner may not see the failure toast while signing out.
- A queued capture that hits a temporary server error while the phone is online waits for the next reconnect or capture before retrying (pre-existing).
- The supervisor's task screen is still titled "Reply" on a money item they can't answer.
- If the server is down the first time someone opens Capture (no cached sites), it says "You're offline" rather than "can't reach the server".
- The web Approvals page hides "Approve selected" from PMs even for non-money items.

## Batch F: what was presented (awaiting "go")

**The app meets the App Store and Google Play rules for accounts, privacy and release.**

**Account and deletion (S6 client)**
1. One Account section in every role (owner, homeowner, site engineer, architect, accountant, PM, mukadam): language, privacy policy and terms, delete account, sign out. Today only `owner/more.tsx` and `(homeowner)/settings.tsx` can delete (`src/auth/useDeleteAccount.ts`).
2. A public web page to delete your account (Google Play needs its URL): sign in with phone and code, then delete, using the same server deletion as the app.
3. Deletion also scrubs the person's name from `raw_messages.raw` JSON and from extracted event text (C did sender names, photo comments and push tokens).

**Privacy and consent (S7, S8)**
4. Privacy policy and terms links at sign-in, in every Account section and on the web console. Only help text exists today (`src/auth/ui/GuideSheet.tsx`).
5. A one-time AI consent screen saying what is sent to OpenAI/Azure, recorded on the server.
6. Android: block `READ_MEDIA_IMAGES/VIDEO/AUDIO`, `ACCESS_MEDIA_LOCATION` and the old storage permissions; set `isAccessMediaLocationEnabled` to false (`mobile/app.json`). Save photos with write-only access.

**Invited crew (C follow-up)**
7. An invited staff number signs in directly, in the app or on the web, into the inviting company with the invited role. Web invite acceptance no longer sends `signup: true` and creates an empty company.

**Release settings**
8. `eas.json`: `autoIncrement` for production.
9. `supportsTablet: false`.
10. Release builds refuse to start without `EXPO_PUBLIC_API_BASE`: no `10.0.2.2` fallback (`src/api/config.ts`).
11. `EXPO_PUBLIC_WEB_BASE` set for builds, so invite and vendor-confirm links open the web app.
12. A one-colour Android notification icon (today `./assets/icon.png`).
13. "Coming soon" placeholders (8 screens, including the drawing Approve/Comment stubs) are hidden from store builds, or turned into something that works today, e.g. "Message your builder".

**Founder inputs:** the privacy-policy and terms URLs (and a check that the policy names OpenAI/Azure); what happens when someone declines AI consent; the web address for links (today `constructo-topaz.vercel.app`). Not blocking: store submission IDs, Sentry, the API's own domain, and a reviewer login, which depends on the OTP decision.

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
