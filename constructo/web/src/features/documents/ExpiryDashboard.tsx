/**
 * ExpiryDashboard — D6b headline upgrade.
 *
 * A compact summary strip rendered at the top of DocumentsTab.
 * Computes expired / expiring-≤30-days counts from the loaded document set
 * (deterministic: caller passes `today` as a stable Date so pills are
 * consistent for the lifetime of the render).
 *
 * Clicking an "expired" or "expiring" pill TOGGLES a filter on the parent list.
 * Clicking again clears the filter.
 * Zero/zero → calm "All documents current" affirmation.
 */

import type { CompanyDocument } from '../../api/documents'
import { useT } from '../../i18n'
import { StatusPill } from '../../ui'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysBetween(fromIso: string, today: Date): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromIso)
  if (!m) return NaN
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((target.getTime() - start.getTime()) / 86_400_000)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExpiryFilter = 'expired' | 'expiring' | null

export interface ExpiryDashboardProps {
  docs: CompanyDocument[]
  today: Date
  activeFilter: ExpiryFilter
  onFilterChange: (f: ExpiryFilter) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExpiryDashboard({
  docs,
  today,
  activeFilter,
  onFilterChange,
}: ExpiryDashboardProps) {
  const t = useT()

  // Count expired and expiring (≤30 days) from the full unfiltered doc list.
  let expiredCount = 0
  let expiringCount = 0
  for (const doc of docs) {
    if (!doc.expiry_on) continue
    const d = daysBetween(doc.expiry_on, today)
    if (Number.isNaN(d)) continue
    if (d < 0) {
      expiredCount++
    } else if (d <= 30) {
      expiringCount++
    }
  }

  const allCurrent = expiredCount === 0 && expiringCount === 0

  function toggle(f: ExpiryFilter) {
    onFilterChange(activeFilter === f ? null : f)
  }

  if (allCurrent) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-card border border-ok/20 bg-ok/5 px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-ok" aria-hidden />
        <span className="font-body text-small font-semibold text-ok">
          {t('documents.dashboard.all_current')}
        </span>
      </div>
    )
  }

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-line bg-card px-4 py-2.5"
      role="group"
      aria-label="Document expiry summary"
    >
      {expiredCount > 0 && (
        <button
          type="button"
          aria-pressed={activeFilter === 'expired'}
          onClick={() => toggle('expired')}
          className={[
            'inline-flex min-h-tap items-center rounded-pill border px-3 py-0.5 font-body text-small font-semibold transition cstk-animate',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            activeFilter === 'expired'
              ? 'border-risk/50 bg-risk/20 text-risk'
              : 'border-risk/30 bg-risk/10 text-risk hover:bg-risk/20',
          ].join(' ')}
        >
          {t('documents.dashboard.expired', { n: expiredCount })}
        </button>
      )}
      {expiringCount > 0 && (
        <button
          type="button"
          aria-pressed={activeFilter === 'expiring'}
          onClick={() => toggle('expiring')}
          className={[
            'inline-flex min-h-tap items-center rounded-pill border px-3 py-0.5 font-body text-small font-semibold transition cstk-animate',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            activeFilter === 'expiring'
              ? 'border-warn/50 bg-warn/20 text-warn'
              : 'border-warn/30 bg-warn/10 text-warn hover:bg-warn/20',
          ].join(' ')}
        >
          {t('documents.dashboard.expiring', { n: expiringCount })}
        </button>
      )}
      {/* If one of the filters is active, show a clear affordance */}
      {activeFilter !== null && (
        <button
          type="button"
          onClick={() => onFilterChange(null)}
          className="inline-flex min-h-tap items-center rounded-pill border border-line bg-paper px-3 py-0.5 font-body text-small text-text-mute transition cstk-animate hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Clear filter
        </button>
      )}
      {/* Passive "tracked" indicator (count of all docs with an expiry date) */}
      {docs.filter((d) => d.expiry_on).length > 0 && activeFilter === null && (
        <StatusPill
          status="info"
          label={`${docs.filter((d) => d.expiry_on).length} tracked`}
          size="sm"
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helper for filtering docs by active expiry filter (exported for reuse)
// ---------------------------------------------------------------------------

export function filterByExpiry(
  docs: CompanyDocument[],
  filter: ExpiryFilter,
  today: Date,
): CompanyDocument[] {
  if (!filter) return docs
  return docs.filter((doc) => {
    if (!doc.expiry_on) return false
    const d = daysBetween(doc.expiry_on, today)
    if (Number.isNaN(d)) return false
    if (filter === 'expired') return d < 0
    if (filter === 'expiring') return d >= 0 && d <= 30
    return true
  })
}
