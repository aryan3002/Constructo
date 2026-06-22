import { NavLink } from 'react-router-dom'
import type { TabDef } from './AppShell'
import { SettingsIcon } from './icons'

export interface NeevSidebarProps {
  /** The role's nav set (same TabDef used by the Blueprint shell). */
  tabs: TabDef[]
  /** Role label + initials for the bottom profile card. */
  roleBadge?: { name: string; initials: string }
}

/**
 * NeevSidebar — the owner Command Center's desktop sidebar (neev skin only).
 * Brand block + the role's primary nav + a bottom profile card. Renders the
 * SAME NavLinks/routes as the Blueprint shell, restyled to the prototype's
 * `.nv-side` chrome via semantic tokens (so it also works in neev-dark).
 * Desktop-only (`hidden md:flex`); on phone the shared bottom bar still shows.
 */
export function NeevSidebar({ tabs, roleBadge }: NeevSidebarProps) {
  return (
    <aside className="hidden shrink-0 flex-col gap-1 border-r border-edge bg-surface-sunken px-4 pb-5 pt-5 md:flex md:w-[264px]">
      {/* Brand */}
      <div className="flex items-center gap-3 px-2 pb-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-text-primary">
          <span className="font-display text-lg font-bold text-surface-card">N</span>
        </div>
        <div className="min-w-0">
          <div className="font-display text-h2 font-semibold leading-none text-text-primary">
            Neev
          </div>
          <div className="mt-1 text-micro font-semibold uppercase tracking-[0.14em] text-text-muted">
            Command Center
          </div>
        </div>
      </div>

      <div className="px-3 pb-1.5 pt-1 text-micro font-semibold uppercase tracking-[0.14em] text-text-muted">
        Today
      </div>

      <nav aria-label="Primary" className="flex flex-col gap-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `flex min-h-tap items-center gap-3 rounded-[13px] border px-3 py-2.5 font-body text-small font-semibold cstk-animate transition ${
                isActive
                  ? 'border-edge bg-surface-card text-brand-text shadow-card'
                  : 'border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`
            }
          >
            <span className="text-[1.15em] leading-none" aria-hidden>
              {tab.icon}
            </span>
            <span className="flex-1">{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Who you are */}
      {roleBadge ? (
        <NavLink
          to="/more"
          className="flex items-center gap-3 rounded-control border border-edge bg-surface-card px-3 py-2.5 shadow-card cstk-animate transition hover:bg-surface-hover"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-subtle font-display text-small font-bold text-brand-text">
            {roleBadge.initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-body text-small font-semibold text-text-primary">
              {roleBadge.name}
            </div>
            <div className="text-micro text-text-muted">Profile &amp; settings</div>
          </div>
          <SettingsIcon className="shrink-0 text-text-muted" aria-hidden />
        </NavLink>
      ) : null}
    </aside>
  )
}
