# Spec — Neev owner mobile redesign

**Date:** 2026-06-12
**Surface:** Contractor mobile app (Expo), **owner** persona first.
**Design authority:** the **Neev Design System** (founder's Fable artifact) + the
`constructo-contractor-design` skill. Single source of truth. The word is **Neev**
everywhere; the internal theme key `blueprint` is renamed to `neev` as part of this work.

## Why
The shipped owner app is **functionally solid but reads cheap and under-serves the
owner**. Concretely, from a grounded audit (code + vault):
- The bottom tab bar renders **Unicode text glyphs** (`◆ ✉ ▦ ✓ ☰`) as icons
  (`app/(contractor)/owner/_layout.tsx`) — no real icon set is wired anywhere. This is
  the single biggest "cheap" tell.
- The **More** tab only exposes Search + Foresight, then defers Team / Reconcile /
  Payments / Permits / Exports to web — but the design (`07-Design/roles/Owner.md`,
  `09-Contractor-AI-Native/04`) puts **Team, Permits, Settings** on *mobile* at H4+.
- Empty/bare feeling: thin empty states, missing Brief richness (header site-switcher),
  and the profile card leaks a raw company **UUID**.

The screens underneath (Brief, Chat, Sites, Approvals, Search, Foresight, Dispute-pack)
are **fully wired and working** — so this is a **polish + surface-more** effort, not a
rebuild.

## Decisions (locked with founder)
- Scope: **full owner build-out, minus the Payments ledger** (deferred).
- Philosophy: **heavy desk work stays on web** (month-end reconcile + export *building*).
  Mobile gets triage/tracking/entry-points + the new Team & Permits screens.
- Status is shown via the Neev **folded-corner `StatusFlag`** + a `StatusPill` that always
  carries **icon + shape + label** — never a colored side rail, never colour alone.
- Build is **subagent-driven**: Opus orchestrates + reviews; **Sonnet implementer
  subagents write each slice TDD**; one small PR per slice; mobile typecheck + jest green;
  CI watched; merged. Slice order A→B→C→D→E (A first — everything sits on it).

## Design tokens (Neev — authoritative)
- Marigold (single warm accent, used sparingly): 700 `#9A6206` · 600 `#D6850C` ·
  **500 `#F0A21F`** · 200 `#FBE8C4` · 100 `#FCF3DF`.
- Neutrals (warm, never grey-blue): ink-900 `#1B1916` · ink-700 `#3D3933` ·
  steel-600 `#5C564D` · cement-400 `#A39B8E` · cement-200 `#DED7C9` · paper-100 `#EFEADF`
  · surface `#FFFDF8`.
- Status families (icon + shape + label): On track (green `#2F7D52`, ▲) · Needs you
  (marigold/amber `#C77A12`, ●) · Behind (red `#B23A2E`, ▲) · Recorded (blue `#3A6491`, ■).
- Type: **Display** Bricolage Grotesque · **Body/UI** Mukta (Devanagari+Latin) ·
  **Numerals/money** Spline Sans Mono. (All already self-hosted, offline-first.)
- Elevation: paper-on-paper, hairline cement border does the work; ladder 1 flush row /
  2 card / 3 sticky / 4 popover / 5 sheet. Radii: sturdy, not toy.

## Slices

### A — Design-language foundation (gates everything; carries to all roles)
- **Rename** internal theme key `blueprint` → `neev` across `src/theme/*` (`tokens.ts`
  `BLUEPRINT_COLORS`→`NEEV_COLORS`, `FACES`/`fonts.ts` keys, `ThemeProvider` `initial=`,
  any `theme.name === 'blueprint'` checks). Cosmetic, no visual change; full-tree typecheck.
- **Real icon set** for the tab bar + rows: introduce one icon primitive (e.g.
  `@expo/vector-icons` — bundled with Expo — or the Neev skill's bundled icon set; pick at
  build time and standardize). Replace the `icon(glyph)` helper in **every** contractor
  role `_layout.tsx` (owner + others) with named icons. Refine the bar: active marigold,
  inactive steel-600, label Mukta-SemiBold, 64px + safe-area.
- **UI-kit polish** to the Neev spec: confirm/standardize `StatusPill` (icon+shape+label),
  `StatusFlag` (folded corner), `MoneyCell` (Spline Mono), `EmptyState` (premium, not
  bare), `Card` elevation, `SettingsRow`/`SettingsGroup`, type scale.

### B — Brief enrichment (`owner/brief.tsx`)
- Header **Site Switcher** (`All sites (N) ▾` / per-site) that scopes the surface; bell;
  avatar. (Today's header is thinner.)
- Keep the wired risk cards + inline Approve/Hold/Assign, re-skinned to the approved
  `NeedsYouCard` (folded corner flag, status pill, evidence chips, `MoneyCell` variance,
  one primary action + Assign).
- Pulse grid 2×2 (Cash/Labour/Material/Progress) polish; Sites roll-up strip; calm line;
  premium empty state (replaces the bare "Connect a group").

### C — Account / Workspace hub (rebuild `owner/more.tsx`)
- Profile card with **real** name · role · company name (fixes the raw-UUID leak) + phone.
- Grouped `SettingsGroup` rows:
  - **Workspace:** Team & roles (→ slice D), Spec desk (web deep-link), Search, Foresight.
  - **Site:** Permits (→ slice E).
  - **Money · stays on web:** Reconcile, Tally export — `ti-external-link` web deep-links.
  - **Settings:** Language (en/hi, `PATCH /users/me`), Appearance (theme/sunlight, local),
    Notifications (push prefs).
  - Sign out.

### D — Team & roles screen (NEW, wired)
- List members: `GET /api/v1/users` → rows (avatar, name, role pill, active/invited).
- Invite: reuse the invite flow — `POST /api/v1/invites` (contractor roles) **and** the
  Client/homeowner path `POST /api/v1/homeowner/members` (the option just shipped on web),
  surfacing the join link / join code.
- Manage: change role / deactivate via `PATCH /api/v1/users/{id}` with **OTP step-up**
  (`POST /api/v1/auth/step-up/request-otp` + `/verify`) on sensitive changes
  (role→owner/money/admin, deactivation), per the authority model.

### E — Permits screen (NEW, wired)
- List + checklist: `GET /api/v1/permits`, `GET /api/v1/permits/checklist` → status
  (ok / expiring / overdue) via `StatusPill`.
- Add / edit / status: `POST` / `PATCH /api/v1/permits/{id}`.

## Out of scope (this pass)
- Payments ledger screen (deferred — founder pushing payments out).
- Heavy reconciliation + export *building* (stay on web; mobile shows entry-points only).
- Other roles' bespoke capability screens (they inherit slice A's nav/token fixes for free;
  role-specific work is a later pass).

## Testing & acceptance
- Per slice, **TDD**: jest component/logic tests + mobile `tsc` typecheck green; reuse the
  app's existing test patterns (jest + React Native Testing Library).
- A is acceptance-gated on: no glyph icons remain in any contractor `_layout`; full
  typecheck green after the `neev` rename.
- D/E gated on: real API wiring proven against the running backend (list/create/patch),
  OTP step-up enforced on sensitive Team changes.
- Visual: each slice matches the approved Neev mockups (no colored side rails; folded-corner
  flags; real icons; Mukta/Bricolage/Spline-Mono type; warm paper + single marigold).
- One PR per slice, CI green, merged, branch deleted.

## Open follow-ups (not blocking)
- Apply the same nav/token polish pass to the other contractor role tab bars (supervisor /
  pm / accountant / mukadam) — mechanical once A lands.
