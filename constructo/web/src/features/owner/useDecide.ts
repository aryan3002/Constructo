// Optimistic decision hook for the Owner Command Center (vault 11/04 §3.3, W1.2).
//
// Replaces OwnerHome's old invalidate-on-success path with honest optimism:
//   onMutate  → cancel in-flight home reads, snapshot, then *immediately* drop
//               the actioned exception from the brief (chip vanishes, the
//               "Needs You" count ticks down) and prepend it to the Decision Log.
//   onError   → roll BOTH caches back to the snapshot (the chip returns) so a
//               failed money decision is never silently swallowed.
//   onSettled → invalidate home + decisions so the server reconciles the truth.
//
// Each call carries a client-generated `client_decision_id` (CA8 idempotency
// seam). KNOWN GAP (W1): the server does not yet de-dupe on it, so a mirrored
// duplicate action could still double-act — tracked in the W1 wave notes.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { qk } from '../../api/queryKeys'
import {
  dashboardApi,
  type DecisionAction,
  type OwnerHome,
} from '../../api/dashboard'
import type { Decision, Paginated } from '../../api/approvals'

/** Caller-facing input for one inline decision chip. */
export interface DecideInput {
  siteId: string
  siteName: string
  /** Composed risk id (`${siteId}-${index}`) so onMutate can drop the exact row. */
  riskKey: string
  action: DecisionAction
  title: string
  evidenceEventIds: string[]
}

interface DecideVars extends DecideInput {
  clientDecisionId: string
}

interface DecideContext {
  prevHome?: OwnerHome
  prevDecisions?: Paginated<Decision>
}

/** Map the inline chip action onto the backend Decision kind (mirrors the API). */
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

/** Build the optimistic Decision Log row for an in-flight chip. */
function optimisticDecision(v: DecideVars): Decision {
  return {
    id: v.clientDecisionId,
    company_id: '',
    site_id: v.siteId,
    kind: ACTION_KIND[v.action],
    title: v.title,
    detail: null,
    raised_by: null,
    assigned_to: null,
    state: v.action === 'approve' ? 'resolved' : 'pending',
    sla_due_at: null,
    resolved_at: null,
    resolution_note: null,
    evidence_event_ids: v.evidenceEventIds,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export interface DecideCallbacks {
  onError?: (input: DecideInput) => void
  onSuccess?: (input: DecideInput) => void
}

/**
 * `useDecide(date)` → `{ decide, isPending }`. Call `decide(input, callbacks?)`
 * from an inline chip; the optimistic update + rollback are handled here so each
 * column stays a thin view.
 */
export function useDecide(date: string) {
  const qc = useQueryClient()
  const homeKey = qk.home(date)
  const logKey = qk.decisions()

  const mutation = useMutation<unknown, Error, DecideVars, DecideContext>({
    mutationFn: (v) =>
      dashboardApi.createDecision({
        site_id: v.siteId,
        action: v.action,
        title: v.title,
        evidence_event_ids: v.evidenceEventIds,
        client_decision_id: v.clientDecisionId,
      }),
    async onMutate(v) {
      // 1) Stop in-flight refetches from clobbering our optimistic write.
      await qc.cancelQueries({ queryKey: homeKey })
      await qc.cancelQueries({ queryKey: logKey })

      // 2) Snapshot for rollback.
      const prevHome = qc.getQueryData<OwnerHome>(homeKey)
      const prevDecisions = qc.getQueryData<Paginated<Decision>>(logKey)

      // 3) Optimistically clear the exception + prepend it to the log.
      if (prevHome) {
        qc.setQueryData<OwnerHome>(
          homeKey,
          applyDecisionToHome(prevHome, v.siteId, v.riskKey),
        )
      }
      qc.setQueryData<Paginated<Decision>>(logKey, (cur) => {
        const row = optimisticDecision(v)
        const items = cur?.items ?? []
        return { items: [row, ...items], next_cursor: cur?.next_cursor ?? null }
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
    },
  })

  function decide(input: DecideInput, cb?: DecideCallbacks) {
    mutation.mutate(
      { ...input, clientDecisionId: newDecisionId() },
      {
        onError: () => cb?.onError?.(input),
        onSuccess: () => cb?.onSuccess?.(input),
      },
    )
  }

  return { decide, isPending: mutation.isPending }
}
