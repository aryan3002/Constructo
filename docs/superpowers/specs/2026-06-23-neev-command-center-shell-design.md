# Neev Command Center Shell — Design Spec (Slice 1 of the 02-IA rebuild)

**Date:** 2026-06-23
**Status:** approved-to-build (user: "if yes then start doing this")
**Source of truth:** vault `11-Contractor-Web-Experience/02 - Information Architecture and Navigation.md`
**Skin:** Neev only (light + dark); Blueprint + mobile bottom bar untouched.

## Goal

Replace the flat, re-skinned phone-lane sidebar with a real **desktop Command Center**: a capability-grouped sidebar (PRIMARY ▸ SHARED ▸ ADMIN), a finished top bar (avatar dropdown menu, theme control, collapse-to-rail), and the retirement of "More" on the desktop — its links graduate to the sidebar, its Account/Sign-out graduate to the avatar menu. For **owner, supervisor, architect** only (the roles already on Neev).

## Why (the gap)

The 02-IA's "engine" pieces already exist: the capability model (`src/auth/permissions.ts` — `Capability`, `CAPS`, `roleCan`, `capsFor`), the ⌘K palette, `ThemeModeProvider`, the Neev shell, and every route. What's missing is exactly the visible frame: the sidebar is a **flat `ROLE_TABS` list**, "More" still exists on desktop, the avatar is an inert chip, the theme toggle is reachable only via ⌘K, and there's no collapse-to-rail.

## Scope

### In scope (this slice)
1. A pure, capability-driven **nav model** (`navForRole(role)`) producing three zones.
2. **`NeevSidebar` rebuilt** to render the zones (hairline dividers, ADMIN bottom-pinned) with correct active states, plus **collapse-to-rail** (56px icon mode, tooltips, `⌘\`).
3. **`NeevTopBar` finished**: an **avatar dropdown menu** (identity → Profile & settings → Sign out), a **theme control** (Light · Dark · System), and the **collapse toggle**.
4. A small set of **new SVG icons** so every nav row + the new controls read clearly.
5. **`ui` store**: a persisted `sidebarCollapsed` flag.
6. Tests for all of the above; all existing tests stay green.

### Out of scope (explicit — each is its own later slice)
- Site-scope in the URL (`?site=`) + the out-of-scope guard.
- Breadcrumbs + the master-detail canvas.
- ⌘K **entity** search and the full keyboard map (only `⌘\` is added here).
- SSE bell (the 30s poll stays).
- The nested `/settings/*` admin tree.
- Flipping PM / accountant / procurement onto Neev (company runs 3 roles; if re-added, their sidebars generate themselves from the registry).

## Architecture

### The nav model — `src/ui/navModel.ts` (new, pure)

PRIMARY is the role's cockpit (inherently role-specific — the owner holds *all* caps but must NOT see "Capture", so a pure cap filter over-includes). SHARED/ADMIN are universal surfaces, capability-filtered. This matches the IA §2.3 table exactly.

```ts
import type { ReactNode } from 'react'
import type { Role } from '../api/auth'
import type { TranslationKey } from '../i18n/keys' // existing key type
import type { Capability } from '../auth/permissions'
import { roleCan } from '../auth/permissions'

export interface NavItem {
  to: string
  labelKey: TranslationKey
  /** Per-role label override (e.g. supervisor's Sites → "My Sites"). */
  labelKeyByRole?: Partial<Record<Role, TranslationKey>>
  iconName: NavIconName // resolved to an SVG in the sidebar (keeps the model serialisable + testable)
  /** Cap required to SEE a SHARED/ADMIN item. PRIMARY items are role-curated. */
  cap?: Capability
  /** NavLink `end` (exact-match) — for index-like routes. */
  end?: boolean
}

export type NavZones = { primary: NavItem[]; shared: NavItem[]; admin: NavItem[] }

// PRIMARY: role-curated cockpit + core tools (IA §2.3).
const PRIMARY_BY_ROLE: Partial<Record<Role, NavItem[]>> = {
  owner: [DASHBOARD, APPROVALS, RECONCILE, FINANCE],
  architect: [DESIGNER],
  supervisor: [CAPTURE],
  // pm/accountant/procurement defined for forward-compat but not skinned now.
}

// SHARED + ADMIN: universal registries, cap-filtered per role.
const SHARED: NavItem[] = [SITES, CHAT, DRAWINGS, PERMITS, REPORTS, SEARCH]
const ADMIN: NavItem[] = [TEAM, SETTINGS]

export function navForRole(role: Role): NavZones {
  const gate = (i: NavItem) => !i.cap || roleCan(role, i.cap)
  return {
    primary: PRIMARY_BY_ROLE[role] ?? [],
    shared: SHARED.filter(gate),
    admin: ADMIN.filter(gate),
  }
}
```

**The items (route · cap · icon):**

| Item | route | `end` | cap (gate) | icon |
|---|---|:--:|---|---|
| Dashboard | `/owner` | ✓ | PRIMARY-curated (owner/pm) | grid |
| Approvals | `/approvals` | | PRIMARY-curated | check |
| Reconcile | `/reconcile` | | PRIMARY-curated | scale |
| Finance | `/payments` | | PRIMARY-curated | cash |
| Designer | `/designer` | ✓ | PRIMARY-curated (architect) | compass |
| Capture | `/supervisor/capture` | ✓ | PRIMARY-curated (supervisor) | camera |
| Sites | `/sites` | | — (universal); supervisor label → "My Sites" | building |
| Chat | `/chat` | | — (universal) | message |
| Drawings | `/settings/documents` | | — (universal) | doc |
| Permits | `/permits` | | `view_permits` | shield |
| Reports | `/reports` | | `export_tally` | chart |
| Search | `/search` | | `search` | search |
| Admin | `/settings/admin` | | `manage_settings` | users |
| Settings | `/settings` | ✓ | — (universal) | settings |

> **`/settings/team` doesn't exist standalone** (the nested `/settings/*` tree is a later slice). The control plane lives at `/settings/admin` (team · vendors · materials · integrations · documents), so the ADMIN item is **"Admin" → `/settings/admin`**, gated `manage_settings` (owner-only). Team management lives inside it. `Settings` uses `end` (exact match) so `/settings/documents` (Drawings) and `/settings/admin` (Admin) never also activate it.

**Resulting zones (verified against `CAPS`):**
- **owner** → PRIMARY `Dashboard·Approvals·Reconcile·Finance` · SHARED `Sites·Chat·Drawings·Permits·Reports·Search` · ADMIN `Admin·Settings`
- **architect** → PRIMARY `Designer` · SHARED `Sites·Chat·Drawings·Permits·Search` · ADMIN `Settings`
- **supervisor** → PRIMARY `Capture` · SHARED `My Sites·Chat·Drawings·Permits·Search` · ADMIN `Settings`

(`Reports` is owner-only here — needs `export_tally`; `Admin` is owner-only — needs `manage_settings`. Both correct for the 3-role company.)

### `NeevSidebar` (rebuilt)

Props change from `tabs: TabDef[]` to `zones: NavZones` + `roleBadge` + `collapsed: boolean`.

- Brand block (unchanged: "Neev / Command Center"; in collapsed mode → just the "N" mark).
- **PRIMARY** rows, a hairline `border-edge` divider, **SHARED** rows. **No jargon zone labels.**
- A flex spacer, then **ADMIN** rows **pinned to the bottom**, then the profile card.
- Row = `iconName`→SVG + label; active = `bg-surface-card` + `border-edge` + a **3px left `--brand` bar** + `text-brand-text` (translating IA "amber 15% + left bar" to Neev tokens; existing active style already does the tint — add the left bar).
- **Active-state precedence:** `Drawings` (`/settings/documents`) must not light up `Settings` (`/settings`). Settings uses `end`-style matching or a custom `isActive` that excludes deeper `/settings/*` owned by another item.
- **Collapsed rail (56px):** icon-only; label becomes a `title` tooltip (the icons.tsx `title`-prop a11y pattern); active left-bar persists; zone dividers persist.
- The bottom profile card keeps linking to `/settings` (not `/more`).

### `NeevTopBar` (finished)

Adds three things to the existing scope-button + search-pill + bell:
1. **Collapse toggle** (leading, a `panel-left` icon `<button>`): toggles `ui.sidebarCollapsed`; `aria-pressed`; also bound to **`⌘\`** via a global keydown (same pattern as ⌘K in `CommandPalette.tsx`, ignoring text inputs).
2. **Theme control** (a `<button>` showing sun/moon/monitor for the current `mode`): opens a small popover menu with **Light · Dark · System**, calling `useThemeMode().setMode(...)`; current mode marked `aria-current`. Closes on Esc/outside-click (reuse the existing popover pattern in this file).
3. **Avatar menu** — the inert avatar `<span>` becomes a `<button aria-haspopup="menu">` opening a dropdown:
   - header: `roleBadge.name` + role line;
   - **Profile & settings** → `NavLink`/navigate `/settings`;
   - **Sign out** → `clearToken()` + `navigate('/login', { replace:true })` (the exact `More.tsx` `signOut`), styled `text-risk`.
   - Esc/outside-click close; focus returns to the avatar button.

Tests that render `NeevTopBar` get a `ThemeModeProvider` wrapper (since the theme control calls `useThemeMode`, which throws bare). The avatar-menu sign-out is unit-tested with a router + spy on `clearToken`.

### State — `src/store/ui.ts`

Add `sidebarCollapsed: boolean`, `setSidebarCollapsed`, `toggleSidebar`, hydrated from `localStorage('cstk.sidebar')` and persisted on change (mirrors the `cstk.theme` discipline; guarded in try/catch).

### Icons — `src/ui/icons.tsx`

Add, in the existing stroke style (currentColor, the `title`-prop a11y pattern): `ScaleIcon`, `BuildingIcon`, `ChartBarIcon`, `ShieldIcon`, `UsersIcon`, `CompassIcon` (nav), `SunIcon`, `MoonIcon`, `MonitorIcon` (theme), `PanelLeftIcon` (collapse). Reused as-is: grid/check/cash/camera/message/doc/search/settings.

### AppShell wiring — `src/ui/AppShell.tsx`

- Compute `const zones = navForRole(role)` and pass to `NeevSidebar` (with `collapsed` from the ui store). The mobile bottom bar + Blueprint desktop sidebar keep using `tabSet`/`ROLE_TABS` **unchanged**.
- When collapsed, the content column gets the freed width automatically (the sidebar's own width shrinks; no content change needed).
- Pass `roleBadge` to `NeevTopBar` (already there) for the avatar menu.

## What stays untouched
- The mobile bottom bar (`ROLE_TABS`) — the phone is a separate surface; it keeps "More".
- The entire Blueprint shell (PM/accountant/procurement and any blueprint user).
- `More.tsx` and its route — still routable, still serves the phone; just unlinked from the Neev desktop sidebar.
- Backend — zero changes.

## Edge cases / four-state behavior
- **No flash:** nav is derived synchronously from the known `role` prop via `roleCan` — never an async `useCan` gap, so the sidebar never renders empty-then-pops.
- **Unknown/blueprint role:** `navForRole` returns empty PRIMARY + cap-filtered SHARED/ADMIN; but Neev sidebar only mounts for owner/supervisor/architect, so this is a non-path. A defensive empty-zone render must not crash (no divider before an empty zone).
- **Collapsed + active tooltip:** every collapsed row exposes its label via `title` so it stays keyboard- and screen-reader-discoverable.
- **Theme/avatar/scope popovers:** mutually exclusive is not required, but each closes on Esc + outside-click and restores focus to its trigger.

## Testing
- `navModel.test.ts` — `navForRole('owner'|'architect'|'supervisor')` returns the exact zone arrays above (route + order); a SHARED/ADMIN item is dropped when the role lacks its cap (e.g. architect has no `export_tally` → no Reports; no `manage_settings` → no Admin).
- `NeevSidebar.test.tsx` — renders 3 zones with a divider between populated zones, ADMIN last; active row gets the left-bar class; collapsed mode hides labels and sets `title`.
- `NeevTopBar.test.tsx` — collapse toggle flips the store + `⌘\` works; theme menu calls `setMode`; avatar menu opens, Sign out calls `clearToken` + navigates to `/login`.
- Update `AppShell.neev.test.tsx` for the new `zones` prop. Existing `AppShell.test.tsx` (mobile `ROLE_TABS` loop) stays green untouched.
- Gate: `tsc -b` clean, full `vitest` suite green, `npm run build`, bundle budget.

## Rollout
Neev-desktop only, behind the live skin; fully reversible. Lands as one PR → main → Vercel auto-deploy.
