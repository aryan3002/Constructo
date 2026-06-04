import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BellIcon, ChevronDownIcon } from './icons'
import { StatusDot, type Status } from './StatusPill'
import { Mono, Small } from './Typography'

export interface SiteSummary {
  id: string
  name: string
  /** Worst-risk status across the site, shown as a dot. */
  status: Status
  /** Optional one-line meta, e.g. "12 open · 3 risks". */
  meta?: string
}

export interface SiteSwitcherProps {
  sites: SiteSummary[]
  /** Currently selected site id, or null for the "All Sites" aggregate. */
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Unread notification count (0 hides the badge). */
  notificationCount?: number
  /**
   * Fallback bell handler used only when no `notificationsPanel` is supplied
   * (e.g. the static component gallery). Once a panel is present the bell toggles
   * the popover instead and this is ignored.
   */
  onNotificationsClick?: () => void
  /**
   * Content for the bell's dropdown (W3.3). When provided, clicking the bell
   * opens an anchored popover rendering this node — the shell injects the live
   * `<NotificationsPanel/>` here so the bell markup stays in one place.
   */
  notificationsPanel?: ReactNode
  /** Role label + initials for the avatar, e.g. { name: "Owner", initials: "RK" }. */
  role?: { name: string; initials: string }
  className?: string
}

/**
 * SiteSwitcher — the persistent context header. Shows the active site (or
 * "All Sites (n)") with a chevron that opens a switcher sheet listing every
 * site and its worst-risk status dot, plus a notification bell and role avatar.
 */
export function SiteSwitcher({
  sites,
  selectedId,
  onSelect,
  notificationCount = 0,
  onNotificationsClick,
  notificationsPanel,
  role,
  className,
}: SiteSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const selected = sites.find((s) => s.id === selectedId) ?? null

  // Close the site sheet on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Close the notifications popover on Escape or an outside click.
  useEffect(() => {
    if (!notifOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNotifOpen(false)
    const onDown = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node))
        setNotifOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [notifOpen])

  function onBellClick() {
    if (notificationsPanel) setNotifOpen((v) => !v)
    else onNotificationsClick?.()
  }

  function pick(id: string | null) {
    onSelect(id)
    setOpen(false)
  }

  return (
    <header
      className={`flex items-center gap-2 border-b border-line bg-card px-4 py-2.5 ${className ?? ''}`.trim()}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-tap min-w-0 flex-1 items-center gap-2 rounded-control px-2 -mx-2 cstk-animate transition hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {selected ? (
          <StatusDot status={selected.status} />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full bg-text-mute ring-2 ring-card" aria-hidden />
        )}
        <span className="truncate font-display text-h2 font-semibold text-text">
          {selected ? selected.name : `All Sites (${sites.length})`}
        </span>
        <span className="text-[1.1em] leading-none text-text-mute" aria-hidden>
          <ChevronDownIcon />
        </span>
      </button>

      <div ref={notifRef} className="relative">
        <button
          type="button"
          onClick={onBellClick}
          aria-haspopup={notificationsPanel ? 'dialog' : undefined}
          aria-expanded={notificationsPanel ? notifOpen : undefined}
          aria-label={
            notificationCount > 0
              ? `Notifications, ${notificationCount} unread`
              : 'Notifications'
          }
          className="relative grid min-h-tap min-w-tap place-items-center rounded-control text-xl text-text cstk-animate transition hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <BellIcon />
          {notificationCount > 0 ? (
            <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-risk px-1 font-mono text-[10px] font-bold leading-none text-white">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          ) : null}
        </button>

        {notificationsPanel && notifOpen ? (
          <div
            role="dialog"
            aria-label="Notifications"
            className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] animate-reveal-down overflow-hidden rounded-sheet border border-line bg-card shadow-sheet"
          >
            {notificationsPanel}
          </div>
        ) : null}
      </div>

      {role ? (
        <span
          aria-label={`Role: ${role.name}`}
          title={role.name}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink font-display text-small font-bold text-paper-2"
        >
          {role.initials}
        </span>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Switch site"
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 max-h-[80vh] w-full max-w-md animate-reveal-down overflow-auto rounded-t-sheet bg-card p-2 shadow-sheet sm:rounded-sheet">
            <div className="px-3 py-2">
              <Small className="font-semibold uppercase tracking-wide text-text-mute">
                Switch site
              </Small>
            </div>
            <ul className="pb-2">
              <li>
                <button
                  type="button"
                  onClick={() => pick(null)}
                  aria-current={selectedId === null}
                  className={`flex min-h-tap w-full items-center gap-3 rounded-control px-3 text-left cstk-animate transition hover:bg-paper ${
                    selectedId === null ? 'bg-paper' : ''
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-text-mute" aria-hidden />
                  <span className="flex-1 font-body font-semibold text-text">
                    All Sites
                  </span>
                  <Mono className="text-micro text-text-mute">{sites.length}</Mono>
                </button>
              </li>
              {sites.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => pick(s.id)}
                    aria-current={s.id === selectedId}
                    className={`flex min-h-tap w-full items-center gap-3 rounded-control px-3 text-left cstk-animate transition hover:bg-paper ${
                      s.id === selectedId ? 'bg-paper' : ''
                    }`}
                  >
                    <StatusDot status={s.status} />
                    <span className="flex-1 truncate font-body font-semibold text-text">
                      {s.name}
                    </span>
                    {s.meta ? (
                      <Mono className="text-micro text-text-mute">{s.meta}</Mono>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </header>
  )
}
