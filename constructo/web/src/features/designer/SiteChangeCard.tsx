/**
 * SiteChangeCard — a single entry in the site changes feed.
 *
 * Shows: title · room · truncated note · photo thumbnail (if photo_url) ·
 * reported_by · status StatusPill.
 *
 * Clicking anywhere on the card opens the detail Drawer.
 * 48px minimum tap target (min-h-tap from the Blueprint system).
 */

import type { SiteChange } from '../../api/siteChanges'
import { StatusPill } from '../../ui/StatusPill'
import { useT } from '../../i18n'
import type { Status } from '../../ui/StatusPill'

/** Map site change status to the Blueprint status spine. */
export function changeStatusToSpine(status: SiteChange['status']): Status {
  switch (status) {
    case 'new':
      return 'warn'
    case 'linked':
      return 'info'
    case 'resolved':
      return 'ok'
  }
}

interface SiteChangeCardProps {
  change: SiteChange
  onClick: () => void
}

export function SiteChangeCard({ change, onClick }: SiteChangeCardProps) {
  const t = useT()

  const pillLabel =
    change.status === 'new'
      ? t('sitechanges.badge.new')
      : change.status === 'linked'
        ? t('sitechanges.badge.linked')
        : t('sitechanges.badge.resolved')

  const isResolvedUrl =
    change.photo_url !== null &&
    (change.photo_url.startsWith('http://') || change.photo_url.startsWith('https://'))

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`sc-card-${change.id}`}
      className={[
        'group w-full text-left rounded-card border border-line bg-card',
        'px-4 py-4 min-h-tap transition-shadow',
        'hover:shadow-card hover:border-primary/30',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        'cstk-animate',
      ].join(' ')}
    >
      {/* Row 1: title + status pill */}
      <div className="flex items-start gap-2">
        <p className="flex-1 font-display text-body font-semibold text-text leading-snug">
          {change.title}
        </p>
        <StatusPill
          status={changeStatusToSpine(change.status)}
          label={pillLabel}
          size="sm"
        />
      </div>

      {/* Row 2: room tag (if present) */}
      {change.room && (
        <p className="mt-1 font-body text-micro text-text-mute font-semibold uppercase tracking-wide">
          {change.room}
        </p>
      )}

      {/* Row 3: truncated note */}
      <p className="mt-2 font-body text-small text-text-mute line-clamp-2 leading-relaxed">
        {change.note}
      </p>

      {/* Row 4: photo thumbnail + reporter */}
      <div className="mt-3 flex items-center gap-3">
        {change.photo_url && (
          isResolvedUrl ? (
            <img
              src={change.photo_url}
              alt="Site photo"
              className="h-10 w-10 rounded-control object-cover border border-line shrink-0"
            />
          ) : (
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-line bg-paper text-text-mute">
              {/* Camera icon placeholder for bare R2 key */}
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </span>
          )
        )}

        {/* Always render reporter — use resolved name, fall back to localized label (never UUID). */}
        <p className="font-body text-micro text-text-mute">
          {t('sitechanges.card.reported_by', {
            name: change.reported_by_name ?? t('sitechanges.reported_by_unknown'),
          })}
        </p>
      </div>
    </button>
  )
}
