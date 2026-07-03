import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Role } from '../api/auth'
import { useT } from '../i18n'
import { labelKeyFor, type NavIconName, type NavItem, type NavZones } from './navModel'
import {
  GridIcon, CheckIcon, ScaleIcon, CashIcon, CompassIcon, CameraIcon,
  BuildingIcon, MessageIcon, DocIcon, ShieldIcon, ChartBarIcon, SearchIcon,
  UsersIcon, SettingsIcon, BellIcon,
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
  inbox: <BellIcon />,
}

function NavRow({ item, role, collapsed, t }: {
  item: NavItem
  role: Role
  collapsed: boolean
  t: ReturnType<typeof useT>
}) {
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

/**
 * NeevSidebar — the Command Center desktop sidebar (neev skin only).
 * Brand · PRIMARY ▸ SHARED zones (top) · ADMIN zone pinned bottom · profile card.
 * Capability-grouped via navModel; collapses to a 64px icon rail. Desktop-only.
 */
export function NeevSidebar({ zones, role, roleBadge, collapsed }: NeevSidebarProps) {
  const t = useT()

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
        {zones.primary.map((i) => <NavRow key={i.to} item={i} role={role} collapsed={collapsed} t={t} />)}
        {zones.shared.length ? <div data-zone-divider className="my-2 border-t border-edge" /> : null}
        {zones.shared.map((i) => <NavRow key={i.to} item={i} role={role} collapsed={collapsed} t={t} />)}
        <div className="flex-1" />
        {zones.admin.length ? <div data-zone-divider className="my-2 border-t border-edge" /> : null}
        {zones.admin.map((i) => <NavRow key={i.to} item={i} role={role} collapsed={collapsed} t={t} />)}
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
