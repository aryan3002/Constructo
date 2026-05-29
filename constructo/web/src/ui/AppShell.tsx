import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import {
  DotsIcon,
  GridIcon,
  ListIcon,
  SearchIcon,
} from './icons'
import { SiteSwitcher, type SiteSummary } from './SiteSwitcher'

export type Role = 'owner' | 'pm' | 'supervisor' | 'contractor'

export interface TabDef {
  to: string
  label: string
  icon: ReactNode
  /** Match the route exactly (for the index tab). */
  end?: boolean
}

/**
 * Role-shaped tab bars. Owner gets the full command set; other roles are
 * stubbed for now (they reuse owner-ish tabs but can diverge later).
 */
export const ROLE_TABS: Record<Role, TabDef[]> = {
  owner: [
    { to: '/', label: 'Brief', icon: <GridIcon />, end: true },
    { to: '/sites', label: 'Sites', icon: <ListIcon /> },
    { to: '/approvals', label: 'Approvals', icon: <span className="text-[1.15em]">✓</span> },
    { to: '/search', label: 'Search', icon: <SearchIcon /> },
    { to: '/more', label: 'More', icon: <DotsIcon /> },
  ],
  pm: [
    { to: '/', label: 'Today', icon: <GridIcon />, end: true },
    { to: '/sites', label: 'Sites', icon: <ListIcon /> },
    { to: '/search', label: 'Search', icon: <SearchIcon /> },
    { to: '/more', label: 'More', icon: <DotsIcon /> },
  ],
  supervisor: [
    { to: '/', label: 'Today', icon: <GridIcon />, end: true },
    { to: '/sites', label: 'My Site', icon: <ListIcon /> },
    { to: '/more', label: 'More', icon: <DotsIcon /> },
  ],
  contractor: [
    { to: '/', label: 'Today', icon: <GridIcon />, end: true },
    { to: '/more', label: 'More', icon: <DotsIcon /> },
  ],
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
