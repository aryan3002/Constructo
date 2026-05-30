import { EvidenceCard, StatusPill, Button, Mono } from '../../ui'
import type { Status } from '../../ui'
import { useT } from '../../i18n'
import type { TranslationKey } from '../../i18n'
import type { Decision, DecisionKind, DecisionState } from '../../api/approvals'

// Map a decision's state onto the shared status spine (color + icon, never
// color alone — see the design system).
const STATE_STATUS: Record<DecisionState, Status> = {
  pending: 'warn',
  acknowledged: 'info',
  resolved: 'ok',
  rejected: 'risk',
  escalated: 'risk',
}

const KIND_KEY: Record<DecisionKind, TranslationKey> = {
  approval: 'approvals.kind.approval',
  homeowner_question: 'approvals.kind.homeowner_question',
  hold_payment: 'approvals.kind.hold_payment',
  generic: 'approvals.kind.generic',
}

const STATE_KEY: Record<DecisionState, TranslationKey> = {
  pending: 'approvals.state.pending',
  acknowledged: 'approvals.state.acknowledged',
  resolved: 'approvals.state.resolved',
  rejected: 'approvals.state.rejected',
  escalated: 'approvals.state.escalated',
}

export interface ApprovalRowProps {
  decision: Decision
  selected: boolean
  onToggleSelect: (id: string) => void
  onApprove: (id: string) => void
  onReject: (id: string) => void
  busy?: boolean
}

/**
 * ApprovalRow — one decision in the inbox. A claim + a "Show proof" reveal
 * (EvidenceCard, the soul of the product) with inline Approve / Reject and a
 * batch-select checkbox. Open items show their state pill; an SLA-overdue
 * homeowner question reads as risk.
 */
export function ApprovalRow({
  decision: d,
  selected,
  onToggleSelect,
  onApprove,
  onReject,
  busy,
}: ApprovalRowProps) {
  const t = useT()
  const status = STATE_STATUS[d.state]
  const isOpen = d.state === 'pending' || d.state === 'escalated'
  const overdue =
    d.sla_due_at != null && new Date(d.sla_due_at).getTime() < Date.now()

  const evidence = d.evidence_event_ids.map((id) => ({
    kind: 'message' as const,
    label: id,
  }))

  const trailing = (
    <div className="flex items-center gap-2">
      {overdue ? (
        <StatusPill status="risk" size="sm" label={t('approvals.sla.overdue')} />
      ) : null}
      <StatusPill status={status} size="sm" label={t(STATE_KEY[d.state])} />
    </div>
  )

  const detail = (
    <span className="flex flex-wrap items-center gap-2">
      <Mono className="text-micro text-text-mute">{t(KIND_KEY[d.kind])}</Mono>
      {d.detail ? <span>· {d.detail}</span> : null}
      {d.assigned_to ? (
        <span className="text-text-mute">· {t('approvals.assigned_to')}</span>
      ) : null}
    </span>
  )

  return (
    <li className="flex items-start gap-3">
      {isOpen ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(d.id)}
          aria-label={`select ${d.title}`}
          className="mt-5 h-5 w-5 shrink-0 rounded border-line accent-[var(--amber)]"
        />
      ) : (
        <span className="mt-5 h-5 w-5 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <EvidenceCard
          claim={d.title}
          status={status}
          detail={detail}
          evidence={evidence}
          trailing={trailing}
        />
        {isOpen ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="md"
              variant="primary"
              disabled={busy}
              onClick={() => onApprove(d.id)}
            >
              {t('action.approve')}
            </Button>
            <Button
              size="md"
              variant="secondary"
              disabled={busy}
              onClick={() => onReject(d.id)}
            >
              {t('approvals.action.reject')}
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  )
}
