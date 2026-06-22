# Neev Owner Re-Skin — Phase 2 (Shell) Plan

**Date:** 2026-06-20 · **Branch:** `feat/web-neev-owner` (stacks on Phase 1) · **Spec:** `docs/superpowers/specs/2026-06-20-neev-web-owner-reskin-design.md`

**Goal:** Give the **owner** (neev skin) the prototype's desktop **Command Center chrome** — a warm sidebar (brand block + nav + profile card) and a topbar (scope button + inline search + bell + avatar) — while every other role and the phone layout keep today's Blueprint shell unchanged.

**Decision:** Full Neev chrome, **skin-gated** (renders only when `skin === 'neev'`, i.e. owner + `VITE_NEEV_OWNER`). Desktop (md+) only; neev phone keeps the existing warm bottom-bar shell.

## Architecture
- **`useSkin()`** — a safe context reader added to `ThemeModeProvider.tsx`: `useContext(ThemeModeContext)?.skin ?? 'blueprint'`. Returns `'blueprint'` with no provider, so the ~70 tests that render `AppShell` bare are unaffected (they get the Blueprint branch).
- **`NeevSidebar`** (new, desktop md+) — brand block ("Neev / Command Center"), the role's `TabDef[]` rendered as `NavLink`s in the prototype's `.nv-navitem` style, and a bottom profile card. Same routes/RBAC as today.
- **`NeevTopBar`** (new, desktop md+) — a "Viewing · {site}" scope button that reuses `SiteSwitcher`'s switch sheet, an inline search that opens ⌘K, the live notifications bell, and the role avatar.
- **`AppShell`** — `const neev = useSkin() === 'neev'`. When `neev`: render `NeevSidebar` (md+) + `NeevTopBar` (md+) and keep the existing bottom-bar nav (<md). When blueprint: the existing shell, **byte-for-byte unchanged**.

## Token map (prototype CSS → our semantic tokens, so it works light+dark)
| Prototype | Token / Tailwind |
|---|---|
| `.nv-side` sand panel | `bg-surface-sunken` + `border-r border-edge` |
| `.nv-navitem` (idle) | `text-text-secondary`, `hover:bg-surface-hover hover:text-text-primary`, `rounded-[13px]` |
| `.nv-navitem.on` | `bg-surface-card text-brand-text border border-edge shadow-card` |
| brand square | `bg-text-primary` + icon in `text-surface-card`; "Neev" in `font-display` |
| `.nv-topbar` | `bg-surface/80 backdrop-blur border-b border-edge sticky` |
| `.nv-search` | `bg-surface-card border border-strong rounded-pill`, focus `ring-brand` |
| `.nv-scopebtn` | `bg-surface-card border border-strong rounded-control hover:bg-surface-hover` |
| profile card | `bg-surface-card border border-edge rounded-control shadow-card` |

## Global Constraints
- ZERO `constructo/backend/` changes.
- Blueprint shell (all non-owner roles) + the phone layout: **unchanged**. Verified by the existing suite staying green with no edits to its assertions.
- Neev chrome uses **semantic tokens only** (no light-only hex) so neev-dark works.
- Preserve every `NavLink` route, the `aria-label="Primary"` nav, and the bell/NotificationsPanel so routing/RBAC/tests hold.
- Keep green: `tsc -b`, `vitest run` (currently 427), `build`, `budget`. `?raw` for any file-content test.

## Tasks
1. **`useSkin()`** safe reader + unit test (no-provider → 'blueprint'; in-provider → skin). [logic, TDD]
2. **`NeevSidebar`** — build to the token map; test asserts brand text, all role nav links present (by route), and the profile card. [chrome, preview-verify]
3. **`NeevTopBar`** — scope button (reuses SiteSwitcher sheet) + search (opens ⌘K) + bell + avatar; test asserts the controls + that switching still calls `onSelect`. [chrome, preview-verify]
4. **`AppShell` wiring** — skin-gate desktop chrome; blueprint + phone untouched; tests: blueprint renders existing shell, neev (via a ThemeModeProvider+owner wrapper) renders NeevSidebar/NeevTopBar. [integration]
5. **Verification** — gate green + preview visual proof of the owner shell in neev light & dark vs the prototype; blueprint shell unchanged. [verify]

## DoD
With `VITE_NEEV_OWNER` on and an owner, the desktop shell matches the prototype Command Center (sidebar + topbar) in light and dark; other roles + phone are unchanged; suite/types/build/budget green; no backend changes.
