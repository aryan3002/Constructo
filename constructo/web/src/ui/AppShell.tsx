import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useT, type TranslationKey } from '../i18n'
import {
  DotsIcon,
  GridIcon,
  ListIcon,
  SearchIcon,
} from './icons'
import { SiteSwitcher, type SiteSummary } from './SiteSwitcher'

/**
 * Every backend role gets a role-shaped tab bar. Mirrors the six roles the auth
 * surface issues (owner | pm | supervisor | accountant | procurement |
 * labor_contractor). `contractor` is kept as a legacy alias of `labor_contractor`
 * so older callers (and tests) keep working.
 */
export type Role =
  | 'owner'
  | 'pm'
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

const CheckIcon = <span className="text-[1.15em]">✓</span>
const CameraIcon = <span className="text-[1.05em]">📷</span>
const CashIcon = <span className="text-[1.05em]">₹</span>
const BoxIcon = <span className="text-[1.05em]">📦</span>

/**
 * Role-shaped tab bars, one per IA lane (see 07-Design / Information Architecture).
 * The `label` here is the English default so the bar renders correctly even
 * without a LanguageProvider (e.g. in unit tests); `useRoleTabs` localizes them.
 */
export const ROLE_TABS: Record<Role, TabDef[]> = {
  owner: [
    { to: '/', labelKey: 'nav.brief', label: 'Brief', icon: <GridIcon />, end: true },
    { to: '/sites', labelKey: 'nav.sites', label: 'Sites', icon: <ListIcon /> },
    { to: '/approvals', labelKey: 'nav.approvals', label: 'Approvals', icon: CheckIcon },
    { to: '/search', labelKey: 'nav.search', label: 'Search', icon: <SearchIcon /> },
    { to: '/more', labelKey: 'nav.more', label: 'More', icon: <DotsIcon /> },
  ],
  pm: [
    { to: '/', labelKey: 'nav.today', label: 'Today', icon: <GridIcon />, end: true },
    { to: '/sites', labelKey: 'nav.sites', label: 'Sites', icon: <ListIcon /> },
    { to: '/approvals', labelKey: 'nav.approvals', label: 'Approvals', icon: CheckIcon },
    { to: '/search', labelKey: 'nav.search', label: 'Search', icon: <SearchIcon /> },
    { to: '/more', labelKey: 'nav.more', label: 'More', icon: <DotsIcon /> },
  ],
  supervisor: [
    { to: '/supervisor/capture', labelKey: 'nav.capture', label: 'Capture', icon: CameraIcon, end: true },
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
    { to: '/reconcile', labelKey: 'nav.orders', label: 'Orders', icon: BoxIcon, end: true },
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
 * AppShell — the contractor app frame: a context header (SiteSwitcher) on top
 * and a role-shaped bottom tab bar (mobile-first) below, with the routed page
 * content in between. Bottom tabs are the Uber-style decisive navigation.
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

  return (
    <div className="cstk-root flex min-h-screen flex-col bg-bg">
      {sites && onSelectSite ? (
        <div className="sticky top-0 z-30">
          <SiteSwitcher
            sites={sites}
            selectedId={selectedSiteId}
            onSelect={onSelectSite}
            notificationCount={notificationCount}
            onNotificationsClick={onNotificationsClick}
            role={roleBadge}
          />
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 pb-24">
        {children}
      </main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      >
        <ul
          className="mx-auto flex max-w-3xl items-stretch justify-around"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {tabSet.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `flex min-h-tap flex-col items-center justify-center gap-0.5 py-2 font-body text-micro font-semibold cstk-animate transition ${
                    isActive
                      ? 'text-primary-deep'
                      : 'text-text-mute hover:text-text'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`text-xl leading-none ${
                        isActive ? 'scale-105' : ''
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
    </div>
  )
}
