# Plan — Homeowner / Client invite UI (pilot turnkey gap)

**Date:** 2026-06-11
**Branch:** off `main` (pilot dry-run worktree)
**Why:** Path (a) of the pilot dry-run requires the owner to invite the **Client
(homeowner)** through the UI during first-run. Empirically (clean `constructo_e2e`
DB, full loop driven via API), every other leg works UI-only — but there is **no UI
anywhere (web or contractor-mobile) that calls `POST /api/v1/homeowner/members`**, the
only endpoint that mints a homeowner member + join code. The endpoint has **zero
callers**. So today a homeowner can only be onboarded via SQL/importer seed — which
fails the success criterion "the loop runs UI-only, no SQL."

## Empirical findings (clean DB, API drive)
- Owner first-run (login → rename company → create site → invite contractor team): ✅
- Contractor invite→accept→landing (architect→spec_desk, supervisor→capture,
  accountant→reconcile): ✅
- Architect `/spec-desk` after importer: ✅ 6 rooms, 20 lines, honest ₹0 (unpriced).
- Homeowner `/finishes` (proper member→join path): ✅ 6 rooms, **no cost leak**.
- Homeowner via the contractor `/invites` flow: accepts + lands `home` but `/finishes`
  → **403 no_membership** (no `HomeownerMember` row). ⇒ naïvely adding `homeowner` to
  the web invite role list would be WRONG.
- Mobile join screen (`app/(auth)/join.tsx`) already redeems the join code + deep link
  + OTP and routes to the homeowner welcome. ⇒ the homeowner side needs **no work**.

**Conclusion:** the only gap is an **owner-side web UI to generate the client join code.**

## Design
Keep it inside the existing `InviteTeam` component (rendered by BOTH owner first-run
Team step AND Settings → Team), so "invite anyone" lives in one place.

- Do **not** add `homeowner` to the web `Role` union (contractor-only by design; would
  cascade through every `Record<Role>` map). Instead add a `'client'` pseudo-option to
  the role `<select>`; component state becomes `Role | 'client'`.
- The homeowner member is **site-scoped**. `InviteTeam` lazily `api.listSites()` when the
  user first selects **Client** (lazy → existing contractor tests need no new mock). If
  one site, auto-select it; if several, show a property `<select>`.
- On submit with role `client` → `authApi.inviteClient({siteId, phone, name})` →
  `POST /api/v1/homeowner/members` `{site_id, sub_role:"primary_owner", phone,
  display_name}`. Render a **client-specific "created" panel**: the **join code**
  prominent, copy-code button, a WhatsApp share with a download+code message, and the
  `constructo://join?code=…` deep link. (Contractor path/panel unchanged.)

## Changes
**Backend (TDD):**
- `app/homeowner/schemas.py` `MemberCreateIn`: add `display_name: str | None = None`.
- `app/homeowner/router.py` `create_member`: pass `display_name=body.display_name`.
- Test: `POST /homeowner/members` with `display_name` persists + surfaces in `MemberOut`.

**Web:**
- `src/api/auth.ts`: `HomeownerMemberOut` type + `inviteClient(...)`.
- `src/pages/auth/InviteTeam.tsx`: client option, lazy site load, site select, branched
  submit, client created-panel.
- `src/i18n/en.ts` + `hi.ts`: `invite.role.client`, `invite.client.*` keys.
- `src/pages/auth/InviteTeam.test.tsx`: a `client` branch test (mock `/sites` + members).

## Verify
- Backend: `ruff check` + `pytest` (homeowner members test).
- Web: `npm run build` (tsc -b) + `npm run test` (vitest) + bundle budget.
- Live: in the e2e preview, owner picks Client → join code renders; redeem via API →
  `/finishes` 200. Screenshot for the click-through.

## Rough edges (deliberately out of scope)
- Pending-invite list stays contractor-only (client members not listed there yet).
- Homeowner redeem is mobile-only (Expo) — proven via API, screenshot deferred.
