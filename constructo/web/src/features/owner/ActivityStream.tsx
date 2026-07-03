// ActivityStream — the primary surface of the activity-first OwnerHome. An
// infinite, keyset-paged list of the union feed (GET /activity). Each row is a
// severity-tinted status dot + kind icon, the title, `site · relative-time`, and
// a trailing chevron; the whole row deep-links via linkFor(item.link). Four
// states (loading / empty / error+retry / populated) + an optional per-project
// filter fed by `selectedSiteId`. Non-blocking by design (OwnerHome still shows
// hero + needs-you if this errors).
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  activityApi,
  type ActivityItem,
  type ActivityLink,
  type ActivityPage,
  type ActivitySeverity,
} from '../../api/activity'
import { qk } from '../../api/queryKeys'
import { useT, type TFunction } from '../../i18n'
import { ErrorState, Spinner, EmptyState } from '../../components/states'
import { Body, Mono, Small, StatusDot, type Status } from '../../ui'
import {
  PhotoIcon,
  MessageIcon,
  CheckCircleIcon,
  WarnTriangleIcon,
  InfoSquareIcon,
} from '../../ui/icons'
import type { ReactNode } from 'react'

/** Deep-link an activity row to a live web route (single source of truth). */
export function linkFor(link: ActivityLink): string {
  switch (link.type) {
    case 'feed_photo':
      return '/chat' // TODO(nav): no /feed/photo web route yet — retarget when it lands
    case 'update':
    case 'milestone':
      return `/sites/${link.id}` // project-timeline surrogate = site detail
    case 'request':
      return '/chat' // TODO(nav): dedicated /requests surface lands in a later slice (E3)
    case 'decision':
      return '/approvals' // TODO(nav): no /decision/:id route yet
    case 'finding':
      return `/health/${link.id}`
    default:
      return '/owner'
  }
}

const SEVERITY_STATUS: Record<ActivitySeverity, Status> = {
  success: 'ok',
  warning: 'warn',
  info: 'info',
}

/** Kind-specific glyph; falls back to the severity icon. */
function iconFor(item: ActivityItem): (p: { title?: string }) => ReactNode {
  if (item.kind === 'photo_shared') return PhotoIcon
  if (item.kind === 'homeowner_request') return MessageIcon
  switch (item.severity) {
    case 'success':
      return CheckCircleIcon
    case 'warning':
      return WarnTriangleIcon
    default:
      return InfoSquareIcon
  }
}

/** Compact "2h ago" / "just now" relative time. */
function relativeTime(iso: string, t: TFunction): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.round((Date.now() - then) / 1000)
  if (secs < 60) return t('activity.rel.just_now')
  const mins = Math.round(secs / 60)
  if (mins < 60) return t('activity.rel.mins_ago', { n: mins })
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return t('activity.rel.hrs_ago', { n: hrs })
  const days = Math.round(hrs / 24)
  return t('activity.rel.days_ago', { n: days })
}

export function ActivityStream({
  selectedSiteId,
  onReply,
}: {
  selectedSiteId: string | null
  onReply?: (item: ActivityItem) => void
}) {
  const t = useT()
  const query = useInfiniteQuery<ActivityPage, Error>({
    queryKey: qk.activity(selectedSiteId ?? undefined),
    queryFn: ({ pageParam }) =>
      activityApi.page({
        siteId: selectedSiteId ?? undefined,
        cursor: (pageParam as string | undefined) ?? undefined,
        limit: 20,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })

  const items = query.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <section aria-labelledby="owner-activity-heading" className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-2">
        <h2 id="owner-activity-heading" className="font-display text-h2 font-semibold text-text">
          {t('activity.title')}
        </h2>
      </header>

      {query.isLoading ? (
        <Spinner label={t('activity.loading')} />
      ) : query.isError ? (
        <ErrorState message={t('activity.error')} onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={t('activity.empty.title')} hint={t('activity.empty.hint')} />
      ) : (
        <>
          <ol className="overflow-hidden rounded-card border border-line bg-card shadow-card">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 border-b border-line px-3 py-3 last:border-b-0"
              >
                <Link
                  to={linkFor(item.link)}
                  className="flex min-w-0 flex-1 items-start gap-3 cstk-animate transition hover:bg-line/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <StatusDot status={SEVERITY_STATUS[item.severity]} />
                    <span className="text-text-mute" aria-hidden>
                      {(() => {
                        const Icon = iconFor(item)
                        return <Icon title={item.kind} />
                      })()}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <Body className="truncate font-semibold text-text">{item.title}</Body>
                    {item.subtitle ? (
                      <Small className="block truncate !text-text-mute">{item.subtitle}</Small>
                    ) : null}
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-body text-micro text-text-mute">
                      <span className="truncate">{item.site_name}</span>
                      <Mono className="text-micro text-text-mute">
                        {relativeTime(item.occurred_at, t)}
                      </Mono>
                      {item.actor ? <span className="truncate">· {item.actor}</span> : null}
                    </p>
                  </div>
                  {item.link.type === 'request' && onReply ? null : (
                    <span className="ml-2 mt-1 text-text-mute" aria-hidden>
                      ›
                    </span>
                  )}
                </Link>
                {item.link.type === 'request' && onReply ? (
                  <button
                    type="button"
                    onClick={() => onReply(item)}
                    className="ml-2 inline-flex min-h-tap shrink-0 items-center rounded-pill border border-brand/50 bg-card px-3 font-body text-small font-semibold text-brand-text cstk-animate transition hover:bg-brand/10"
                  >
                    {t('activity.reply')}
                  </button>
                ) : null}
              </li>
            ))}
          </ol>

          {query.hasNextPage ? (
            <button
              type="button"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="mx-auto inline-flex min-h-tap items-center justify-center rounded-control border border-line bg-card px-4 font-body text-small font-semibold text-text cstk-animate transition hover:bg-line/30 disabled:opacity-60"
            >
              {query.isFetchingNextPage ? t('activity.loading_more') : t('activity.load_more')}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}
