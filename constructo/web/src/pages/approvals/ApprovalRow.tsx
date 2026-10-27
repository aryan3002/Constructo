import { Link } from 'react-router-dom'
import { EvidenceCard, StatusPill, Button, Mono, Small } from '../../ui'
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

/** Money-bearing decisions only the owner may decide (the server's
 *  `_OWNER_ONLY_KINDS`); everyone else gets 403 `owner_only`. */
export const MONEY_KINDS = new Set<DecisionKind>(['approval', 'hold_payment'])

/** A homeowner's question: the team waits on their answer, never decides it. */
export function waitsOnHomeowner(d: Pick<Decision, 'audience'>): boolean {
  return d.audience === 'homeowner'
}

/** "for 3 hours" — how long a homeowner question has been waiting. */
export function waitingText(
  createdAt: string,
  t: (k: TranslationKey, v?: Record<string, number>) => string,
  now = Date.now(),
): string {
  const mins = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60_000))
  if (mins < 60) return t('approvals.waiting_homeowner.minutes', { n: Math.max(1, mins) })
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) {
    return t(hrs === 1 ? 'approvals.waiting_homeowner.hour' : 'approvals.waiting_homeowner.hours', {
      n: hrs,
    })
  }
  const days = Math.floor(hrs / 24)
  return t(days === 1 ? 'approvals.waiting_homeowner.day' : 'approvals.waiting_homeowner.days', {
    n: days,
  })
}

export interface ApprovalRowProps {
  decision: Decision
  selected: boolean
  onToggleSelect: (id: string) => void
  onApprove: (id: string) => void
  onReject: (id: string) => void
  /** True for the owner (capability `approve_money`). */
  canApproveMoney: boolean
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
  canApproveMoney,
  busy,
}: ApprovalRowProps) {
  const t = useT()
  const status = STATE_STATUS[d.state]
  const isOpen = d.state === 'pending' || d.state === 'escalated'
  // The homeowner answers these (a tile choice, a sign-off): no Approve/Reject
  // and no batch select, just how long it has been waiting.
  const homeowners = waitsOnHomeowner(d)
  // WC4 (abort condition): a non-owner NEVER sees Approve/Release on a money
  // decision — only a note that it waits on the owner (it is already in their
  // inbox; there is nothing to send). The server is the authz source too.
  const ownerOnly = MONEY_KINDS.has(d.kind) && !canApproveMoney
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
      {d.spec_id ? (
        <span className="inline-flex items-center rounded-pill border border-primary/30 bg-primary/10 px-2 py-0.5 font-body text-micro font-semibold text-primary">
          {t('approvals.from_selection')}
        </span>
      ) : null}
      {d.detail ? <span>· {d.detail}</span> : null}
      {d.assigned_to ? (
        <span className="text-text-mute">· {t('approvals.assigned_to')}</span>
      ) : null}
      {d.spec_id ? (
        <Link
          to="/designer?tab=selections"
          className="font-body text-micro font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          data-testid="view-selection-link"
        >
          {t('approvals.view_selection')}
        </Link>
      ) : null}
    </span>
  )

  return (
    <li className="flex items-start gap-3">
      {isOpen && !homeowners ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(d.id)}
          aria-label={`select ${d.title}`}
          className="mt-5 h-5 w-5 shrink-0 rounded border-line accent-[var(--brand)]"
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
            {homeowners ? (
              <Small data-testid="homeowner-wait">{waitingText(d.created_at, t)}</Small>
            ) : ownerOnly ? (
              <Small data-testid="owner-only-note">{t('approvals.owner_only')}</Small>
            ) : (
              <>
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
              </>
            )}
          </div>
        ) : null}
      </div>
    </li>
  )
}
