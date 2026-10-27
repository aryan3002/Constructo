// Col-1 of the activity-first OwnerHome: "Needs you" — what is waiting on the
// owner's call:
//   - pending approvals from the decisions ledger (qk.decisions()); a chip acts
//     on that decision itself (Approve resolves it, Hold keeps it open as a
//     held payment, Assign names who handles it);
//   - today's site risks from the home brief that no decision covers yet; a
//     chip records the decision that handles it, so it doesn't come back.
// Money chips are the owner's, behind a confirm and a 5-second undo; a PM sees
// the owner-only note instead. Honest empty: "Nothing needs a decision right now."
//
// Held payments and homeowner questions are not asked again here: they read
// "On hold" in the Decision Log, and questions live in Requests / Approvals.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { approvalsApi, type Decision } from '../../api/approvals'
import type { DashRisk, OwnerHome } from '../../api/dashboard'
import { qk } from '../../api/queryKeys'
import { DecisionLog } from './DecisionLog'
import { useCan } from '../../auth/useCan'
import { useT, type TFunction } from '../../i18n'
import { Body, Mono, StatusPill, StatusDot, type Status } from '../../ui'
import { Spinner } from '../../components/states'
import { ChipRow, PendingUndoBar, useChipActions, type ChipSet } from './DecisionChips'
import { usePendingHiddenIds } from './pendingDecisions'

/** Risk kinds that are about money: Approve/Hold are offered (owner only). */
export const MONEY_RISK_KINDS = new Set(['unverified_invoice', 'pending_approval'])

const OPEN_STATES = new Set<Decision['state']>(['pending', 'acknowledged', 'escalated'])

/** An open approval the builder decides (never a held payment or a question). */
export function isOwnerDecision(d: Decision): boolean {
  return d.kind === 'approval' && OPEN_STATES.has(d.state)
}

/** The chips a row offers for this viewer. */
export function chipsFor(
  row: { type: 'decision' } | { type: 'risk'; kind: string },
  canApprove: boolean,
): ChipSet {
  const money = row.type === 'decision' || MONEY_RISK_KINDS.has(row.kind)
  if (row.type === 'decision') {
    // Every chip on a money decision is the owner's (assign included, S9).
    return canApprove ? { approve: true, hold: true, assign: true } : { ownerOnly: true }
  }
  if (!money) return { assign: true }
  return canApprove
    ? { approve: true, hold: true, assign: true }
    : { ownerOnly: true, assign: true }
}

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

type Row =
  | { type: 'decision'; key: string; decision: Decision }
  | { type: 'risk'; key: string; siteId: string; risk: DashRisk }

export function NeedsYou({
  date,
  home,
  selectedSiteId,
  siteNames,
}: {
  date: string
  /** The home brief whose open risks are listed after the approvals. */
  home?: OwnerHome
  selectedSiteId: string | null
  /** site_id → display name, so a card reads "Tower B" not a UUID. */
  siteNames: Record<string, string>
}) {
  const t = useT()
  const canApprove = useCan('approve_money')
  const [toast, setToast] = useState<{ status: Status; msg: string } | null>(null)
  const { act, dialogs } = useChipActions(date, (o) =>
    setToast({ status: o.status, msg: o.message }),
  )
  // Rows whose money action is waiting in its undo window.
  const hidden = usePendingHiddenIds()

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.decisions(),
    queryFn: () => approvalsApi.list(),
  })

  const rows = useMemo<Row[]>(() => {
    const inSite = (siteId: string | null) => !selectedSiteId || siteId === selectedSiteId
    const decisions: Row[] = (data?.items ?? [])
      .filter(isOwnerDecision)
      .filter((d) => inSite(d.site_id))
      .map((d) => ({ type: 'decision', key: d.id, decision: d }))
    const risks: Row[] = (home?.sites ?? [])
      .filter((s) => inSite(s.site_id))
      .flatMap((s) =>
        s.top_risks.map((risk, i) => ({
          type: 'risk' as const,
          key: `${s.site_id}-${i}`,
          siteId: s.site_id,
          risk,
        })),
      )
    return [...decisions, ...risks].filter((r) => !hidden.has(r.key))
  }, [data?.items, home?.sites, selectedSiteId, hidden])

  return (
    <section aria-labelledby="owner-needs-heading" className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-3">
        <h2 id="owner-needs-heading" className="font-display text-h1 font-bold text-text">
          {t('owner.needs.title')}
        </h2>
        {rows.length > 0 ? (
          <StatusPill status="risk" label={t('owner.needs.count', { n: rows.length })} />
        ) : null}
      </header>

      <PendingUndoBar />

      {toast ? (
        <p role="status" aria-live="polite">
          <StatusPill status={toast.status} label={toast.msg} />
        </p>
      ) : null}

      {isLoading ? (
        <Spinner label={t('owner.home.loading')} />
      ) : isError ? (
        <section className="rounded-sheet border border-line bg-card p-6 text-center shadow-card">
          <StatusPill status="warn" label={t('owner.home.error')} />
        </section>
      ) : rows.length === 0 ? (
        <section className="rounded-sheet border border-line bg-card p-6 text-center shadow-card">
          <StatusPill status="ok" label={t('owner.needs.empty_clean')} />
        </section>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const siteId = row.type === 'decision' ? row.decision.site_id : row.siteId
            const site = (siteId && siteNames[siteId]) || ''
            const title = row.type === 'decision' ? row.decision.title : row.risk.message
            const status: Status =
              row.type === 'decision' ? 'risk' : ((row.risk.status as Status) ?? 'warn')
            const chips = chipsFor(
              row.type === 'decision' ? row : { type: 'risk', kind: row.risk.kind },
              canApprove,
            )
            return (
              <li key={row.key} className="rounded-card border border-line bg-card p-3 shadow-card">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5">
                    <StatusDot status={status} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Body className="font-semibold text-text">{title}</Body>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-body text-micro text-text-mute">
                      {site ? <span className="truncate">{site}</span> : null}
                      {row.type === 'decision' ? (
                        <Mono className="text-micro text-text-mute">
                          {relativeTime(row.decision.created_at, t)}
                        </Mono>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="mt-2">
                  <ChipRow
                    chips={chips}
                    onAct={(action) =>
                      act(
                        row.type === 'decision'
                          ? { type: 'decision', decision: row.decision }
                          : {
                              type: 'risk',
                              siteId: row.siteId,
                              riskKey: row.key,
                              title: row.risk.message,
                              evidenceEventIds: row.risk.evidence_event_ids,
                            },
                        action,
                        site,
                      )
                    }
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {dialogs}
      <DecisionLog siteNames={siteNames} />
    </section>
  )
}
