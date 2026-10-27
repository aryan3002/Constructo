# Handoff: Neev launch fixes, from Batch D onward

Written 2026-10-27 for a fresh chat that picks up the pre-launch fix work, and
updated the same day as Batches D to G were verified. All seven batches are
done; "What's left before submission" below lists the rest.
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
| F | Account deletion for all roles (S6 client) and store config | Done, verified (details below). Privacy and terms URLs still to come from the founder |
| G | Web console trust bugs | Done, verified (details below) |

Outside the batches: the real SMS/WhatsApp OTP provider, the launch roles and
the rest of "What's left before submission" below.

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
- The web Approvals page hides "Approve selected" from PMs even for non-money items. (Fixed in G.)

### Batch F: what changed (needed for G)

Run in session `session_01UneWbkF5W5niZs1evb1GMz` (14 commits, `f9fe690`..`9dc7de7`), plus 1 fix from verification (`54df86b`: deletion also scrubs the `raw_messages.text` column).

- **Account section (S6).** One shared Account section in all seven roles: language (saved to the server and re-applied after sign-in), privacy policy, terms, delete account, sign out.
- **Public deletion page.** `/delete-account` on the web console (public): phone and OTP, then step-up, then `DELETE /api/v1/users/me`. It's also linked from the web account menu.
- **Scrub (S6).** Deletion replaces the person's full name and phone with "Deleted user" in their raw messages (`text` and `raw` JSON) and in events extracted from them (`app/auth/scrub.py`).
- **AI consent (S7).** `users.ai_consent_at` (migration `e8f9a0b1c2d3`) and `POST /api/v1/users/me/ai-consent`. A full-screen gate in the app (`src/consent/`) and the web console. Declining blocks use and offers sign-out or deletion.
- **Links (S7).** Privacy and terms come from `EXPO_PUBLIC_PRIVACY_URL`/`EXPO_PUBLIC_TERMS_URL` (mobile) and `VITE_PRIVACY_URL`/`VITE_TERMS_URL` (web). **Not set yet: the founder must send them.** Until then every preview and production app build stops on a "This build of Neev isn't set up" screen, which also catches a missing `EXPO_PUBLIC_API_BASE`.
- **Android (S8).** Seven media and storage permissions are in `blockedPermissions`, and `isAccessMediaLocationEnabled` is false.
  - The Android photo pickers use the system picker without asking for permission.
  - Save photo is write-only on Android 13+. On Android 12 and below it uses the share sheet; keeping `WRITE_EXTERNAL_STORAGE` for old versions is a one-line change if wanted.
- **Invites.** An invited number signs in directly: `auth.login` uses the newest pending invite for that phone. `POST /invites/{token}/accept` refuses another number with 403 `invite_wrong_phone`. The web join no longer sends `signup: true`.
- **Release settings.** `autoIncrement` on production profiles. `supportsTablet: false`. `EXPO_PUBLIC_WEB_BASE=https://constructo-topaz.vercel.app`. A white Neev-mark notification icon (`assets/notification-icon.png`). No "coming soon" text except the procurement landing (`(contractor)/index.tsx`), which waits on the launch-roles decision; a test guards this.
- **Verified:**
  - Test totals: backend 1808 passed plus the known Pinterest failure (the deletion tests re-run green after the scrub fix); mobile 87 suites / 660 tests; web 140 files / 900 tests. Ruff, typecheck, web lint and build are clean. Migration up/down/up is clean.
  - On screen and via the API:
    - The invite sign-in, with the company count unchanged, and the wrong-phone refusal.
    - The consent gate: decline, then agree, then the screen doesn't come back.
    - The Account section in four roles, with the privacy link opening the configured URL.
    - The web deletion page end to end, with the scrub checked in the database.
    - The release build's blocking screen.
    - The resolved Android permissions.

### Follow-ups found while verifying F (not yet assigned)

- Queued chat messages or captures made before this update can send on launch before an existing user has consented. This is an edge case for users upgrading.
- The notification settings hide the WhatsApp and email delivery options until they actually send.
- Publish OTA updates with a cleared bundler cache (`eas update --clear-cache`). An export reused a stale `EXPO_PUBLIC_API_BASE` without it.

### Batch G: what changed

Run in session `session_01UneWbjZBefrERK6ftoinMs` (11 commits, `1236509`..`55846a9`), plus 3 fixes from verification:
- `2ab2dd2`: the join page survives an invite role it doesn't describe (it crashed, and `npm test` exited 1 with every test passing).
- `9159c8e`: avatar initials skip words like "(Owner)" ("R(" became "RG").
- `1c26709`: the Home header counts exactly what "Needs you" lists. It said "8 need you" above "1 open" because the server count includes homeowner questions.

What changed:
- **Home chips.**
  - Approve resolves the decision it's shown on; on a site risk it records an approval that's already resolved.
  - Hold (new owner-only `POST /approvals/{id}/hold`) turns an internal money decision into `hold_payment` and keeps it pending ("On hold").
  - Assign needs a person (422 `assignee_required`).
  - On the dashboard endpoints, Approve and Hold are owner-only (403 `owner_only`).
  - A risk whose evidence a decision already cites drops out of the home payload (`dashboard/aggregate.py`).
  - Money chips confirm, then wait 5 s with Undo (`features/owner/pendingDecisions.ts`).
- **Decision log.** Labels come from kind and state: Pending, Escalated, Seen, Approved or Resolved, Rejected, "On hold" and "Assigned to <name>".
- **Sign-out and expired sessions.**
  - Sign-out sends any money action still in its undo window, then revokes the token. It also clears the query cache and the web capture queue.
  - A 401 on a request that carried a token goes to `/login?next=…`, which says "Your session ended, please sign in again."
- **No mocks.** Mock events appear only with `VITE_USE_MOCKS=true`. Otherwise the timeline shows its error.
- **Homeowner questions.** `DecisionOut.audience` is returned. A homeowner question has no buttons and no select box. It reads "Waiting for the homeowner for <time>" on web `/approvals` and on the app's owner Brief and Approvals cards, and Home's "Needs you" never lists it.
- **PMs.**
  - A PM's landing key is `today` (`/pm`). The app doesn't read landing keys.
  - PMs get "Approve selected". The server skips money items and the result counts the skipped ones.
  - `/reconcile` keeps the visitor's own nav.
- **Frame.**
  - Approvals, Payments, Permits, Search, Settings, Site Health and Invite now sit in the app frame.
  - At phone width, a role with more than five tabs gets four plus "More".
  - The admin console fits a phone.
- **Colours.** The Tailwind config wraps variable colours, so opacity variants like `bg-ok/10` are generated, and status pills are filled. Status text uses tones that reach 4.5:1 contrast. Tests build the CSS and check the colour pairs.
- **Leftovers.**
  - The local-only notification toggles are gone from Settings.
  - Intake shows only when Labs answers.
  - `/dpr` is linked from the PM nav, and `/components` is dev-only.
  - The admin console reads "Company settings" and shows no raw company ID.
  - Counts read "1 item" and quantities "24 pcs".
  - The avatar shows the person's real initials.
  - Public pages make no `/auth/me` calls, and there's a skip-to-content link.

**Verified:**
- Test totals: backend 1821 passed plus the known Pinterest failure; mobile 87 suites / 662 tests; web 151 files / 990 tests, with `npm test` exiting 0.
- Ruff, typecheck, web lint and build are clean. There's no migration in this batch; one head, current.
- On screen and via the API:
  - Home Hold: confirm, then "On hold … · Undo". After a reload it isn't asked again, the log reads "On hold", and the database has one `hold_payment` decision, still pending.
  - The PM lands on `/pm` and bulk-approves a non-money decision. The homeowner question has no checkbox and reads "Waiting for the homeowner" on the web and in the app.
  - The seven pages are in the frame with no sideways scroll at 390 and 1280 px.
  - A bad token goes to sign-in with the session-ended message.
  - The phone bar shows Latest, Projects, Chat, Approvals and More. Settings has no "coming soon", and `/components` isn't served.
  - The Home header and "Needs you" agree, for all sites and for one site. The avatar reads "RG".

### Follow-ups found while verifying G (not yet assigned)

- The web Reports page still has a "Coming soon" payroll row (`reports.payroll_soon`).
- "Show proof" (`ui/EvidenceCard.tsx`) and the PM Today page are English-only.
- The Home header's "updates today" counts every site even when one is selected; its "need you" part follows the selection.
- Home shows the server's risk text as is: "1 event(s) need clarification or are low-confidence".

## What's left before submission

**Decisions and accounts only the founder can supply**
1. **OTP channel (S2, stop-ship).** Choose SMS, which needs TRAI DLT registration (entity, sender ID, template), or WhatsApp authentication messages. Then wire it up, with one review number on a fixed code that reaches only a demo company. Until then, production can only take the dev code behind a phone allowlist (`app/auth/otp.py`) or refuse sign-in.
2. **Privacy policy and terms URLs.** Every preview and production build stops on "This build of Neev isn't set up" until they're set. The policy should name the AI providers.
3. **Launch roles.** Ship PM, mukadam and procurement, or hide them? The procurement landing still says "coming soon" until this is decided.
4. **Contractor design direction (D1).** Calm Cockpit for every role (the review's recommendation) or Neev. This is needed before the design phase.
5. **Store accounts.**
   - The App Store Connect app ID and the Play service account (`submit.production` in `eas.json` is empty).
   - A personal Play developer account needs a 14-day closed test with 12+ testers; an organisation account doesn't.
6. **Sentry** for crash reporting, before the closed test.
7. **The API on your own domain** instead of the raw `azurecontainerapps.io` host, before binaries ship.
8. **Save photo on Android 12 and below.** Keep the share sheet, or keep `WRITE_EXTERNAL_STORAGE` for old versions (one line).

**Store paperwork**
- Apple App Privacy answers and the Play Data safety form. Play's form asks for a web link for account deletion: use `/delete-account` on the web console.
- The reviewer demo login and Play's app-access instructions, which need the review number from item 1.

**Work not yet done**
- Chat safety (Apple 1.2, a warning in the review): report a message, block a user, and a published contact.
- Play AI content (a warning in the review): let people report an AI answer (Ask, drafts).
- The design phase, D1 to D7 (the review's Phase 2, about 2–3 weeks).
- The review's Phase 3: preview builds to closed-track testers and TestFlight with Sentry watching, Maestro flows per role, then submit.
- The follow-ups listed under each batch above.

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
