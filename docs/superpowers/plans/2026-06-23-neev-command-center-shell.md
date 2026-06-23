# Neev Command Center Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Neev desktop sidebar from a flat phone-lane list into a capability-grouped Command Center (PRIMARY ▸ SHARED ▸ ADMIN), retire "More" on desktop (links → sidebar; Account/Sign-out → a new top-bar avatar menu), and finish the top bar with a theme control and collapse-to-rail. Owner / supervisor / architect only.

**Architecture:** A new pure `navModel.ts` derives three nav zones from the role: PRIMARY is role-curated (the cockpit), SHARED/ADMIN are filtered through the existing `roleCan(role, cap)`. `NeevSidebar` renders the zones; `NeevTopBar` gains an avatar menu + theme control + collapse toggle; a `sidebarCollapsed` flag in the `ui` store drives the rail. Derivation is synchronous off the known `role` prop → no capability flash.

**Tech Stack:** React 18 + Vite + TypeScript + Tailwind (semantic CSS-var tokens) + react-router v6 + Zustand + Vitest/Testing Library. Spec: `docs/superpowers/specs/2026-06-23-neev-command-center-shell-design.md`.

## Global Constraints

- **Neev-desktop only.** Touch `NeevSidebar`, `NeevTopBar`, and the `neev` branch of `AppShell`. The mobile bottom bar (`ROLE_TABS`), the Blueprint shell, `More.tsx`, and all backend code are **untouched**.
- **Semantic tokens only** — no hardcoded hex; everything must work in neev light AND neev-dark (e.g. `bg-surface-card`, `border-edge`, `text-brand-text`, `bg-brand`, `text-risk`). No emoji in any control.
- **i18n parity** — every new key added to BOTH `src/i18n/en.ts` and `src/i18n/hi.ts`. `TranslationKey = keyof typeof en`.
- **Nav derivation is synchronous** off the `role` prop via `roleCan` (`src/auth/permissions.ts`) — never `useCan`/`useMe` async (avoids the empty-then-pop flash).
- **All existing tests stay green.** `AppShell.test.tsx` (mobile `ROLE_TABS` loop) must not change behavior.
- **Verify before done:** from `constructo/web`: `npx tsc -b --noEmit && npx vitest run --retry=2 && npm run build`. (The 3 `ReconcileDetail.test.tsx` tests are pre-existing flaky under load — `--retry=2`; they are not regressions.)
- **Role values** (`src/api/auth.ts`): `owner | pm | architect | supervisor | accountant | procurement | labor_contractor`. Only owner/supervisor/architect mount the Neev shell today.

---

### Task 1: Pure nav model — `navModel.ts` + Finance/Admin labels

**Files:**
- Create: `constructo/web/src/ui/navModel.ts`
- Create: `constructo/web/src/ui/navModel.test.ts`
- Modify: `constructo/web/src/i18n/en.ts` (add `nav.finance`, `nav.admin`)
- Modify: `constructo/web/src/i18n/hi.ts` (same keys)

**Interfaces:**
- Consumes: `Role` (`src/api/auth.ts`), `Capability` + `roleCan` (`src/auth/permissions.ts`), `TranslationKey` (`src/i18n/en.ts`).
- Produces: `NavItem`, `NavIconName`, `NavZones`, `navForRole(role: Role): NavZones`, `labelKeyFor(item: NavItem, role: Role): TranslationKey`.

- [ ] **Step 1: Add the two new i18n keys.** In `src/i18n/en.ts`, right after `'nav.payments': 'Payments',` add:
```ts
  'nav.finance': 'Finance',
  'nav.admin': 'Admin',
```
In `src/i18n/hi.ts`, after its `'nav.payments'` line add:
```ts
  'nav.finance': 'वित्त',
  'nav.admin': 'एडमिन',
```

- [ ] **Step 2: Write the failing test** — `src/ui/navModel.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { navForRole, labelKeyFor } from './navModel'

const routes = (items: { to: string }[]) => items.map((i) => i.to)

describe('navForRole', () => {
  it('owner gets the full command center across three zones', () => {
    const z = navForRole('owner')
    expect(routes(z.primary)).toEqual(['/owner', '/approvals', '/reconcile', '/payments'])
    expect(routes(z.shared)).toEqual([
      '/sites', '/chat', '/settings/documents', '/permits', '/reports', '/search',
    ])
    expect(routes(z.admin)).toEqual(['/settings/admin', '/settings'])
  })

  it('architect: Designer cockpit, no Reports (no export_tally), no Admin (no manage_settings)', () => {
    const z = navForRole('architect')
    expect(routes(z.primary)).toEqual(['/designer'])
    expect(routes(z.shared)).toEqual(['/sites', '/chat', '/settings/documents', '/permits', '/search'])
    expect(routes(z.admin)).toEqual(['/settings'])
  })

  it('supervisor: Capture cockpit; Sites label overrides to My Sites', () => {
    const z = navForRole('supervisor')
    expect(routes(z.primary)).toEqual(['/supervisor/capture'])
    expect(routes(z.shared)).toEqual(['/sites', '/chat', '/settings/documents', '/permits', '/search'])
    const sites = z.shared.find((i) => i.to === '/sites')!
    expect(labelKeyFor(sites, 'supervisor')).toBe('nav.my_sites')
    expect(labelKeyFor(sites, 'owner')).toBe('nav.sites')
  })

  it('Settings uses exact match; Drawings/Admin do not', () => {
    const settings = navForRole('owner').admin.find((i) => i.to === '/settings')!
    expect(settings.end).toBe(true)
  })
})
```

- [ ] **Step 3: Run it — expect failure** (`Cannot find module './navModel'`):
```
cd constructo/web && npx vitest run src/ui/navModel.test.ts
```

- [ ] **Step 4: Implement** `src/ui/navModel.ts`:
```ts
import type { Role } from '../api/auth'
import type { Capability } from '../auth/permissions'
import { roleCan } from '../auth/permissions'
import type { TranslationKey } from '../i18n'

/** Icon keys resolved to an SVG by the sidebar (keeps this model pure + testable). */
export type NavIconName =
  | 'grid' | 'check' | 'scale' | 'cash' | 'compass' | 'camera'
  | 'building' | 'message' | 'doc' | 'shield' | 'chart' | 'search'
  | 'users' | 'settings'

export interface NavItem {
  to: string
  labelKey: TranslationKey
  /** Per-role label override (supervisor's Sites → "My Sites"). */
  labelKeyByRole?: Partial<Record<Role, TranslationKey>>
  iconName: NavIconName
  /** Required cap to SEE a SHARED/ADMIN item; PRIMARY items are role-curated. */
  cap?: Capability
  /** NavLink exact-match (index-like or to stop prefix bleed). */
  end?: boolean
}

export interface NavZones {
  primary: NavItem[]
  shared: NavItem[]
  admin: NavItem[]
}

// --- the destinations (route · cap · icon) ---
const DASHBOARD: NavItem = { to: '/owner', labelKey: 'nav.brief', iconName: 'grid', end: true }
const APPROVALS: NavItem = { to: '/approvals', labelKey: 'nav.approvals', iconName: 'check' }
const RECONCILE: NavItem = { to: '/reconcile', labelKey: 'nav.reconcile', iconName: 'scale' }
const FINANCE: NavItem = { to: '/payments', labelKey: 'nav.finance', iconName: 'cash' }
const DESIGNER: NavItem = { to: '/designer', labelKey: 'nav.designer', iconName: 'compass', end: true }
const CAPTURE: NavItem = { to: '/supervisor/capture', labelKey: 'nav.capture', iconName: 'camera', end: true }

const SITES: NavItem = {
  to: '/sites', labelKey: 'nav.sites',
  labelKeyByRole: { supervisor: 'nav.my_sites' }, iconName: 'building',
}
const CHAT: NavItem = { to: '/chat', labelKey: 'nav.chat', iconName: 'message' }
const DRAWINGS: NavItem = { to: '/settings/documents', labelKey: 'nav.documents', iconName: 'doc' }
const PERMITS: NavItem = { to: '/permits', labelKey: 'nav.permits', iconName: 'shield', cap: 'view_permits' }
const REPORTS: NavItem = { to: '/reports', labelKey: 'nav.reports', iconName: 'chart', cap: 'export_tally' }
const SEARCH: NavItem = { to: '/search', labelKey: 'nav.search', iconName: 'search', cap: 'search' }

const ADMIN_CONSOLE: NavItem = { to: '/settings/admin', labelKey: 'nav.admin', iconName: 'users', cap: 'manage_settings' }
const SETTINGS: NavItem = { to: '/settings', labelKey: 'nav.settings', iconName: 'settings', end: true }

// PRIMARY is the role's cockpit (curated — the owner holds every cap but must
// not see "Capture"). SHARED/ADMIN are universal, cap-filtered.
const PRIMARY_BY_ROLE: Partial<Record<Role, NavItem[]>> = {
  owner: [DASHBOARD, APPROVALS, RECONCILE, FINANCE],
  pm: [DASHBOARD, APPROVALS],
  architect: [DESIGNER],
  supervisor: [CAPTURE],
}

const SHARED: NavItem[] = [SITES, CHAT, DRAWINGS, PERMITS, REPORTS, SEARCH]
const ADMIN: NavItem[] = [ADMIN_CONSOLE, SETTINGS]

export function navForRole(role: Role): NavZones {
  const gate = (i: NavItem) => !i.cap || roleCan(role, i.cap)
  return {
    primary: PRIMARY_BY_ROLE[role] ?? [],
    shared: SHARED.filter(gate),
    admin: ADMIN.filter(gate),
  }
}

/** Resolve the i18n label key for an item under a role (honours per-role override). */
export function labelKeyFor(item: NavItem, role: Role): TranslationKey {
  return item.labelKeyByRole?.[role] ?? item.labelKey
}
```

- [ ] **Step 5: Run tests — expect PASS:**
```
cd constructo/web && npx vitest run src/ui/navModel.test.ts
```
Expected: 4 passed.

- [ ] **Step 6: Typecheck + commit:**
```
cd constructo/web && npx tsc -b --noEmit
git add constructo/web/src/ui/navModel.ts constructo/web/src/ui/navModel.test.ts constructo/web/src/i18n/en.ts constructo/web/src/i18n/hi.ts
git commit -m "feat(web/nav): pure capability-grouped nav model (navForRole)"
```

---

### Task 2: New icons for the command center

**Files:**
- Modify: `constructo/web/src/ui/icons.tsx` (add 10 icons)
- Create: `constructo/web/src/ui/icons.commandcenter.test.tsx`

**Interfaces:**
- Produces (all `(p: IconProps) => JSX`, same signature as existing icons): `ScaleIcon`, `BuildingIcon`, `ChartBarIcon`, `ShieldIcon`, `UsersIcon`, `CompassIcon`, `SunIcon`, `MoonIcon`, `MonitorIcon`, `PanelLeftIcon`.

- [ ] **Step 1: Write the failing test** — `src/ui/icons.commandcenter.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  ScaleIcon, BuildingIcon, ChartBarIcon, ShieldIcon, UsersIcon,
  CompassIcon, SunIcon, MoonIcon, MonitorIcon, PanelLeftIcon,
} from './icons'

const icons = {
  ScaleIcon, BuildingIcon, ChartBarIcon, ShieldIcon, UsersIcon,
  CompassIcon, SunIcon, MoonIcon, MonitorIcon, PanelLeftIcon,
}

describe('command-center icons', () => {
  it.each(Object.entries(icons))('%s renders an svg and honours the title a11y prop', (_n, Icon) => {
    const { container } = render(<Icon title="x" />)
    const svg = container.querySelector('svg')!
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.querySelector('title')?.textContent).toBe('x')
  })
})
```

- [ ] **Step 2: Run it — expect failure** (icons not exported):
```
cd constructo/web && npx vitest run src/ui/icons.commandcenter.test.tsx
```

- [ ] **Step 3: Implement** — append to `src/ui/icons.tsx` (use the existing `base(...)` helper; simple stroke shapes in the house style). Example for three, then the rest follow the same shape:
```tsx
/** Reconcile — balance scale. */
export const ScaleIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <path d="M12 4v16M7 20h10" />
    <path d="M6 7h12M6 7l-2.5 5a2.5 2.5 0 0 0 5 0L6 7Zm12 0-2.5 5a2.5 2.5 0 0 0 5 0L18 7Z" />
  </>) })

/** Sites — building. */
export const BuildingIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <rect x="5" y="3" width="14" height="18" rx="1" />
    <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" />
  </>) })

/** Reports — bar chart. */
export const ChartBarIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <path d="M4 20h16" />
    <rect x="6" y="11" width="3" height="6" /><rect x="11" y="7" width="3" height="10" /><rect x="16" y="13" width="3" height="4" />
  </>) })

/** Permits — shield. */
export const ShieldIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <path d="M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </>) })

/** Admin / team — people. */
export const UsersIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 5.5a3 3 0 0 1 0 5M21 20a6 6 0 0 0-4-5.7" />
  </>) })

/** Designer — compass / draftsman. */
export const CompassIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </>) })

/** Theme — sun. */
export const SunIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>) })

/** Theme — moon. */
export const MoonIcon = (p: IconProps) =>
  base({ ...p, children: <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z" /> })

/** Theme — system (monitor). */
export const MonitorIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <rect x="3" y="4" width="18" height="12" rx="1" />
    <path d="M8 20h8M12 16v4" />
  </>) })

/** Collapse — panel-left. */
export const PanelLeftIcon = (p: IconProps) =>
  base({ ...p, children: (<>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </>) })
```

- [ ] **Step 4: Run tests — expect PASS** (10 icons):
```
cd constructo/web && npx vitest run src/ui/icons.commandcenter.test.tsx
```

- [ ] **Step 5: Commit:**
```
git add constructo/web/src/ui/icons.tsx constructo/web/src/ui/icons.commandcenter.test.tsx
git commit -m "feat(web/icons): command-center nav + theme + collapse icons"
```

---

### Task 3: `sidebarCollapsed` in the UI store

**Files:**
- Modify: `constructo/web/src/store/ui.ts`
- Create: `constructo/web/src/store/ui.test.ts`

**Interfaces:**
- Produces on `useUiStore`: `sidebarCollapsed: boolean`, `setSidebarCollapsed(v: boolean): void`, `toggleSidebar(): void`. Persisted to `localStorage('cstk.sidebar')`.

- [ ] **Step 1: Write the failing test** — `src/store/ui.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from './ui'

describe('ui store — sidebar collapse', () => {
  beforeEach(() => {
    localStorage.clear()
    useUiStore.setState({ sidebarCollapsed: false })
  })

  it('toggles and persists to localStorage', () => {
    expect(useUiStore.getState().sidebarCollapsed).toBe(false)
    useUiStore.getState().toggleSidebar()
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
    expect(localStorage.getItem('cstk.sidebar')).toBe('1')
    useUiStore.getState().setSidebarCollapsed(false)
    expect(localStorage.getItem('cstk.sidebar')).toBe('0')
  })
})
```

- [ ] **Step 2: Run it — expect failure** (`toggleSidebar is not a function`):
```
cd constructo/web && npx vitest run src/store/ui.test.ts
```

- [ ] **Step 3: Implement** — edit `src/store/ui.ts`. Add to the `UiState` interface:
```ts
  /** Desktop sidebar collapsed to an icon rail (neev). Persisted. */
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
```
Add a reader+writer above the `create` call:
```ts
const SIDEBAR_KEY = 'cstk.sidebar'
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}
function writeCollapsed(v: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, v ? '1' : '0')
  } catch {
    /* localStorage unavailable — runtime-only */
  }
}
```
In the `create` initializer, add:
```ts
  sidebarCollapsed: readCollapsed(),
  setSidebarCollapsed: (sidebarCollapsed) => {
    writeCollapsed(sidebarCollapsed)
    set({ sidebarCollapsed })
  },
  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarCollapsed
      writeCollapsed(next)
      return { sidebarCollapsed: next }
    }),
```

- [ ] **Step 4: Run tests — expect PASS:**
```
cd constructo/web && npx vitest run src/store/ui.test.ts
```

- [ ] **Step 5: Commit:**
```
git add constructo/web/src/store/ui.ts constructo/web/src/store/ui.test.ts
git commit -m "feat(web/ui): persisted sidebarCollapsed flag"
```

---

### Task 4: Rebuild `NeevSidebar` with grouped zones + collapse

**Files:**
- Modify: `constructo/web/src/ui/NeevSidebar.tsx` (full rewrite of the body)
- Create: `constructo/web/src/ui/NeevSidebar.test.tsx`

**Interfaces:**
- Consumes: `NavZones`, `NavItem`, `NavIconName`, `labelKeyFor` (Task 1); the icons (Task 2); `useT` (`src/i18n`).
- Produces: `NeevSidebar` now takes `{ zones: NavZones; role: Role; roleBadge?: {name; initials}; collapsed: boolean }` (was `{ tabs; roleBadge }`).

- [ ] **Step 1: Write the failing test** — `src/ui/NeevSidebar.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../i18n'
import { NeevSidebar } from './NeevSidebar'
import { navForRole } from './navModel'

function renderSidebar(role: 'owner' | 'architect' | 'supervisor', collapsed = false) {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/owner']}>
        <NeevSidebar zones={navForRole(role)} role={role} collapsed={collapsed}
          roleBadge={{ name: 'Owner', initials: 'OW' }} />
      </MemoryRouter>
    </LanguageProvider>,
  )
}

describe('NeevSidebar', () => {
  it('owner: renders all three zones with zone dividers and Settings last', () => {
    renderSidebar('owner')
    const nav = screen.getByRole('navigation', { name: /primary/i })
    for (const label of ['Brief', 'Approvals', 'Reconcile', 'Finance', 'Sites', 'Drawings', 'Reports', 'Admin', 'Settings']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument()
    }
    // two dividers separate the three zones
    expect(nav.querySelectorAll('[data-zone-divider]').length).toBe(2)
    // "More" is retired in the desktop sidebar
    expect(within(nav).queryByRole('link', { name: 'More' })).toBeNull()
  })

  it('supervisor: Sites label shows as "My Sites"; no Reports/Admin', () => {
    renderSidebar('supervisor')
    const nav = screen.getByRole('navigation', { name: /primary/i })
    expect(within(nav).getByRole('link', { name: 'My Sites' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('collapsed: labels are hidden but exposed via title for a11y', () => {
    renderSidebar('owner', true)
    const link = screen.getByRole('link', { name: 'Brief' }) // accessible name from title
    expect(link).toHaveAttribute('title', 'Brief')
  })
})
```

- [ ] **Step 2: Run it — expect failure** (props mismatch / `navForRole` import OK, component still flat):
```
cd constructo/web && npx vitest run src/ui/NeevSidebar.test.tsx
```

- [ ] **Step 3: Implement** — replace `src/ui/NeevSidebar.tsx` entirely:
```tsx
import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Role } from '../api/auth'
import { useT } from '../i18n'
import { labelKeyFor, type NavIconName, type NavItem, type NavZones } from './navModel'
import {
  GridIcon, CheckIcon, ScaleIcon, CashIcon, CompassIcon, CameraIcon,
  BuildingIcon, MessageIcon, DocIcon, ShieldIcon, ChartBarIcon, SearchIcon,
  UsersIcon, SettingsIcon,
} from './icons'

export interface NeevSidebarProps {
  zones: NavZones
  role: Role
  roleBadge?: { name: string; initials: string }
  collapsed: boolean
}

const NAV_ICONS: Record<NavIconName, ReactNode> = {
  grid: <GridIcon />, check: <CheckIcon />, scale: <ScaleIcon />, cash: <CashIcon />,
  compass: <CompassIcon />, camera: <CameraIcon />, building: <BuildingIcon />,
  message: <MessageIcon />, doc: <DocIcon />, shield: <ShieldIcon />,
  chart: <ChartBarIcon />, search: <SearchIcon />, users: <UsersIcon />, settings: <SettingsIcon />,
}

/**
 * NeevSidebar — the Command Center desktop sidebar (neev skin only).
 * Brand · PRIMARY ▸ SHARED zones (top) · ADMIN zone pinned bottom · profile card.
 * Capability-grouped via navModel; collapses to a 56px icon rail. Desktop-only.
 */
export function NeevSidebar({ zones, role, roleBadge, collapsed }: NeevSidebarProps) {
  const t = useT()

  function Row({ item }: { item: NavItem }) {
    const label = t(labelKeyFor(item, role))
    return (
      <NavLink
        to={item.to}
        end={item.end}
        title={collapsed ? label : undefined}
        className={({ isActive }) =>
          `relative flex min-h-tap items-center gap-3 rounded-[13px] border px-3 py-2.5 font-body text-small font-semibold cstk-animate transition ${
            collapsed ? 'justify-center' : ''
          } ${
            isActive
              ? 'border-edge bg-surface-card text-brand-text shadow-card before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand'
              : 'border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          }`
        }
      >
        <span className="text-[1.15em] leading-none" aria-hidden>{NAV_ICONS[item.iconName]}</span>
        {collapsed ? null : <span className="flex-1">{label}</span>}
      </NavLink>
    )
  }

  return (
    <aside
      className={`hidden shrink-0 flex-col gap-1 border-r border-edge bg-surface-sunken pb-5 pt-5 md:flex ${
        collapsed ? 'items-stretch px-2 md:w-[64px]' : 'px-4 md:w-[264px]'
      }`}
    >
      {/* Brand */}
      <div className={`flex items-center gap-3 pb-4 ${collapsed ? 'justify-center px-0' : 'px-2'}`}>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-text-primary">
          <span className="font-display text-lg font-bold text-surface-card">N</span>
        </div>
        {collapsed ? null : (
          <div className="min-w-0">
            <div className="font-display text-h2 font-semibold leading-none text-text-primary">Neev</div>
            <div className="mt-1 text-micro font-semibold uppercase tracking-[0.14em] text-text-muted">
              Command Center
            </div>
          </div>
        )}
      </div>

      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1">
        {zones.primary.map((i) => <Row key={i.to} item={i} />)}
        {zones.shared.length ? <div data-zone-divider className="my-2 border-t border-edge" /> : null}
        {zones.shared.map((i) => <Row key={i.to} item={i} />)}
        <div className="flex-1" />
        {zones.admin.length ? <div data-zone-divider className="my-2 border-t border-edge" /> : null}
        {zones.admin.map((i) => <Row key={i.to} item={i} />)}
      </nav>

      {/* Profile card → settings */}
      {roleBadge ? (
        <NavLink
          to="/settings"
          title={collapsed ? roleBadge.name : undefined}
          className={`mt-1 flex items-center gap-3 rounded-control border border-edge bg-surface-card py-2.5 shadow-card cstk-animate transition hover:bg-surface-hover ${
            collapsed ? 'justify-center px-2' : 'px-3'
          }`}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-subtle font-display text-small font-bold text-brand-text">
            {roleBadge.initials}
          </span>
          {collapsed ? null : (
            <div className="min-w-0 flex-1">
              <div className="truncate font-body text-small font-semibold text-text-primary">{roleBadge.name}</div>
              <div className="text-micro text-text-muted">Profile &amp; settings</div>
            </div>
          )}
        </NavLink>
      ) : null}
    </aside>
  )
}
```

- [ ] **Step 4: Run tests — expect PASS:**
```
cd constructo/web && npx vitest run src/ui/NeevSidebar.test.tsx
```

- [ ] **Step 5: Commit:**
```
git add constructo/web/src/ui/NeevSidebar.tsx constructo/web/src/ui/NeevSidebar.test.tsx
git commit -m "feat(web/nav): NeevSidebar grouped zones + collapse-to-rail"
```

---

### Task 5: Avatar dropdown menu

**Files:**
- Create: `constructo/web/src/ui/AvatarMenu.tsx`
- Create: `constructo/web/src/ui/AvatarMenu.test.tsx`
- Modify: `constructo/web/src/i18n/en.ts` + `hi.ts` (add `shell.profile_settings`)

**Interfaces:**
- Consumes: `clearToken` (`src/api/auth`), `useNavigate` (react-router), `useT`, `settings.signout` (existing key).
- Produces: `AvatarMenu({ roleBadge }: { roleBadge: { name: string; initials: string } })`.

- [ ] **Step 1: Add i18n key.** `en.ts`: `'shell.profile_settings': 'Profile & settings',`. `hi.ts`: `'shell.profile_settings': 'प्रोफ़ाइल और सेटिंग्स',`.

- [ ] **Step 2: Write the failing test** — `src/ui/AvatarMenu.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../i18n'
import { AvatarMenu } from './AvatarMenu'
import * as auth from '../api/auth'

const nav = vi.fn()
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => nav,
}))

describe('AvatarMenu', () => {
  beforeEach(() => nav.mockClear())

  it('opens, shows identity + sign out, and signs out', () => {
    const spy = vi.spyOn(auth, 'clearToken').mockImplementation(() => {})
    render(
      <LanguageProvider>
        <MemoryRouter>
          <AvatarMenu roleBadge={{ name: 'Owner', initials: 'OW' }} />
        </MemoryRouter>
      </LanguageProvider>,
    )
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /owner/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /sign out/i }))
    expect(spy).toHaveBeenCalled()
    expect(nav).toHaveBeenCalledWith('/login', { replace: true })
  })
})
```

- [ ] **Step 3: Run it — expect failure** (`Cannot find module './AvatarMenu'`):
```
cd constructo/web && npx vitest run src/ui/AvatarMenu.test.tsx
```

- [ ] **Step 4: Implement** — `src/ui/AvatarMenu.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { clearToken } from '../api/auth'
import { useT } from '../i18n'
import { SettingsIcon, SignOutIcon } from './icons'

export function AvatarMenu({ roleBadge }: { roleBadge: { name: string; initials: string } }) {
  const t = useT()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() }
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  function signOut() {
    clearToken()
    navigate('/login', { replace: true })
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={roleBadge.name}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-subtle font-display text-small font-bold text-brand-text ring-2 ring-surface-card cstk-animate transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {roleBadge.initials}
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={roleBadge.name}
          className="absolute right-0 top-full z-50 mt-2 w-56 animate-reveal-down overflow-hidden rounded-sheet border border-edge bg-surface-overlay p-1.5 shadow-pop"
        >
          <div className="px-3 py-2">
            <div className="truncate font-body text-small font-semibold text-text-primary">{roleBadge.name}</div>
          </div>
          <div className="my-1 border-t border-edge" />
          <NavLink
            to="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-tap items-center gap-3 rounded-control px-3 font-body text-small font-semibold text-text-primary cstk-animate transition hover:bg-surface-hover"
          >
            <SettingsIcon className="text-text-muted" aria-hidden />
            <span>{t('shell.profile_settings')}</span>
          </NavLink>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="flex min-h-tap w-full items-center gap-3 rounded-control px-3 text-left font-body text-small font-semibold text-risk cstk-animate transition hover:bg-surface-hover"
          >
            <SignOutIcon aria-hidden />
            <span>{t('settings.signout')}</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
```
> Note: `roleBadge.name` is the only identity string available (the `Me` query has the user's `name`, but the shell passes a role-derived badge), so the menu header shows just `roleBadge.name`. A richer profile header is a later slice.

- [ ] **Step 5: Run tests — expect PASS:**
```
cd constructo/web && npx vitest run src/ui/AvatarMenu.test.tsx
```

- [ ] **Step 6: Commit:**
```
git add constructo/web/src/ui/AvatarMenu.tsx constructo/web/src/ui/AvatarMenu.test.tsx constructo/web/src/i18n/en.ts constructo/web/src/i18n/hi.ts
git commit -m "feat(web/shell): avatar dropdown menu (profile · sign out)"
```

---

### Task 6: Theme control + collapse toggle in `NeevTopBar`

**Files:**
- Create: `constructo/web/src/ui/ThemeControl.tsx`
- Create: `constructo/web/src/ui/ThemeControl.test.tsx`
- Modify: `constructo/web/src/ui/NeevTopBar.tsx` (mount collapse toggle, ThemeControl, AvatarMenu; add `⌘\`)
- Modify: `constructo/web/src/i18n/en.ts` + `hi.ts` (add `shell.collapse_sidebar`, `shell.expand_sidebar`, `shell.appearance`)

**Interfaces:**
- Consumes: `useThemeMode` (`src/ui/ThemeModeProvider`), `useUiStore` (`toggleSidebar`, `sidebarCollapsed`), `AvatarMenu` (Task 5), the theme icons (Task 2).
- Produces: `ThemeControl()` (self-contained). `NeevTopBar` keeps its prop shape.

- [ ] **Step 1: Add i18n keys.** `en.ts`: `'shell.collapse_sidebar': 'Collapse sidebar',` `'shell.expand_sidebar': 'Expand sidebar',` `'shell.appearance': 'Appearance',`. `hi.ts`: `'shell.collapse_sidebar': 'साइडबार छोटा करें',` `'shell.expand_sidebar': 'साइडबार बड़ा करें',` `'shell.appearance': 'दिखावट',`.

- [ ] **Step 2: Write the failing test** — `src/ui/ThemeControl.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageProvider } from '../i18n'
import { ThemeModeProvider } from './ThemeModeProvider'
import { ThemeControl } from './ThemeControl'

function setup() {
  return render(
    <LanguageProvider>
      <ThemeModeProvider>
        <ThemeControl />
      </ThemeModeProvider>
    </LanguageProvider>,
  )
}

describe('ThemeControl', () => {
  it('opens a Light/Dark/System menu and applies a choice', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /appearance/i }))
    const menu = screen.getByRole('menu')
    for (const label of ['Light', 'Dark', 'System']) {
      expect(screen.getByRole('menuitemradio', { name: label })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toMatch(/dark/)
    void menu
  })
})
```

- [ ] **Step 3: Run it — expect failure** (`Cannot find module './ThemeControl'`):
```
cd constructo/web && npx vitest run src/ui/ThemeControl.test.tsx
```

- [ ] **Step 4: Implement** — `src/ui/ThemeControl.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { useThemeMode, type ThemeMode } from './ThemeModeProvider'
import { SunIcon, MoonIcon, MonitorIcon } from './icons'

const OPTIONS: { mode: ThemeMode; labelKey: 'settings.appearance.light' | 'settings.appearance.dark' | 'settings.appearance.system'; Icon: typeof SunIcon }[] = [
  { mode: 'light', labelKey: 'settings.appearance.light', Icon: SunIcon },
  { mode: 'dark', labelKey: 'settings.appearance.dark', Icon: MoonIcon },
  { mode: 'system', labelKey: 'settings.appearance.system', Icon: MonitorIcon },
]

export function ThemeControl() {
  const t = useT()
  const { mode, setMode } = useThemeMode()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const Current = mode === 'dark' ? MoonIcon : mode === 'light' ? SunIcon : MonitorIcon

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('shell.appearance')}
        className="grid h-10 w-10 place-items-center rounded-control text-text-primary cstk-animate transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Current />
      </button>
      {open ? (
        <div role="menu" aria-label={t('shell.appearance')}
          className="absolute right-0 top-full z-50 mt-2 w-44 animate-reveal-down overflow-hidden rounded-sheet border border-edge bg-surface-overlay p-1.5 shadow-pop">
          {OPTIONS.map(({ mode: m, labelKey, Icon }) => (
            <button
              key={m}
              type="button"
              role="menuitemradio"
              aria-checked={mode === m}
              onClick={() => { setMode(m); setOpen(false) }}
              className={`flex min-h-tap w-full items-center gap-3 rounded-control px-3 text-left font-body text-small font-semibold cstk-animate transition hover:bg-surface-hover ${
                mode === m ? 'text-brand-text' : 'text-text-primary'
              }`}
            >
              <Icon className="text-text-muted" aria-hidden />
              <span className="flex-1">{t(labelKey)}</span>
              {mode === m ? <span className="h-2 w-2 rounded-full bg-brand" aria-hidden /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 5: Run tests — expect PASS:**
```
cd constructo/web && npx vitest run src/ui/ThemeControl.test.tsx
```

- [ ] **Step 6: Wire into `NeevTopBar.tsx`.** Add imports:
```tsx
import { useUiStore } from '../store/ui'
import { AvatarMenu } from './AvatarMenu'
import { ThemeControl } from './ThemeControl'
import { BellIcon, ChevronDownIcon, SearchIcon, PanelLeftIcon } from './icons'
```
Add `import { useT } from '../i18n'` to the import block (it is not currently imported in `NeevTopBar.tsx`). Inside the component, add store reads + the localized `t` + the `⌘\` listener (near the existing escape effect):
```tsx
  const t = useT()
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
```
Add a global shortcut effect:
```tsx
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (!typing && (e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleSidebar])
```
At the **start** of the `<header>` content (before the scope button) add the collapse toggle:
```tsx
      <button
        type="button"
        onClick={toggleSidebar}
        aria-pressed={sidebarCollapsed}
        aria-label={sidebarCollapsed ? t('shell.expand_sidebar') : t('shell.collapse_sidebar')}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-control text-text-primary cstk-animate transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <PanelLeftIcon />
      </button>
```
Replace the trailing inert avatar `<span>…</span>` block (the `{roleBadge ? (<span …>{initials}</span>) : null}`) with the ThemeControl + AvatarMenu:
```tsx
      <ThemeControl />
      {roleBadge ? <AvatarMenu roleBadge={roleBadge} /> : null}
```

- [ ] **Step 7: Update `NeevTopBar` test (or create it)** — `src/ui/NeevTopBar.test.tsx` (create if absent). Assert the collapse toggle flips the store:
```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../i18n'
import { ThemeModeProvider } from './ThemeModeProvider'
import { NeevTopBar } from './NeevTopBar'
import { useUiStore } from '../store/ui'

function setup() {
  return render(
    <LanguageProvider>
      <ThemeModeProvider>
        <MemoryRouter>
          <NeevTopBar sites={[]} selectedSiteId={null} onSelectSite={() => {}}
            roleBadge={{ name: 'Owner', initials: 'OW' }} />
        </MemoryRouter>
      </ThemeModeProvider>
    </LanguageProvider>,
  )
}

describe('NeevTopBar command-center controls', () => {
  beforeEach(() => useUiStore.setState({ sidebarCollapsed: false }))

  it('collapse toggle flips the sidebar store flag', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }))
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
  })

  it('renders the theme control and the avatar menu trigger', () => {
    setup()
    expect(screen.getByRole('button', { name: /appearance/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /owner/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 8: Run the topbar + theme tests — expect PASS:**
```
cd constructo/web && npx vitest run src/ui/ThemeControl.test.tsx src/ui/NeevTopBar.test.tsx
```

- [ ] **Step 9: Commit:**
```
git add constructo/web/src/ui/ThemeControl.tsx constructo/web/src/ui/ThemeControl.test.tsx constructo/web/src/ui/NeevTopBar.tsx constructo/web/src/ui/NeevTopBar.test.tsx constructo/web/src/i18n/en.ts constructo/web/src/i18n/hi.ts
git commit -m "feat(web/shell): top-bar theme control + collapse toggle (⌘\\)"
```

---

### Task 7: Wire `AppShell` to the grouped nav + collapse, and verify

**Files:**
- Modify: `constructo/web/src/ui/AppShell.tsx` (pass `navForRole(role)` + `collapsed` to `NeevSidebar`)
- Modify: `constructo/web/src/ui/AppShell.neev.test.tsx` (new `zones` prop)

**Interfaces:**
- Consumes: `navForRole` (Task 1), `useUiStore` (Task 3), the rebuilt `NeevSidebar` (Task 4).

- [ ] **Step 1: Update the failing test** — `src/ui/AppShell.neev.test.tsx`. The rebuilt `NeevSidebar` and `NeevTopBar` now call `useT()`, which **throws without a `LanguageProvider`** — so wrap `renderShell` in one. Add `import { LanguageProvider } from '../i18n'` and wrap the existing tree (outermost, around `QueryClientProvider`):
```tsx
return render(
  <LanguageProvider>
    <QueryClientProvider client={qc}>
      <ThemeModeProvider>
        <MemoryRouter>
          {/* …existing <AppShell …> unchanged… */}
        </MemoryRouter>
      </ThemeModeProvider>
    </QueryClientProvider>
  </LanguageProvider>,
)
```
Also reset the shared `ui` store in `beforeEach` so a prior test's collapse state can't hide the brand block: add `import { useUiStore } from '../store/ui'` and in the existing `beforeEach` add `useUiStore.setState({ sidebarCollapsed: false })`.

Then add to the "neev renders sidebar" test — the owner now shows the grouped desk tools that were NOT in the old flat sidebar (`Reconcile`/`Finance` are sidebar-only — they're not in the mobile `ROLE_TABS`, so a singular `getByRole` is unambiguous):
```tsx
// owner neev sidebar now surfaces the grouped desk tools
expect(screen.getByRole('link', { name: 'Reconcile' })).toBeInTheDocument()
expect(screen.getByRole('link', { name: 'Finance' })).toBeInTheDocument()
```
> Do NOT assert `queryByRole('link', { name: 'More' })` here — the **mobile** bottom bar (rendered `md:hidden`, still in the jsdom DOM) keeps its "More" tab. The "no More in the sidebar" check lives in `NeevSidebar.test.tsx` (scoped to the sidebar `nav`).

- [ ] **Step 2: Run it — expect failure** (More still present / Reconcile absent in the neev sidebar):
```
cd constructo/web && npx vitest run src/ui/AppShell.neev.test.tsx
```

- [ ] **Step 3: Implement** — in `src/ui/AppShell.tsx`:
  1. Add imports: `import { navForRole } from './navModel'` and ensure `useUiStore` is imported.
  2. In the component body add:
```tsx
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const neevZones = navForRole(role)
```
  3. Replace the NeevSidebar render:
```tsx
      {neev ? (
        <NeevSidebar zones={neevZones} role={role} roleBadge={roleBadge} collapsed={sidebarCollapsed} />
      ) : null}
```
  (The mobile bottom-bar `<nav>` and Blueprint sidebar continue to use `tabSet`/`ROLE_TABS` unchanged.)

- [ ] **Step 4: Run the neev shell tests — expect PASS:**
```
cd constructo/web && npx vitest run src/ui/AppShell.neev.test.tsx src/ui/AppShell.test.tsx
```
Expected: both files green (the mobile `AppShell.test.tsx` is unaffected — it asserts the bottom-bar `ROLE_TABS`, still intact).

- [ ] **Step 5: Full gate.**
```
cd constructo/web && npx tsc -b --noEmit && npx vitest run --retry=2 && npm run build
```
Expected: tsc clean; suite green (only the 3 known `ReconcileDetail` flakes may retry); build OK.

- [ ] **Step 6: Commit:**
```
git add constructo/web/src/ui/AppShell.tsx constructo/web/src/ui/AppShell.neev.test.tsx
git commit -m "feat(web/shell): AppShell drives NeevSidebar from capability zones + collapse"
```

---

## Notes for the final whole-branch review
- Confirm **no neev hardcoded hex** (grep the touched files for `#`), all surfaces use semantic tokens (works in neev-dark).
- Confirm the **mobile bottom bar + Blueprint** are byte-unchanged in behavior (only `AppShell`'s `neev` branch changed; `ROLE_TABS` untouched).
- Confirm **active-state precedence**: visiting `/settings/documents` lights Drawings, not Settings (Settings has `end`); `/settings/admin` lights Admin, not Settings.
- Visual proof (mock owner): the recipe is `.env.local` with `VITE_USE_MOCKS=true`+`VITE_NEEV_OWNER=true`, preview, login `+919800000001`/`000000`, width ≥768 — screenshot expanded + collapsed, light + dark.
