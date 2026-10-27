// Optimistic decision hook for the Owner Command Center (vault 11/04 §3.3, W1.2).
//
// A chip acts on one of two things:
//   - a decision already in the ledger (a pending approval): Approve resolves
//     it, Hold keeps it open as a held payment, Assign names who handles it;
//   - a site risk from the home brief: the chip records a new decision that
//     says what happened (approve → the owner's resolved approval, hold → an
//     open held payment, assign → an open ask for the chosen person). Its
//     evidence then marks the risk handled, so the server leaves it off Home.
//
//   onMutate  → cancel in-flight reads, snapshot, drop the risk from the brief
//               and write the Decision Log row exactly as the server records it.
//   onError   → roll BOTH caches back to the snapshot (the chip returns).
//   onSettled → invalidate home + decisions + the inbox so the server reconciles.
//
// Each risk action carries a client-generated `client_decision_id` (CA8): the
// server answers a repeat with the row it already recorded, never a second one.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { qk } from '../../api/queryKeys'
import { dashboardApi, type DecisionAction, type OwnerHome } from '../../api/dashboard'
import { approvalsApi, type Decision, type Paginated } from '../../api/approvals'

export type { DecisionAction }

/** What a chip acts on. */
export type DecideTarget =
  | {
      type: 'risk'
      siteId: string
      /** Composed risk id (`${siteId}-${index}`) so onMutate can drop the exact row. */
      riskKey: string
      title: string
      evidenceEventIds: string[]
    }
  | { type: 'decision'; decision: Decision }

/** Caller-facing input for one chip. */
export interface DecideInput {
  target: DecideTarget
  action: DecisionAction
  /** Who an Assign goes to (required for assign). */
  assignee?: { id: string; name: string }
}

interface DecideVars extends DecideInput {
  clientDecisionId: string
}

interface DecideContext {
  prevHome?: OwnerHome
  prevDecisions?: Paginated<Decision>
}

/** The id a chip's row is known by (hidden while its action waits). */
export function targetId(target: DecideTarget): string {
  return target.type === 'risk' ? target.riskKey : target.decision.id
}

/** Approve and Hold move money: the owner's alone, behind a confirm + undo. */
export function isMoneyAction(action: DecisionAction): boolean {
  return action === 'approve' || action === 'hold'
}

/** Map a risk chip onto the backend Decision kind (mirrors the API). */
const ACTION_KIND: Record<DecisionAction, Decision['kind']> = {
  approve: 'approval',
  hold: 'hold_payment',
  assign: 'generic',
}

/** A short, collision-resistant idempotency key (UUID where available). */
function newDecisionId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // Fallback for very old runtimes: timestamp + entropy.
  return `dec-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
}

/**
 * Drop the actioned exception from the brief snapshot: rebuild the matching
 * site's `top_risks` without the chosen row, tick the headline count down by
 * one, and recompute how many sites still need attention. Pure — returns a new
 * payload, never mutates the cached one.
 */
export function applyDecisionToHome(
  home: OwnerHome,
  siteId: string,
  riskKey: string,
): OwnerHome {
  const sites = home.sites.map((s) => {
    if (s.site_id !== siteId) return s
    const top_risks = s.top_risks.filter(
      (_, i) => `${s.site_id}-${i}` !== riskKey,
    )
    return { ...s, top_risks }
  })
  const sitesNeeding = sites.filter(
    (s) => s.top_risks.length > 0 || s.risk_overflow > 0,
  ).length
  return {
    ...home,
    sites,
    needs_attention_count: Math.max(0, home.needs_attention_count - 1),
    sites_needing_attention: sitesNeeding,
  }
}

/**
 * The Decision Log row the server will record for this chip — the same kind,
 * state and assignee, so the optimistic row never claims more than happened.
 */
export function recordedDecision(input: DecideInput, id: string, now = new Date()): Decision {
  const at = now.toISOString()
  if (input.target.type === 'decision') {
    const d = input.target.decision
    if (input.action === 'approve') {
      return { ...d, state: 'resolved', resolved_at: at, updated_at: at }
    }
    if (input.action === 'hold') return { ...d, kind: 'hold_payment', updated_at: at }
    return { ...d, assigned_to: input.assignee?.id ?? d.assigned_to, updated_at: at }
  }
  const approved = input.action === 'approve'
  return {
    id,
    company_id: '',
    site_id: input.target.siteId,
    kind: ACTION_KIND[input.action],
    title: input.target.title,
    detail: null,
    raised_by: null,
    assigned_to: input.action === 'assign' ? (input.assignee?.id ?? null) : null,
    state: approved ? 'resolved' : 'pending',
    sla_due_at: null,
    resolved_at: approved ? at : null,
    resolution_note: null,
    evidence_event_ids: input.target.evidenceEventIds,
    created_at: at,
    updated_at: at,
  }
}

function send(v: DecideVars): Promise<unknown> {
  const { target, action } = v
  if (target.type === 'decision') {
    const id = target.decision.id
    if (action === 'approve') return approvalsApi.approve(id)
    if (action === 'hold') return approvalsApi.hold(id)
    return approvalsApi.assign(id, v.assignee!.id)
  }
  return dashboardApi.createDecision({
    site_id: target.siteId,
    action,
    title: target.title,
    evidence_event_ids: target.evidenceEventIds,
    assigned_to: action === 'assign' ? v.assignee?.id : undefined,
    client_decision_id: v.clientDecisionId,
  })
}

/**
 * `useDecide(date)` → `{ decide, isPending }`. `decide(input)` sends one chip
 * action and resolves when the server has recorded it (rejects on failure,
 * after rolling the optimistic rows back).
 */
export function useDecide(date: string) {
  const qc = useQueryClient()
  const homeKey = qk.home(date)
  const logKey = qk.decisions()

  const mutation = useMutation<unknown, Error, DecideVars, DecideContext>({
    mutationFn: send,
    async onMutate(v) {
      // 1) Stop in-flight refetches from clobbering our optimistic write.
      await qc.cancelQueries({ queryKey: homeKey })
      await qc.cancelQueries({ queryKey: logKey })

      // 2) Snapshot for rollback.
      const prevHome = qc.getQueryData<OwnerHome>(homeKey)
      const prevDecisions = qc.getQueryData<Paginated<Decision>>(logKey)

      // 3) Clear a risk from the brief, and write the log row as recorded.
      if (prevHome && v.target.type === 'risk') {
        qc.setQueryData<OwnerHome>(
          homeKey,
          applyDecisionToHome(prevHome, v.target.siteId, v.target.riskKey),
        )
      }
      const row = recordedDecision(v, v.clientDecisionId)
      qc.setQueryData<Paginated<Decision>>(logKey, (cur) => {
        const items = cur?.items ?? []
        const next =
          v.target.type === 'decision'
            ? items.map((d) => (d.id === row.id ? row : d))
            : [row, ...items]
        return { items: next, next_cursor: cur?.next_cursor ?? null }
      })

      return { prevHome, prevDecisions }
    },
    onError(_err, _v, ctx) {
      // Roll BOTH caches back — the chip reappears, the count restores.
      if (ctx?.prevHome !== undefined) qc.setQueryData(homeKey, ctx.prevHome)
      if (ctx?.prevDecisions !== undefined)
        qc.setQueryData(logKey, ctx.prevDecisions)
    },
    onSettled() {
      qc.invalidateQueries({ queryKey: homeKey })
      qc.invalidateQueries({ queryKey: logKey })
      qc.invalidateQueries({ queryKey: ['approvals'] })
    },
  })

  function decide(input: DecideInput): Promise<unknown> {
    return mutation.mutateAsync({ ...input, clientDecisionId: newDecisionId() })
  }

  return { decide, isPending: mutation.isPending }
}
