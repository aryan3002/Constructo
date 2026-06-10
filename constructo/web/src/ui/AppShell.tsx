import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useT, type TranslationKey } from '../i18n'
import { useUiStore } from '../store/ui'
import {
  CameraIcon,
  CheckIcon,
  DotsIcon,
  GridIcon,
  ListIcon,
  SearchIcon,
} from './icons'
import { SiteSwitcher, type SiteSummary } from './SiteSwitcher'
import { NotificationsPanel } from '../features/notifications/NotificationsPanel'
import { useUnreadCount } from '../features/notifications/useUnreadCount'

/**
 * Every backend role gets a role-shaped tab bar. Mirrors the six roles the auth
 * surface issues (owner | pm | supervisor | accountant | procurement |
 * labor_contractor). `contractor` is kept as a legacy alias of `labor_contractor`
 * so older callers (and tests) keep working.
 */
export type Role =
  | 'owner'
  | 'pm'
  | 'architect'
  | 'supervisor'
  | 'accountant'
  | 'procurement'
  | 'labor_contractor'
  | 'contractor'

export interface TabDef {
  to: string
  /** i18n key for the label (resolved by AppShell / useRoleTabs). */
  labelKey: TranslationKey
  /** Resolved label — defaults to the English string for provider-less render. */
  label: string
  icon: ReactNode
  /** Match the route exactly (for the index tab). */
  end?: boolean
}

// De-emojied: SVG icons (a11y — never an emoji for a critical control). The
// rupee mark stays a real currency glyph (not an emoji) in the ledger mono face.
const CashIcon = <span className="cstk-mono text-[1.05em] font-semibold">₹</span>

/**
 * Role-shaped tab bars, one per IA lane (see 07-Design / Information Architecture).
 * The `label` here is the English default so the bar renders correctly even
 * without a LanguageProvider (e.g. in unit tests); `useRoleTabs` localizes them.
 */
export const ROLE_TABS: Record<Role, TabDef[]> = {
  owner: [
    { to: '/', labelKey: 'nav.brief', label: 'Brief', icon: <GridIcon />, end: true },
    { to: '/sites', labelKey: 'nav.sites', label: 'Sites', icon: <ListIcon /> },
    { to: '/approvals', labelKey: 'nav.approvals', label: 'Approvals', icon: <CheckIcon /> },
    { to: '/search', labelKey: 'nav.search', label: 'Search', icon: <SearchIcon /> },
    { to: '/more', labelKey: 'nav.more', label: 'More', icon: <DotsIcon /> },
  ],
  pm: [
    { to: '/', labelKey: 'nav.today', label: 'Today', icon: <GridIcon />, end: true },
    { to: '/sites', labelKey: 'nav.sites', label: 'Sites', icon: <ListIcon /> },
    { to: '/approvals', labelKey: 'nav.approvals', label: 'Approvals', icon: <CheckIcon /> },
    { to: '/search', labelKey: 'nav.search', label: 'Search', icon: <SearchIcon /> },
    { to: '/more', labelKey: 'nav.more', label: 'More', icon: <DotsIcon /> },
  ],
  // Architect (interior fit-out) — owns the Material Specification schedule.
  architect: [
    { to: '/spec-desk', labelKey: 'nav.specs', label: 'Spec desk', icon: <ListIcon />, end: true },
    { to: '/sites', labelKey: 'nav.sites', label: 'Sites', icon: <ListIcon /> },
    { to: '/search', labelKey: 'nav.search', label: 'Search', icon: <SearchIcon /> },
    { to: '/more', labelKey: 'nav.more', label: 'More', icon: <DotsIcon /> },
  ],
  supervisor: [
    { to: '/supervisor/capture', labelKey: 'nav.capture', label: 'Capture', icon: <CameraIcon />, end: true },
    { to: '/sites', labelKey: 'nav.my_sites', label: 'My Sites', icon: <ListIcon /> },
    { to: '/search', labelKey: 'nav.search', label: 'Search', icon: <SearchIcon /> },
    { to: '/more', labelKey: 'nav.more', label: 'More', icon: <DotsIcon /> },
  ],
  accountant: [
    { to: '/reconcile', labelKey: 'nav.reconcile', label: 'Reconcile', icon: <GridIcon />, end: true },
    { to: '/payments', labelKey: 'nav.bills', label: 'Bills', icon: CashIcon },
    { to: '/search', labelKey: 'nav.search', label: 'Search', icon: <SearchIcon /> },
    { to: '/more', labelKey: 'nav.more', label: 'More', icon: <DotsIcon /> },
  ],
  procurement: [
    { to: '/reconcile', labelKey: 'nav.orders', label: 'Orders', icon: <ListIcon />, end: true },
    { to: '/permits', labelKey: 'nav.permits', label: 'Permits', icon: <ListIcon /> },
    { to: '/search', labelKey: 'nav.search', label: 'Search', icon: <SearchIcon /> },
    { to: '/more', labelKey: 'nav.more', label: 'More', icon: <DotsIcon /> },
  ],
  labor_contractor: [
    { to: '/mukadam/attendance', labelKey: 'nav.attendance', label: 'Attendance', icon: <GridIcon />, end: true },
    { to: '/more', labelKey: 'nav.more', label: 'More', icon: <DotsIcon /> },
  ],
  // Legacy alias — same lane as labor_contractor.
  contractor: [
    { to: '/mukadam/attendance', labelKey: 'nav.today', label: 'Today', icon: <GridIcon />, end: true },
    { to: '/more', labelKey: 'nav.more', label: 'More', icon: <DotsIcon /> },
  ],
}

/**
 * Localized tab set for a role. Production callers use this so the bar honours
 * the active language; the raw ROLE_TABS keep their English default labels for
 * provider-less rendering.
 */
export function useRoleTabs(role: Role): TabDef[] {
  const t = useT()
  return ROLE_TABS[role].map((tab) => ({ ...tab, label: t(tab.labelKey) }))
}

export interface AppShellProps {
  role?: Role
  /** Header context props (sites + selection). Header is hidden if omitted. */
  sites?: SiteSummary[]
  selectedSiteId?: string | null
  onSelectSite?: (id: string | null) => void
  notificationCount?: number
  onNotificationsClick?: () => void
  roleBadge?: { name: string; initials: string }
  /** Optional override for the tab set. */
  tabs?: TabDef[]
  children: ReactNode
}

/**
 * AppShell — the contractor app frame, responsive:
 *  - phone: a context header (SiteSwitcher) + a fixed bottom tab bar (Uber-style).
 *  - desktop (md+): the SAME single nav becomes a left sidebar + a top bar, with
 *    a roomier content canvas — the "console" layout. One `<nav aria-label=
 *    "Primary">` in the DOM (no duplicate links), restyled by breakpoint.
 */
export function AppShell({
  role = 'owner',
  sites,
  selectedSiteId = null,
  onSelectSite,
  notificationCount,
  onNotificationsClick,
  roleBadge,
  tabs,
  children,
}: AppShellProps) {
  const tabSet = tabs ?? ROLE_TABS[role]
  // The header (and thus the bell) only renders with site context; gate the
  // unread poll on that so headerless surfaces never hit the network.
  const showHeader = Boolean(sites && onSelectSite)
  const liveUnread = useUnreadCount({ enabled: showHeader })
  // An explicit `notificationCount` prop (the component gallery) wins; otherwise
  // the live badge drives the bell. `??` keeps a real 0 from falling through.
  const bellCount = notificationCount ?? liveUnread.data ?? 0
  const toggleCommand = useUiStore((s) => s.toggleCommand)
  const cmdKey =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
      ? '⌘'
      : 'Ctrl'

  return (
    <div className="cstk-root flex min-h-screen flex-col bg-bg md:flex-row">
      {/* SINGLE responsive nav: fixed bottom-bar on phone, static left sidebar on desktop. */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:static md:z-auto md:flex md:min-h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-t-0 md:bg-card md:backdrop-blur-none"
      >
        {/* Desktop sidebar header: brand + ⌘K. Hidden on phone. */}
        <div className="hidden md:block">
          <div className="flex items-center gap-2 px-4 pb-2 pt-5">
            <span
              aria-hidden
              className="grid h-7 w-7 place-items-center rounded-control bg-primary font-display text-small font-bold text-on-primary"
            >
              C
            </span>
            <span className="font-display text-h2 font-bold tracking-tight text-text">
              Constructo
            </span>
          </div>
          <button
            type="button"
            onClick={toggleCommand}
            className="mx-3 mt-1 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-control border border-line bg-surface-sunken px-3 py-2 text-left font-body text-small text-text-mute transition-colors hover:text-text"
          >
            <SearchIcon className="text-[1.05em]" />
            <span className="flex-1">Search… </span>
            <kbd className="cstk-mono rounded border border-line px-1.5 py-0.5 text-micro text-text-mute">
              {cmdKey} K
            </kbd>
          </button>
        </div>

        <ul
          className="flex items-stretch justify-around md:flex-col md:gap-1 md:p-3"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {tabSet.map((tab) => (
            <li key={tab.to} className="flex-1 md:flex-none">
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `flex min-h-tap flex-col items-center justify-center gap-0.5 py-2 font-body text-micro font-semibold cstk-animate transition md:flex-row md:justify-start md:gap-3 md:rounded-control md:px-3 md:py-2.5 md:text-small ${
                    isActive
                      ? 'text-primary-deep md:bg-surface-selected md:text-text'
                      : 'text-text-mute hover:text-text md:hover:bg-surface-hover'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`text-xl leading-none md:text-[1.1em] ${
                        isActive ? 'scale-105 md:scale-100' : ''
                      }`}
                      aria-hidden
                    >
                      {tab.icon}
                    </span>
                    <span>{tab.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Content column: SiteSwitcher top bar (once) + roomy canvas. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {showHeader && sites && onSelectSite ? (
          <div className="sticky top-0 z-20">
            <SiteSwitcher
              sites={sites}
              selectedId={selectedSiteId}
              onSelect={onSelectSite}
              notificationCount={bellCount}
              onNotificationsClick={onNotificationsClick}
              notificationsPanel={<NotificationsPanel />}
              role={roleBadge}
            />
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 pb-24 md:max-w-5xl md:px-8 md:py-8 md:pb-10">
          {children}
        </main>
      </div>
    </div>
  )
}
