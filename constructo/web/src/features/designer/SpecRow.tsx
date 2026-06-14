/**
 * SpecRow — a single row in the room-grouped material selections list.
 *
 * Keyboard accessible: rendered as a <tr> with role="button" on the row so
 * the parent can handle click+keyboard open. Highlighted when selected.
 *
 * Shows: element / material identity / qty·unit / rate / line_total / lifecycle pill.
 */
import { Mono, Small, StatusPill } from '../../ui'
import type { DeskLine, RoutingStatus } from '../../api/specs'
import type { Status } from '../../ui'
import { useT } from '../../i18n'
import type { TFunction } from '../../i18n'
import { formatRupees } from '../../lib/money'

/** Null-safe ₹ formatter: em-dash for missing/non-finite values. */
function inr(value: string | null | undefined): string {
  if (value == null) return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return formatRupees(n)
}

const ROUTING_STATUS_PILL: Record<RoutingStatus, { status: Status; labelKey: 'selections.status.draft' | 'selections.status.out_for_approval' | 'selections.status.approved' | 'selections.status.released' | 'selections.status.returned' }> = {
  draft: { status: 'info', labelKey: 'selections.status.draft' },
  out_for_approval: { status: 'warn', labelKey: 'selections.status.out_for_approval' },
  approved: { status: 'ok', labelKey: 'selections.status.approved' },
  released: { status: 'ok', labelKey: 'selections.status.released' },
  returned: { status: 'risk', labelKey: 'selections.status.returned' },
}

function materialLabel(line: DeskLine): string {
  const primary = [line.brand, line.colour].filter(Boolean).join(' · ')
  return primary || line.category || '—'
}

function materialSub(line: DeskLine): string | null {
  return [line.sku, line.finish].filter(Boolean).join(' · ') || null
}

interface SpecRowProps {
  line: DeskLine
  selected: boolean
  onClick: () => void
}

export function SpecRow({ line, selected, onClick }: SpecRowProps) {
  const t: TFunction = useT()
  const pill = ROUTING_STATUS_PILL[line.routing_status]

  return (
    <tr
      data-spec-id={line.id}
      data-testid={`spec-row-${line.id}`}
      aria-selected={selected}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      tabIndex={0}
      role="row"
      className={[
        'border-b border-line last:border-0',
        'cursor-pointer cstk-animate',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
        selected
          ? 'bg-primary/5 hover:bg-primary/10'
          : 'hover:bg-surface-hover',
      ].join(' ')}
    >
      {/* Element + location */}
      <td className="px-4 py-2.5 align-top">
        <div className="font-body text-small font-semibold text-text">{line.element}</div>
        {line.location && (
          <Small className="text-micro !text-text-mute">{line.location}</Small>
        )}
      </td>

      {/* Material: brand · colour / sku · finish */}
      <td className="px-4 py-2.5 align-top">
        <div className="font-body text-small text-text">{materialLabel(line)}</div>
        {materialSub(line) && (
          <Small className="text-micro !text-text-mute">{materialSub(line)}</Small>
        )}
      </td>

      {/* Qty · unit */}
      <td className="px-4 py-2.5 text-right align-top">
        <Mono className="text-small text-text">
          {line.qty
            ? `${line.qty}${line.unit ? ' ' + line.unit : ''}`
            : '—'}
        </Mono>
      </td>

      {/* Rate / unit */}
      <td className="px-4 py-2.5 text-right align-top">
        <Mono className="text-small text-text">{inr(line.unit_rate)}</Mono>
      </td>

      {/* Line total */}
      <td className="px-4 py-2.5 text-right align-top">
        <Mono className="text-small font-semibold text-text">{inr(line.line_total)}</Mono>
      </td>

      {/* Lifecycle pill */}
      <td className="px-4 py-2.5 align-top">
        <StatusPill status={pill.status} label={t(pill.labelKey)} size="sm" />
      </td>
    </tr>
  )
}
