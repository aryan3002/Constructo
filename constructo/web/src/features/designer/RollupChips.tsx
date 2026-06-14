/**
 * RollupChips — the summary bar at the top of the Selections cockpit.
 *
 * Deterministic, computed from live DeskOut data. Mono numerals for all
 * money/counts; plain-language status chips for actionable categories.
 * No fake numbers — if the data lacks something it's omitted honestly.
 */
import { Mono, Small, StatusPill } from '../../ui'
import type { DeskOut } from '../../api/specs'
import { useT } from '../../i18n'
import { formatRupees } from '../../lib/money'

/** Null-safe ₹ formatter: em-dash for missing/non-finite values. */
function inr(value: string | null | undefined): string {
  if (value == null) return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return formatRupees(n)
}

export function RollupChips({ desk }: { desk: DeskOut }) {
  const t = useT()

  // Flatten all lines for summary computation
  const allLines = desk.rooms.flatMap((r) => r.lines)

  const awaitingOwner = allLines.filter(
    (l) => l.routing_status === 'out_for_approval',
  ).length

  const readyToRelease = allLines.filter(
    (l) => l.routing_status === 'approved',
  ).length

  const unpriced = allLines.filter((l) => l.unit_rate == null).length

  return (
    <div
      role="status"
      aria-label={t('selections.chip.grand_total')}
      className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-card px-4 py-3"
    >
      {/* Grand total — the anchor number */}
      <div className="flex items-center gap-2">
        <Small className="font-semibold !text-text">{t('selections.chip.grand_total')}</Small>
        <Mono className="text-h2 font-semibold text-text">{inr(desk.grand_total)}</Mono>
      </div>

      {/* Divider */}
      <span className="h-5 w-px bg-line" aria-hidden="true" />

      {/* Awaiting owner — action required by owner */}
      {awaitingOwner > 0 && (
        <StatusPill
          status="warn"
          label={t('selections.chip.awaiting_owner', { n: awaitingOwner })}
          size="sm"
        />
      )}

      {/* Ready to release — approved, designer can release */}
      {readyToRelease > 0 && (
        <StatusPill
          status="ok"
          label={t('selections.chip.ready_release', { n: readyToRelease })}
          size="sm"
        />
      )}

      {/* Unpriced lines — honest visibility */}
      {unpriced > 0 && (
        <StatusPill
          status="info"
          label={t('selections.chip.unpriced', { n: unpriced })}
          size="sm"
        />
      )}

      {/* All priced and no pending actions — calm affirmation */}
      {unpriced === 0 && awaitingOwner === 0 && readyToRelease === 0 && (
        <StatusPill status="ok" label={t('specdesk.all_priced')} size="sm" />
      )}
    </div>
  )
}
