import { Body, Mono, Small, StatusDot, StatusPill } from '../../ui'
import { useT } from '../../i18n'
import type { ReconcileItem } from '../../api/reconcile'
import { RECONCILE_STATUS, formatInr, statusKey } from './helpers'

export interface ReconcileRowProps {
  item: ReconcileItem
  selected?: boolean
  onSelect?: () => void
}

/**
 * A compact, tappable reconciliation row for the master list. >=48px tap
 * target, status by dot+pill (never color alone), amount-at-risk in mono.
 */
export function ReconcileRow({ item, selected, onSelect }: ReconcileRowProps) {
  const t = useT()
  const status = RECONCILE_STATUS[item.status]
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={`flex w-full min-h-tap items-center gap-3 rounded-card border px-4 py-3 text-left cstk-animate transition ${
        selected
          ? 'border-primary bg-primary/5'
          : 'border-line bg-card hover:bg-paper'
      }`}
    >
      <StatusDot status={status} />
      <div className="min-w-0 flex-1">
        <Body as="span" className="block truncate font-semibold !text-text">
          {item.vendor ?? '—'}
        </Body>
        <Small className="truncate">{item.item ?? '—'}</Small>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusPill status={status} size="sm" label={t(statusKey(item.status))} />
        {item.amount_at_risk > 0 && (
          <Mono className="text-micro text-risk">{formatInr(item.amount_at_risk)}</Mono>
        )}
      </div>
    </button>
  )
}
