// NotificationsPanel (W3.3) — the bell's dropdown. The list the live badge
// counts down: severity-dotted rows, newest-first, each one tap from "read".
// Reading a row is optimistic (handled in `useUnreadCount`), so the badge ticks
// down the instant it's tapped. Supporting context only — it never gates a
// decision (that's the Approval Inbox), so its error state stays quiet.
import { useT } from '../../i18n'
// Import the leaf ui modules directly (not the `../../ui` barrel) — the barrel
// re-exports AppShell, which mounts this panel, so going through it would form an
// import cycle.
import { Mono, Small } from '../../ui/Typography'
import { StatusDot, type Status } from '../../ui/StatusPill'
import { Spinner } from '../../components/states'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from './useUnreadCount'

/** Notification severities are already status-shaped; fall back to a neutral dot. */
function severityDot(severity: string): Status {
  return severity === 'risk' || severity === 'warn' || severity === 'info'
    ? severity
    : 'info'
}

/** Compact "2h ago" / "just now" relative time (no chart, no heavy dep). */
function relativeTime(iso: string, t: ReturnType<typeof useT>): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.round((Date.now() - then) / 1000)
  if (secs < 60) return t('notifications.just_now')
  const mins = Math.round(secs / 60)
  if (mins < 60) return t('notifications.mins_ago', { n: mins })
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return t('notifications.hrs_ago', { n: hrs })
  const days = Math.round(hrs / 24)
  return t('notifications.days_ago', { n: days })
}

export interface NotificationsPanelProps {
  /** Close the popover (e.g. after the user clears the list). */
  onClose?: () => void
}

/**
 * The notifications list rendered inside the bell popover. Self-contained: it
 * owns its feed query + the read mutations, so the shell only has to mount it.
 */
export function NotificationsPanel({ onClose }: NotificationsPanelProps) {
  const t = useT()
  const { data, isLoading, isError } = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()

  const items = data ?? []
  const unreadIds = items.filter((n) => n.read_at === null).map((n) => n.id)
  const unread = unreadIds.length

  return (
    <div className="flex max-h-[70vh] w-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <h2 className="font-display text-h2 font-semibold text-text">
          {t('notifications.title')}
        </h2>
        {unread > 0 ? (
          <button
            type="button"
            onClick={() => markAll.mutate(unreadIds)}
            disabled={markAll.isPending}
            className="rounded-control px-2 py-1 font-body text-small font-semibold text-primary-deep cstk-animate transition hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            {t('notifications.mark_all_read')}
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4">
            <Spinner label={t('notifications.loading')} />
          </div>
        ) : isError ? (
          // Non-blocking: notifications are context, never a gate.
          <p className="px-3 py-6 text-center font-body text-small text-text-mute">
            {t('notifications.error')}
          </p>
        ) : items.length === 0 ? (
          <p className="px-3 py-8 text-center font-body text-small text-text-mute">
            {t('notifications.empty')}
          </p>
        ) : (
          <ul>
            {items.map((n) => {
              const isUnread = n.read_at === null
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => isUnread && markRead.mutate(n.id)}
                    aria-label={
                      isUnread ? `${n.title} — ${t('notifications.mark_read')}` : n.title
                    }
                    className={`flex w-full items-start gap-3 border-b border-line px-3 py-2.5 text-left last:border-b-0 cstk-animate transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      isUnread ? 'bg-card hover:bg-paper' : 'bg-card opacity-65'
                    }`}
                  >
                    <span className="mt-1">
                      <StatusDot status={severityDot(n.severity)} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate font-body text-small text-text ${
                          isUnread ? 'font-semibold' : 'font-normal'
                        }`}
                      >
                        {n.title}
                      </p>
                      {n.body ? (
                        <p className="mt-0.5 line-clamp-2 font-body text-micro text-text-mute">
                          {n.body}
                        </p>
                      ) : null}
                      <Mono className="mt-0.5 block text-micro text-text-mute">
                        {relativeTime(n.created_at, t)}
                      </Mono>
                    </div>
                    {isUnread ? (
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {onClose ? (
        <footer className="border-t border-line px-3 py-2">
          <Small className="!text-text-mute">
            {unread > 0 ? t('notifications.unread', { count: unread }) : ' '}
          </Small>
        </footer>
      ) : null}
    </div>
  )
}
