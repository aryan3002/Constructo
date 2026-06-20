# Design Spec — Neev (Calm Cockpit) Owner-First Web Re-Skin

**Date:** 2026-06-20
**Status:** Approved design → ready for implementation plan
**Surface:** `constructo/web` (contractor/owner console)
**Related:** `docs/WEB-STATE-OF-THE-GROUND-2026-06-20.md`, vault `11-Contractor-Web-Experience/`, prototype `~/Downloads/Neev Desktop/`

---

## 1. Goal

Bring the **owner's** web experience onto the **Neev "Calm Cockpit"** design language defined by the `Neev Desktop` prototype — warm sand canvas, sage/terracotta/amber palette, Eczar serif headlines, editorial "3 decisions need your call" voice — **without rebuilding the already-wired screens or breaking the 406-test Blueprint app.**

The web app is functionally built and wired to the real backend; it simply wears the old "Blueprint" skin. This is a **re-skin in place**, not a rebuild.

## 2. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Scope** | **Full owner re-skin** — every owner-reachable surface | Owner reaches nearly everything; coherence over a partial slice |
| **Modes** | **Light + dark** (`neev` + `neev-dark`) | Owners keep a glare-free mode; prototype gives light only, so dark is designed fresh (warm-toned) |
| **Approach** | **Approach 1 — role-driven parallel theme + in-place re-skin** | Reversible (flag), doesn't disturb other roles or tests, follows the existing `daylight` token precedent, extends to other roles later by flipping their theme |
| **Theme selection** | `data-theme="neev"/"neev-dark"` set when session role = `owner` AND `VITE_NEEV_OWNER` flag on | Faithful to "owner-first"; instant rollback; side-by-side demo |
| **Scope switcher** | Restyle the existing SiteSwitcher to the prototype's "Viewing · All sites ▾" | It's a restyle, not new behaviour; "viewing as another person" is out of scope |

## 3. Architecture (how the re-skin attaches to the existing system)

The web app already uses a **three-tier token model** (`src/ui/theme.css`): primitive values → semantic **role tokens** (`--surface`, `--brand`, `--text-primary`, …) → components/Tailwind. Mode lives on `<html data-theme>`, set by `src/ui/ThemeModeProvider.tsx` (and mirrored pre-paint by the no-FOUC script in `index.html`). There is an existing precedent — `[data-theme='daylight']` — that redefines the role tokens to a warmer homeowner palette. **We add `neev` / `neev-dark` the same way.**

Because every component binds to role tokens (and the legacy `--c-*` aliases follow), redefining the role tokens **re-skins all bound components automatically** — the color/radii/shadow layer needs **zero per-component edits**. The real work is (a) the serif type spine and (b) the shell + editorial card composition.

### 3.1 Token layer — `src/ui/theme.css`

Add two blocks mirroring the `daylight` pattern. Concrete light values (ported from the prototype `desktop/styles.css`):

```
[data-theme='neev'] {                       /* LIGHT — Calm Cockpit */
  --surface:           #FCFAF3;   /* sand-50  — app canvas */
  --surface-card:      #FFFFFF;   /* white cards on sand canvas (crisp elevation) */
  --surface-elevated:  #FFFFFF;
  --surface-overlay:   #FFFFFF;
  --surface-sunken:    #F3EFE6;   /* sand-200 — wells, grid header */
  --surface-hover:     #E9E3D5;   /* sand-300 */
  --surface-selected:  #E5EDE3;   /* green-tint */

  --text-primary:      #2A2519;   /* warm ink */
  --text-secondary:    #6A6047;   /* ink-600 (5.4:1) */
  --text-muted:        #9A9176;   /* ink-400 */
  --text-on-brand:     #FFFFFF;   /* on sage */

  --border:            rgba(42,37,25,.14);   /* hairline-strong */
  --border-strong:     rgba(42,37,25,.22);
  --divider:           rgba(42,37,25,.09);   /* hairline */

  --brand:             #3E7D58;   /* sage-600 — the one primary action */
  --brand-hover:       #4E8A68;
  --brand-pressed:     #2C6243;
  --brand-subtle:      #E5EDE3;   /* green-tint surface */
  --brand-text:        #2C6243;   /* sage-as-text on sand */
  --ring:              #2C6243;   /* AA focus ring on sand */

  --celebrate:         #BE6A41;   /* NEW token — terracotta clay (milestones/eyebrows) */
  --celebrate-subtle:  #F6E7DB;

  --warn-solid: #B98318; --warn-bg: #FAF1D9; --warn-fg: #946410;  /* amber = "needs you" */
  --risk-solid: #BC4836; --risk-bg: #F6E2DC; --risk-fg: #99372A;  /* red = delay ONLY */
  --ok-solid:   #3E7D58; --ok-bg:   #E5EDE3; --ok-fg:   #2C6243;  /* sage = on-track */
  --info-solid: #3F6E96; --info-bg: #E2E8EE; --info-fg: #3F6E96;

  --radius-card: 22px; --radius-sheet: 28px; --radius-control: 14px;  /* pebbles */
  --shadow-card: 0 1px 2px rgba(42,37,25,.04), 0 8px 20px -12px rgba(42,37,25,.18);
  --shadow-pop:  0 4px 10px rgba(42,37,25,.06), 0 18px 40px -16px rgba(42,37,25,.26);

  --font-display: 'Eczar', Georgia, serif;
  --font-mono:    'IBM Plex Mono', ui-monospace, monospace;
}
```

`[data-theme='neev-dark']` — **designed fresh, warm-toned** (NOT the cold Blueprint dark). Target values to validate for AA during build:

```
[data-theme='neev-dark'] {
  --surface:           #1C1A14;   /* warm near-black */
  --surface-card:      #26231B;
  --surface-elevated:  #2E2A20;
  --surface-overlay:   #2E2A20;
  --surface-sunken:    #161410;
  --surface-hover:     #322E23;
  --surface-selected:  rgba(78,138,104,.22);

  --text-primary:      #F2ECDD;   /* warm sand text (no halation) */
  --text-secondary:    #C4BBA3;
  --text-muted:        #9A9176;

  --border:            rgba(242,236,221,.12);
  --border-strong:     rgba(242,236,221,.20);
  --divider:           rgba(242,236,221,.08);

  --brand:             #6BA585;   /* sage lifts in dark */
  --brand-hover:       #7DB596;
  --brand-pressed:     #4E8A68;
  --brand-subtle:      rgba(78,138,104,.20);
  --brand-text:        #8FC0A4;
  --ring:              #8FC0A4;

  --celebrate:         #D98A5C; --celebrate-subtle: rgba(190,106,65,.20);
  --warn-solid: #DFAE4E; --warn-bg: #2A2008; --warn-fg: #DFAE4E;
  --risk-solid: #E07A66; --risk-bg: #2A1310; --risk-fg: #E07A66;
  --ok-solid:   #6BA585; --ok-bg:   #14271C; --ok-fg:   #8FC0A4;
  --info-solid: #6FA0C8; --info-bg: #0F1E2A; --info-fg: #6FA0C8;

  /* Repeat the same pebble radii (sibling [data-theme] blocks do NOT inherit
     from the neev block). Dark elevation = hairline luminance-lift + soft shadow. */
  --radius-card: 22px; --radius-sheet: 28px; --radius-control: 14px;
  --font-display: 'Eczar', Georgia, serif;
  --font-mono:    'IBM Plex Mono', ui-monospace, monospace;
}
```

> All contrast pairs (sage-on-sand, amber-as-text, sand-on-warm-dark) are validated to **WCAG AA** during build; the values above are the design target, adjusted if a pair misses.

### 3.2 Type spine — serif headlines

- Add `@fontsource/eczar` + `@fontsource/ibm-plex-mono`; import their weights in `src/ui/fonts.css` (offline, matches the existing @fontsource approach — no Google CDN).
- The neev blocks override `--font-display` (Eczar) and `--font-mono` (IBM Plex Mono); body stays Hind.
- **Mechanism:** `tailwind.config.js` currently maps `fontFamily.display` to the *literal* `['Anek Latin', …]`, so overriding `--font-display` alone does nothing. Repoint `fontFamily` to the CSS vars (`display → ['var(--font-display)']`, etc.). This keeps Blueprint identical (`:root` already sets the vars to Anek/Hind/Spline) and lets the neev block swap in Eczar. `Typography.tsx` needs **no change** — it uses the `font-display` utility, which now resolves to the var.

### 3.3 Theme selection — `src/ui/ThemeModeProvider.tsx`

- Extend the resolver: the active mode (`light`/`dark`/`system`) maps to `neev`/`neev-dark` **iff** the session role is `owner` and `VITE_NEEV_OWNER` is enabled; otherwise it resolves to `light`/`dark` as today.
- Role isn't known pre-paint (auth resolves after mount), so the no-FOUC script in `index.html` handles light/dark; `ThemeModeProvider` **upgrades** to neev once the role is known. To avoid a Blueprint→neev flash for owners, persist a resolved hint in `localStorage` (e.g. `cstk.neev = "1"` after first owner login) and teach the no-FOUC script to pre-apply `neev`/`neev-dark` when that hint is present.
- The existing light↔dark toggle (Settings) continues to work — for owners it toggles neev↔neev-dark.

## 4. Surface treatment — two tiers

Every owner-reachable surface is themed (tokens + type apply everywhere automatically). They split by **how much composition work** they need:

### Tier A — Editorial decision surfaces (rebuild card composition to match the prototype)
| Surface | Files (current) | Editorial treatment |
|---|---|---|
| Owner Home / **Brief** | `src/pages/owner/OwnerHome.tsx`, `src/features/owner/*` | "3 decisions need your call" serif hero, "Today for owners · {date}" eyebrow, decision cards with proof chips + Review&decide CTA |
| **Approvals** inbox | `src/pages/approvals/Inbox.tsx` | Prototype decision-card layout (title, room, proof count, actions) |
| **Decision Log** | `src/features/owner/DecisionLog*` | Append-only timeline, color-coded actions (approve/hold/assign/ask), actor avatars, proof counts |
| **Decision modal** | (approvals/owner flow) | Approve→release · Hold→reason · Assign→person · Ask→person, each → receipt |
| **Sites** + detail | `src/pages/Sites.tsx`, `SiteDetail.tsx` | Site cards w/ progress + lead; detail = milestones timeline + evidence gallery |
| **Specs** | `src/features/designer/*`, `src/pages/specs/SpecDesk.tsx` | Spec schedule + detail card (room/element/code/approval path/history) |

### Tier B — Warm-but-dense desk tools (tokens + type only; keep functional density)
`Reconcile` (3-way match grid), `Reports`, `Documents`/`Drawings`, `Admin console`, `Payments`/`FinancialTracking`, `DPR`, `Permits`, `Search`, `Groups`, `Notifications`, `Settings`, `More`.
**Principle:** apply palette/type/radii/shadows so they *feel* Neev, but **do not force big rounded cards into data tables** — preserve density, virtualization, and existing test roles/selectors. Most changes here are token-level and should not alter the DOM the tests assert on.

### 4.1 Shell — `AppShell`
Re-skin to the prototype chrome: warm sand sidebar (sage active state, serif/section labels), topbar with the restyled **scope switcher** (SiteSwitcher → "Viewing · All sites ▾"), search, notifications bell, profile. **Restyle the existing react-router nav + RBAC — do not re-route.**

## 5. Non-goals (YAGNI)

- **HARD CONSTRAINT: zero changes under `constructo/backend/`.** This is a presentation-layer re-skin only. No endpoint, schema, migration, or backend behaviour is touched; the web calls the same API contract it does today. Any task that would require a backend change is out of scope and must be flagged, not implemented.
- No changes to other roles' Blueprint skin (they migrate later by flipping their theme).
- No new backend, no new endpoints, no routing changes.
- No "viewing as another person" capability (scope switcher = site filter only).
- No homeowner/mobile changes (this is the contractor web only).
- No functional/behaviour changes to wired flows (optimistic decisions, OTP step-up, offline queue, etc. stay exactly as-is).

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Re-skinning Tier-A cards breaks tests that assert on DOM/roles | Preserve `role`/`aria`/`data-testid`/text the tests use; run `vitest` after each surface |
| Serif/contrast fails AA on sand | AA-validate every pair during build; adjust token values if a pair misses |
| Flash of Blueprint before neev upgrades for owners | `localStorage` hint (`cstk.skin`) read by the no-FOUC script |
| Dense desk tools look "half-skinned" | Accept warm-but-dense as the deliberate design; don't over-rounded tables |
| Scope creep into other roles | `VITE_NEEV_OWNER` + role gate keep blast radius to owner only |

**Known limitations (accepted for the flagged pilot — from the Phase-1 whole-branch review):**
- **Cross-account pre-paint flash.** The `cstk.skin` hint is read pre-paint without knowing *who* will log in. A **non-owner** logging in on a browser where an **owner** previously set `cstk.skin='neev'` gets a one-frame warm (neev) paint, then `OwnerSkinSync` corrects to Blueprint after `/auth/me` resolves. Transient and self-correcting; the final state is always correct.
- **Post-rollback flash.** Because the inline script can't read the build-time flag, after shipping with `VITE_NEEV_OWNER` off (rollback), an owner who previously had neev sees a one-frame neev paint per reload until `OwnerSkinSync` overwrites the hint to `blueprint`. Self-correcting on settle.
- **Phase-2 hardening (deferred):** clear or per-user-namespace `cstk.skin` on logout to close both flash windows cleanly.

## 7. Verification

- Branch `feat/web-neev-owner`.
- **`tsc -b --noEmit` + `vitest run` (406) + `vite build` stay green at every phase.**
- Preview server + screenshot each surface **against the prototype** (`Neev Desktop/neev/screenshots/` + `desktop/*.jsx`) in **both** neev light and neev-dark.
- AA-contrast spot check on sage/amber/terracotta/sand pairs.
- Bundle budget stays under ceiling (adding two fonts — confirm `npm run budget` still passes; subset weights if needed).

## 8. Phased delivery (each phase ships green)

1. **Foundation** — `@fontsource/eczar` + `ibm-plex-mono`; `neev` + `neev-dark` token blocks; `Typography.tsx` → `--font-display`; `ThemeModeProvider` role-driven mapping + `VITE_NEEV_OWNER` flag + no-FOUC hint. *DoD: owner login renders warm sand + serif headlines in both modes; other roles unchanged; tests green.*
2. **Shell** — `AppShell` chrome (sidebar, topbar, scope switcher). *DoD: shell matches prototype in both modes.*
3. **Editorial decision surfaces (Tier A)** — Brief, Approvals, Decision Log, decision modal, Sites, Specs. *DoD: each matches the prototype composition; tests green.*
4. **Warm-but-dense desk tools (Tier B)** — Reconcile, Reports, Documents/Drawings, Admin, Payments, DPR, Permits, Search, Groups, Settings, Notifications, More. *DoD: all themed, density preserved, tests green.*
5. **neev-dark + a11y polish** — validate/adjust dark values, AA pass, reduced-motion, focus rings. *DoD: both modes AA-clean across all owner surfaces.*

## 9. Definition of done

- An owner logs in and the **entire web app** is in Neev Calm Cockpit (light + dark), matching the prototype's look and voice on the decision surfaces and feeling Neev (warm-but-dense) on the desk tools.
- Other roles are visually unchanged.
- `VITE_NEEV_OWNER=0` cleanly reverts owners to Blueprint.
- Typecheck, 406 tests, and build remain green; bundle budget passes.
