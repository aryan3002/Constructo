# Web Work — Session Handoff (2026-06-22)

Read this + the auto-memory `web-state-of-ground` (it's the "read first for web work" anchor and is current). This doc is the fast path to continue.

## TL;DR — where we are
Two big pieces of web work are **done and on PRs**, both stacked (not yet merged to main):
1. **Neev re-skin** (the contractor web app re-skinned to the warm "Calm Cockpit / Neev" look from the `~/Downloads/Neev Desktop` prototype) — Phases 1–5 done.
2. **Web chat — Phase A** (the mobile in-app chat brought to web, Neev-styled) — done.

**Pilot runway:** ~5 days, still building. The one true gate before a *live* pilot is **auth** (the OTP `000000` dev no-op) — but it's **deferrable** (backend-only, independent of all frontend work). Keep building the frontend; slot auth in near the end. See "Auth / dev-no-op" below.

## Branches & PRs
| Branch | PR | State |
|---|---|---|
| `feat/web-neev-owner` | **#204** (→ main) | Neev re-skin, Phases 1–5. Owner + supervisor + architect on Neev (flag `VITE_NEEV_OWNER`, OFF by default). |
| `feat/web-chat` | **#205** (→ `feat/web-neev-owner`) | Web chat Phase A. Stacked on the re-skin; retarget #205 to main once #204 merges. Web-only, zero backend changes, 578 tests green. |
| `chore/backend-security-hardening` | none (LOCAL only) | ⚠️ Rescued backend security WIP (SSRF `url_guard.py`, bot service-key, payments/profiler tenant-scoping + tests) that got swept into the chat branch by a `git add -A`. Off `main`. User to review/PR separately. NOT pushed. |

## What's done
- **Re-skin (PR #204):** `neev`/`neev-dark` token blocks in `src/ui/theme.css`; Eczar serif + IBM Plex Mono; `skinForRole` (owner/supervisor/architect→neev) + `useSkin()` + `OwnerSkinSync` gating; `NeevSidebar`+`NeevTopBar` Command Center chrome; editorial Brief hero; WCAG-AA contrast locked (`neevContrast.test.ts`). Desk tools re-skinned "for free" by the token cascade.
- **Chat (PR #205):** mirrors the mobile chat kit. `src/api/chat.ts` + `src/features/chat/` (`socket.ts` WebSocket singleton, `useChatThread.ts`, `ticks.ts`, `threadMerge.ts`, ConversationRow/ChatInbox, MessageBubble, CaptureCard, NivaanProposalCard, SystemNotice, ChatComposer, ChatThread, ChatPage). `/chat` lazy route + Chat tab in `ROLE_TABS` (owner/supervisor/architect). WebSocket real-time + cursor-derived ticks + optimistic send.

## What's NEXT (the open decision)
Pick one (the user was deciding between these):
1. **Chat Phase B** — composer power-tools: slash commands, smart-suggest chip, voice recording (MediaRecorder→upload). (Phase C = groups create/manage UI; Phase D = supervisor command tools: brief pin/radar/recap/disputes/action-items.) Each gets its own spec→plan→build.
2. **Auth / Phase 0** — the ship-gate, but **deferrable** (see the dedicated section below). When ready: read-only assessment → prioritized P0/P1/P2 remediation plan + 2–3 user decisions (SMS provider; cookie vs localStorage; CORS strictness). Backend work.
3. **Pause** — review PRs #204/#205 + the rescued backend branch.

## Auth / dev-no-op — the one real ship-gate (DEFERRABLE)
**What it is:** login asks for an OTP, but the backend wires **no SMS provider** — `request-otp` is a no-op and any phone + the hardcoded **`000000`** logs in (the web even pre-fills/shows it, `Login.tsx`). So today there's no real auth gate: anyone who reaches the app + types `000000` is "logged in." Fine for building/demoing; not a real lock.

**Deferrable? Yes.** It's backend-only and independent of all frontend work. With ~5 days runway, do it as a focused **~1–2 day pass near the end:**
- wire an SMS/OTP provider (India → **MSG91**); remove the `000000` bypass + the on-screen hint (`Login.tsx`);
- **verify backend RBAC enforcement** — the web caps are UI-only; confirm every endpoint enforces role + company/site scope server-side (the one thing worth a quick check even before launch);
- CORS tighten for the prod origin; per-env `VITE_API_BASE`; JWT (cookie vs localStorage).
- A `feat/phase0-otp-lockdown` branch exists — confirm what it actually locks (backend vs web).

**Risk depends on the pilot's reach:**
- **Closed** (private/unadvertised URL, only people you hand it to — e.g. the family firm + known contractors): low risk for the window — defer freely, just don't post the URL publicly.
- **Public** (anyone could find the URL + log in as any owner): real exposure even for a few days.

**Don't forget — data hygiene (lands with auth, before public):** prod Neon/R2 already holds **real Tripathi-family WhatsApp data**; before going public, `--purge` the test/seed data **and rotate the Neon password that was pasted into chat** (see `whatsapp-real-data-import` memory). For a closed pilot among people who already own that data, non-issue.

## Key recipes & gotchas
- **See the Neev UI / chat live:** create gitignored `constructo/web/.env.local` with `VITE_USE_MOCKS=true` + `VITE_NEEV_OWNER=true`; start the web dev server; open `http://localhost:5173`; log in mock owner **`+919800000001`** / OTP **`000000`**; resize ≥768px (md breakpoint). Delete `.env.local` after. (Chat inbox needs a real backend to populate — `chatApi` has NO mocks path; rendering is unit-proven.)
- **Flaky tests:** `src/pages/reconcile/ReconcileDetail.test.tsx` (3 tests) are PRE-EXISTING flaky under machine load (fetch-mock timing + 5s waitFor) — proven failing at base. Use `npx vitest run --retry=2`; they're not regressions.
- **`git add -A` in subagent commits sweeps uncommitted WIP** — scope `git add <paths>` and run a final `git diff main..<branch> -- constructo/backend` check (this is how the backend WIP got swept in).
- **Theming:** semantic tokens in `src/ui/theme.css`; `[data-theme='neev']`/`['neev-dark']` redefine ROLE tokens → bound components re-skin automatically. Tailwind `fontFamily` is `var(--font-*)`. Pills = `rounded-full` (not `rounded-pill`). All new UI must use semantic tokens (no hardcoded hex) so neev-dark works.
- **Verify before claiming:** `npx tsc -b --noEmit && npx vitest run --retry=2 && npm run build && npm run budget` from `constructo/web`.

## Where things live
- Specs: `docs/superpowers/specs/2026-06-20-neev-web-owner-reskin-design.md`, `docs/superpowers/specs/2026-06-22-web-chat-phase-a-design.md`
- Plans: `docs/superpowers/plans/2026-06-20-neev-web-owner-reskin-foundation.md` (+ phase-2-shell), `docs/superpowers/plans/2026-06-22-web-chat-phase-a.md`
- Assessment: `docs/WEB-STATE-OF-THE-GROUND-2026-06-20.md`
- SDD ledger (task-by-task, with all Minor findings for triage): `.superpowers/sdd/progress.md`
- Backend chat contract reference (for Phases B-D): mobile `constructo/mobile/src/chat/*` + backend `constructo/backend/app/chat/*`

## To start the new session
Open with something like:
> "Continue the web work. Read `docs/HANDOFF-WEB-2026-06-22.md` and the `web-state-of-ground` memory. We finished the Neev re-skin (PR #204) and web chat Phase A (PR #205). I want to [start chat Phase B | scope the auth/Phase-0 work | …]."
