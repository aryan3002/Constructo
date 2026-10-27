// Decision Log (W1.3) — an append-only ledger of the calls the owner has made,
// beneath "Needs You" in Col-1. Never an edit surface (Invariant 3): each row is
// who-decided-what / when / on-what-proof. Sourced from the shared decisions
// query (`qk.decisions()` → approvalsApi.list()); `useDecide` optimistically
// prepends the in-flight row here, so a chip action shows up instantly.
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { approvalsApi, type Decision } from '../../api/approvals'
import { authApi } from '../../api/auth'
import { qk } from '../../api/queryKeys'
import { useT } from '../../i18n'
import { Mono, Small, StatusDot, type Status } from '../../ui'
import { Spinner } from '../../components/states'
import type { TranslationKey } from '../../i18n'

/** How many most-recent decisions to surface (the log is a glance, not an audit). */
const LOG_LIMIT = 6

export interface LogLabel {
  status: Status
  labelKey: TranslationKey
  vars?: Record<string, string>
}

const OPEN = new Set<Decision['state']>(['pending', 'acknowledged', 'escalated'])
const MONEY = new Set<Decision['kind']>(['approval', 'hold_payment'])

/**
 * What a log row says happened, from its kind AND state — a pending approval
 * reads "Pending", never "Approved". `names` maps user ids to display names
 * for "Assigned to <name>".
 */
export function decisionLabel(d: Decision, names: Record<string, string> = {}): LogLabel {
  if (OPEN.has(d.state)) {
    if (d.kind === 'hold_payment') return { status: 'warn', labelKey: 'owner.log.on_hold' }
    if (d.kind === 'generic' && d.assigned_to) {
      const name = names[d.assigned_to]
      return name
        ? { status: 'info', labelKey: 'owner.log.assigned_to', vars: { name } }
        : { status: 'info', labelKey: 'owner.log.assigned' }
    }
    if (d.state === 'escalated') return { status: 'risk', labelKey: 'owner.log.escalated' }
    if (d.state === 'acknowledged') return { status: 'info', labelKey: 'owner.log.acknowledged' }
    return { status: 'warn', labelKey: 'owner.log.pending' }
  }
  if (d.state === 'resolved') {
    return MONEY.has(d.kind)
      ? { status: 'ok', labelKey: 'owner.log.approved' }
      : { status: 'ok', labelKey: 'owner.log.resolved' }
  }
  // rejected: a refused held payment stays held.
  return d.kind === 'hold_payment'
    ? { status: 'warn', labelKey: 'owner.log.held' }
    : { status: 'risk', labelKey: 'owner.log.rejected' }
}

export function useDecisions() {
  return useQuery({
    queryKey: qk.decisions(),
    queryFn: () => approvalsApi.list(),
  })
}

/** Compact "2h ago" / "just now" relative time (no chart, no heavy dep). */
function relativeTime(iso: string, t: ReturnType<typeof useT>): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.round((Date.now() - then) / 1000)
  if (secs < 60) return t('owner.log.just_now')
  const mins = Math.round(secs / 60)
  if (mins < 60) return t('owner.log.mins_ago', { n: mins })
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return t('owner.log.hrs_ago', { n: hrs })
  const days = Math.round(hrs / 24)
  return t('owner.log.days_ago', { n: days })
}

export function DecisionLog({
  siteNames,
}: {
  /** site_id → display name, so the log reads "Tower B" not a UUID. */
  siteNames: Record<string, string>
}) {
  const t = useT()
  const { data, isLoading, isError } = useDecisions()
  const items = (data?.items ?? []).slice(0, LOG_LIMIT)
  // Teammate names for "Assigned to <name>" (owner/PM read the roster).
  const anyAssigned = items.some((d) => d.assigned_to)
  const team = useQuery({
    queryKey: qk.team(),
    queryFn: () => authApi.listTeam(),
    enabled: anyAssigned,
  })
  const names = useMemo(
    () =>
      Object.fromEntries((team.data ?? []).map((m) => [m.id, m.name?.trim() || m.phone])),
    [team.data],
  )

  return (
    <section aria-labelledby="owner-log-heading" className="mt-2">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h2
          id="owner-log-heading"
          className="font-display text-h2 font-semibold text-text"
        >
          {t('owner.log.title')}
        </h2>
        <Small className="!text-text-mute">{t('owner.log.subtitle')}</Small>
      </header>

      {isLoading ? (
        <Spinner label={t('owner.log.loading')} />
      ) : isError ? (
        // Non-blocking: the log is supporting context, never gates a decision.
        <p className="rounded-card border border-line bg-card p-3 font-body text-small text-text-mute">
          {t('owner.log.error')}
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-card p-4 text-center font-body text-small text-text-mute">
          {t('owner.log.empty')}
        </p>
      ) : (
        <ol className="overflow-hidden rounded-card border border-line bg-card shadow-card">
          {items.map((d) => {
            const meta = decisionLabel(d, names)
            const site = d.site_id ? siteNames[d.site_id] : null
            return (
              <li
                key={d.id}
                className="flex items-start gap-3 border-b border-line px-3 py-2.5 last:border-b-0"
              >
                <span className="mt-0.5">
                  <StatusDot status={meta.status} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-small font-semibold text-text">
                    <span className="text-text-mute">{t(meta.labelKey, meta.vars)} · </span>
                    {d.title}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-body text-micro text-text-mute">
                    {site ? <span className="truncate">{site}</span> : null}
                    <Mono className="text-micro text-text-mute">
                      {relativeTime(d.created_at, t)}
                    </Mono>
                    {d.evidence_event_ids.length > 0 ? (
                      <span>
                        · {t('owner.log.proof', { n: d.evidence_event_ids.length })}
                      </span>
                    ) : null}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
