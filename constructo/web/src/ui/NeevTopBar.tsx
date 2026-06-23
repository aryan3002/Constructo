import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../store/ui'
import { useT } from '../i18n'
import { NotificationsPanel } from '../features/notifications/NotificationsPanel'
import { BellIcon, ChevronDownIcon, SearchIcon, PanelLeftIcon } from './icons'
import { StatusDot } from './StatusPill'
import { AvatarMenu } from './AvatarMenu'
import { ThemeControl } from './ThemeControl'
import type { SiteSummary } from './SiteSwitcher'

export interface NeevTopBarProps {
  sites: SiteSummary[]
  selectedSiteId: string | null
  onSelectSite: (id: string | null) => void
  notificationCount?: number
  roleBadge?: { name: string; initials: string }
}

/**
 * NeevTopBar — the owner Command Center's desktop top bar (neev skin only).
 * "Viewing · {scope}" scope button (switches the active site), a search pill
 * that opens ⌘K, the live notifications bell, and the role avatar. Styled to
 * the prototype's `.nv-topbar` via semantic tokens (works in neev-dark too).
 * Desktop-only; the shared phone header still serves small screens.
 */
export function NeevTopBar({
  sites,
  selectedSiteId,
  onSelectSite,
  notificationCount = 0,
  roleBadge,
}: NeevTopBarProps) {
  const t = useT()
  const [scopeOpen, setScopeOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const scopeRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const toggleCommand = useUiStore((s) => s.toggleCommand)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const selected = sites.find((s) => s.id === selectedSiteId) ?? null
  const scopeLabel = selected ? selected.name : `All sites (${sites.length})`

  // ⌘\ global shortcut to collapse/expand sidebar (ignore when typing).
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

  // Close popovers on Escape / outside click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setScopeOpen(false)
        setNotifOpen(false)
      }
    }
    const onDown = (e: MouseEvent) => {
      if (scopeRef.current && !scopeRef.current.contains(e.target as Node)) setScopeOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [])

  function pick(id: string | null) {
    onSelectSite(id)
    setScopeOpen(false)
  }

  return (
    <header className="sticky top-0 z-30 hidden items-center gap-3.5 border-b border-edge bg-surface/80 px-8 py-3 backdrop-blur md:flex">
      {/* Collapse toggle */}
      <button
        type="button"
        onClick={toggleSidebar}
        aria-pressed={sidebarCollapsed}
        aria-label={sidebarCollapsed ? t('shell.expand_sidebar') : t('shell.collapse_sidebar')}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-control text-text-primary cstk-animate transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <PanelLeftIcon />
      </button>

      {/* Scope button */}
      <div ref={scopeRef} className="relative">
        <button
          type="button"
          onClick={() => setScopeOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={scopeOpen}
          className="flex items-center gap-3 rounded-control border border-strong bg-surface-card py-1.5 pl-2 pr-3 cstk-animate transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-text-primary font-display text-small font-bold text-surface-card">
            N
          </span>
          <span className="text-left">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Viewing
            </span>
            <span className="block whitespace-nowrap font-body text-small font-semibold text-text-primary">
              {scopeLabel}
            </span>
          </span>
          <ChevronDownIcon className="text-text-muted" aria-hidden />
        </button>

        {scopeOpen ? (
          <div
            role="menu"
            aria-label="Switch site"
            className="absolute left-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] animate-reveal-down overflow-hidden rounded-sheet border border-edge bg-surface-overlay p-2 shadow-pop"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => pick(null)}
              aria-current={selectedSiteId === null}
              className={`flex min-h-tap w-full items-center gap-3 rounded-control px-3 text-left cstk-animate transition hover:bg-surface-hover ${
                selectedSiteId === null ? 'bg-surface-hover' : ''
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-text-muted" aria-hidden />
              <span className="flex-1 font-body text-small font-semibold text-text-primary">All sites</span>
              <span className="cstk-mono text-micro text-text-muted">{sites.length}</span>
            </button>
            {sites.map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitem"
                onClick={() => pick(s.id)}
                aria-current={s.id === selectedSiteId}
                className={`flex min-h-tap w-full items-center gap-3 rounded-control px-3 text-left cstk-animate transition hover:bg-surface-hover ${
                  s.id === selectedSiteId ? 'bg-surface-hover' : ''
                }`}
              >
                <StatusDot status={s.status} />
                <span className="flex-1 truncate font-body text-small font-semibold text-text-primary">
                  {s.name}
                </span>
                {s.meta ? <span className="cstk-mono text-micro text-text-muted">{s.meta}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Search pill (opens ⌘K) */}
      <button
        type="button"
        onClick={toggleCommand}
        className="ml-auto flex h-[42px] min-w-0 max-w-md flex-1 items-center gap-2.5 rounded-pill border border-strong bg-surface-card px-3.5 text-left text-text-muted cstk-animate transition hover:border-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <SearchIcon aria-hidden />
        <span className="flex-1 truncate font-body text-small">Search sites, specs, decisions…</span>
      </button>

      {/* Bell */}
      <div ref={notifRef} className="relative">
        <button
          type="button"
          onClick={() => setNotifOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={notifOpen}
          aria-label={notificationCount > 0 ? `Notifications, ${notificationCount} unread` : 'Notifications'}
          className="relative grid h-10 w-10 place-items-center rounded-control text-text-primary cstk-animate transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <BellIcon />
          {notificationCount > 0 ? (
            <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-risk px-1 font-mono text-[10px] font-bold leading-none text-white">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          ) : null}
        </button>
        {notifOpen ? (
          <div
            role="dialog"
            aria-label="Notifications"
            className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] animate-reveal-down overflow-hidden rounded-sheet border border-edge bg-surface-overlay shadow-sheet"
          >
            <NotificationsPanel />
          </div>
        ) : null}
      </div>

      {/* Theme control + Avatar */}
      <ThemeControl />
      {roleBadge ? <AvatarMenu roleBadge={roleBadge} /> : null}
    </header>
  )
}
