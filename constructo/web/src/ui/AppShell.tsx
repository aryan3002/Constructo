import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, matchPath, useLocation } from 'react-router-dom'
import { useT, type TranslationKey } from '../i18n'
import { useUiStore } from '../store/ui'
import { navForRole } from './navModel'
import type { Role as CanonicalRole } from '../api/auth'
import {
  BellIcon,
  CameraIcon,
  CheckIcon,
  DocIcon,
  DotsIcon,
  GridIcon,
  ListIcon,
  MessageIcon,
  SearchIcon,
} from './icons'
import { SiteSwitcher, type SiteSummary } from './SiteSwitcher'
import { NotificationsPanel } from '../features/notifications/NotificationsPanel'
import { useUnreadCount } from '../features/notifications/useUnreadCount'
import { useSkin } from './ThemeModeProvider'
import { useOptionalT } from '../i18n'
import { NeevSidebar } from './NeevSidebar'
import { NeevTopBar } from './NeevTopBar'

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
  /** Keep on a phone's short bar (when a role has more tabs than fit). */
  phone?: boolean
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
    { to: '/owner', labelKey: 'nav.latest', label: 'Latest', icon: <GridIcon />, end: true, phone: true },
    { to: '/sites', labelKey: 'nav.projects', label: 'Projects', icon: <ListIcon />, phone: true },
    { to: '/requests', labelKey: 'nav.requests', label: 'Requests', icon: <BellIcon /> },
    { to: '/chat', labelKey: 'nav.chat', label: 'Chat', icon: <MessageIcon />, phone: true },
    { to: '/approvals', labelKey: 'nav.approvals', label: 'Approvals', icon: <CheckIcon />, phone: true },
    { to: '/settings/documents', labelKey: 'nav.documents', label: 'Drawings', icon: <DocIcon /> },
    { to: '/reports', labelKey: 'nav.reports', label: 'Reports', icon: <DocIcon /> },
    { to: '/search', labelKey: 'nav.search', label: 'Search', icon: <SearchIcon /> },
    { to: '/more', labelKey: 'nav.more', label: 'More', icon: <DotsIcon /> },
  ],
  pm: [
    { to: '/pm', labelKey: 'nav.today', label: 'Today', icon: <GridIcon />, end: true },
    { to: '/sites', labelKey: 'nav.sites', label: 'Sites', icon: <ListIcon /> },
    // The spec desk lives in the designer workspace (/spec-desk only redirects
    // there), so link the real route and the tab highlights.
    { to: '/designer?tab=selections', labelKey: 'nav.specs', label: 'Spec desk', icon: <ListIcon /> },
    { to: '/approvals', labelKey: 'nav.approvals', label: 'Approvals', icon: <CheckIcon /> },
    // The PM's daily progress report: review the AI draft, then share it.
    { to: '/dpr', labelKey: 'nav.dpr', label: 'Daily report', icon: <DocIcon /> },
    { to: '/settings/documents', labelKey: 'nav.documents', label: 'Drawings', icon: <DocIcon /> },
    { to: '/reports', labelKey: 'nav.reports', label: 'Reports', icon: <DocIcon /> },
    { to: '/search', labelKey: 'nav.search', label: 'Search', icon: <SearchIcon /> },
    { to: '/more', labelKey: 'nav.more', label: 'More', icon: <DotsIcon /> },
  ],
  // Architect (interior fit-out) — primary cockpit is the /designer workspace (D4).
  architect: [
    { to: '/designer', labelKey: 'nav.designer', label: 'Designer', icon: <ListIcon />, end: true },
    { to: '/sites', labelKey: 'nav.sites', label: 'Sites', icon: <ListIcon /> },
    { to: '/chat', labelKey: 'nav.chat', label: 'Chat', icon: <MessageIcon /> },
    { to: '/settings/documents', labelKey: 'nav.documents', label: 'Drawings', icon: <DocIcon /> },
    { to: '/search', labelKey: 'nav.search', label: 'Search', icon: <SearchIcon /> },
    { to: '/more', labelKey: 'nav.more', label: 'More', icon: <DotsIcon /> },
  ],
  supervisor: [
    { to: '/supervisor/capture', labelKey: 'nav.capture', label: 'Capture', icon: <CameraIcon />, end: true },
    { to: '/sites', labelKey: 'nav.my_sites', label: 'My Sites', icon: <ListIcon /> },
    { to: '/chat', labelKey: 'nav.chat', label: 'Chat', icon: <MessageIcon /> },
    { to: '/settings/documents', labelKey: 'nav.documents', label: 'Drawings', icon: <DocIcon /> },
    { to: '/search', labelKey: 'nav.search', label: 'Search', icon: <SearchIcon /> },
    { to: '/more', labelKey: 'nav.more', label: 'More', icon: <DotsIcon /> },
  ],
  accountant: [
    { to: '/reconcile', labelKey: 'nav.reconcile', label: 'Reconcile', icon: <GridIcon />, end: true },
    { to: '/payments', labelKey: 'nav.bills', label: 'Bills', icon: CashIcon },
    { to: '/reports', labelKey: 'nav.reports', label: 'Reports', icon: <DocIcon /> },
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

/** Phone bars show at most this many tabs; the rest fold into "More". */
const PHONE_TABS = 4

/**
 * Split a role's tabs for a phone: up to {@link PHONE_TABS} in the bar (the
 * ones marked `phone`, else the first), the rest and the More hub in the
 * "More" menu. Five or fewer fit as they are.
 */
export function phoneTabSplit(tabs: TabDef[]): { bar: TabDef[]; overflow: TabDef[] } {
  if (tabs.length <= PHONE_TABS + 1) return { bar: tabs, overflow: [] }
  const candidates = tabs.filter((tab) => tab.to !== '/more')
  const marked = candidates.filter((tab) => tab.phone)
  const bar = (marked.length > 0 ? marked : candidates).slice(0, PHONE_TABS)
  return { bar, overflow: tabs.filter((tab) => !bar.includes(tab)) }
}

/** The phone-only "More" button and its menu of the tabs that didn't fit. */
function PhoneMore({ tabs, label }: { tabs: TabDef[]; label: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  const active = tabs.some((tab) => matchPath({ path: tab.to.split('?')[0], end: !!tab.end }, pathname))

  // Close on navigation, Escape or a tap outside.
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
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
    <div ref={ref} className="relative h-full">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-tap w-full flex-col items-center justify-center gap-0.5 py-2 font-body text-micro font-semibold cstk-animate transition ${
          active || open ? 'text-primary-deep' : 'text-text-mute hover:text-text'
        }`}
      >
        <span className="text-xl leading-none" aria-hidden>
          <DotsIcon />
        </span>
        <span>{label}</span>
      </button>
      {open ? (
        <ul
          role="menu"
          aria-label={label}
          className="absolute bottom-full right-1 mb-2 w-56 overflow-hidden rounded-sheet border border-line bg-card p-1.5 shadow-pop"
        >
          {tabs.map((tab) => (
            <li key={tab.to} role="none">
              <NavLink
                role="menuitem"
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `flex min-h-tap items-center gap-3 rounded-control px-3 font-body text-small font-semibold ${
                    isActive ? 'bg-surface-selected text-text' : 'text-text-mute hover:bg-surface-hover hover:text-text'
                  }`
                }
              >
                <span className="text-[1.1em] leading-none" aria-hidden>
                  {tab.icon}
                </span>
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
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
  const t = useOptionalT()
  // A phone shows a short bar; the other tabs live behind "More".
  const phone = phoneTabSplit(tabSet)
  const moreLabel = tabSet.find((tab) => tab.to === '/more')?.label ?? 'More'
  // Owner "Neev" skin swaps the desktop chrome (sidebar + topbar). Safe outside
  // a provider (returns 'blueprint'), so the many bare-AppShell tests are unaffected.
  const neev = useSkin() === 'neev'
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  // 'contractor' is a legacy alias for 'labor_contractor' in AppShell; navModel
  // uses the canonical api/auth Role which doesn't carry the alias.
  const canonicalRole: CanonicalRole = role === 'contractor' ? 'labor_contractor' : role
  const neevZones = navForRole(canonicalRole)
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
      {/* First focusable thing in the frame: jump past the nav to the page. */}
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-card px-4 py-3 font-body text-small font-semibold text-text shadow-pop focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {t ? t('a11y.skip_to_content') : 'Skip to content'}
      </a>
      {/* Neev (owner) Command Center sidebar — desktop only. */}
      {neev ? (
        <NeevSidebar zones={neevZones} role={canonicalRole} roleBadge={roleBadge} collapsed={sidebarCollapsed} />
      ) : null}

      {/* Primary nav: phone bottom-bar always; Blueprint also uses it as the
          desktop left sidebar. In neev the desktop sidebar is NeevSidebar, so
          this nav is phone-only (md:hidden). */}
      <nav
        aria-label="Primary"
        className={
          neev
            ? 'fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:hidden'
            : 'fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:static md:z-auto md:flex md:min-h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-t-0 md:bg-card md:backdrop-blur-none'
        }
      >
        {/* Desktop sidebar header: brand + ⌘K. Hidden on phone. */}
        <div className="hidden md:block">
          <div className="flex items-center gap-2 px-4 pb-2 pt-5">
            <img src="/neev-logo.svg" alt="Neev" className="h-8" />
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
            <li
              key={tab.to}
              className={phone.bar.includes(tab) ? 'flex-1 md:flex-none' : 'hidden md:block md:flex-none'}
            >
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
          {phone.overflow.length > 0 ? (
            <li className="flex-1 md:hidden">
              <PhoneMore tabs={phone.overflow} label={moreLabel} />
            </li>
          ) : null}
        </ul>
      </nav>

      {/* Content column: SiteSwitcher top bar (once) + roomy canvas. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {showHeader && sites && onSelectSite ? (
          neev ? (
            <>
              <NeevTopBar
                sites={sites}
                selectedSiteId={selectedSiteId}
                onSelectSite={onSelectSite}
                notificationCount={bellCount}
                roleBadge={roleBadge}
              />
              {/* Phone keeps the shared context header (neev has no phone chrome). */}
              <div className="sticky top-0 z-20 md:hidden">
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
            </>
          ) : (
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
          )
        ) : null}

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 pb-24 focus:outline-none md:max-w-5xl md:px-8 md:py-8 md:pb-10"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
