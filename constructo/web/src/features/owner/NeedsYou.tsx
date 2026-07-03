// Col-1 of the activity-first OwnerHome: "Needs you" — ONLY the genuine pending
// owner decisions (kind approval / hold_payment) read straight from the
// decisions query (qk.decisions() → approvalsApi.list()). Each row carries the
// existing capability-gated Approve/Hold/Assign chips wired to useDecide's
// optimistic path. Honest empty: "Nothing needs a decision right now."
//
// This replaces the old brief/SiteCard-driven NeedsYou. Homeowner questions and
// site-health flags are NO LONGER decisions here — they live in the activity
// stream / Requests surface.
import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { approvalsApi, type Decision } from '../../api/approvals'
import { qk } from '../../api/queryKeys'
import { useDecide, type DecideInput } from './useDecide'
import { DecisionLog } from './DecisionLog'
import { useCan } from '../../auth/useCan'
import { useT, type TFunction } from '../../i18n'
import { Body, Mono, StatusPill, StatusDot, type Status } from '../../ui'
import { CheckIcon, PauseIcon, UserPlusIcon } from '../../ui/icons'
import { Spinner } from '../../components/states'
import type { TranslationKey } from '../../i18n'

const ACTION_LABEL: Record<'approve' | 'hold' | 'assign', TranslationKey> = {
  approve: 'action.approve',
  hold: 'action.hold',
  assign: 'action.assign',
}

/** The only decision kinds the owner actually decides here. */
function isOwnerDecision(d: Decision): boolean {
  return d.state === 'pending' && (d.kind === 'approval' || d.kind === 'hold_payment')
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

export function NeedsYou({
  date,
  selectedSiteId,
  siteNames,
}: {
  date: string
  selectedSiteId: string | null
  /** site_id → display name, so a card reads "Tower B" not a UUID. */
  siteNames: Record<string, string>
}) {
  const t = useT()
  const canApprove = useCan('approve_money')
  const { decide } = useDecide(date)
  const [toast, setToast] = useState<{ status: Status; msg: string } | null>(null)
  // Locally-hidden ids so an actioned card vanishes instantly (honest optimism);
  // the useDecide onSettled refetch reconciles server truth.
  const [actioned, setActioned] = useState<Set<string>>(() => new Set())

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.decisions(),
    queryFn: () => approvalsApi.list(),
  })

  const pending = useMemo(() => {
    const all = (data?.items ?? []).filter(isOwnerDecision).filter((d) => !actioned.has(d.id))
    return selectedSiteId ? all.filter((d) => d.site_id === selectedSiteId) : all
  }, [data?.items, selectedSiteId, actioned])

  function act(d: Decision, action: DecideInput['action']) {
    const siteName = (d.site_id && siteNames[d.site_id]) || ''
    const input: DecideInput = {
      siteId: d.site_id ?? '',
      siteName,
      riskKey: d.id,
      action,
      title: d.title,
      evidenceEventIds: d.evidence_event_ids,
    }
    decide(input, {
      onSuccess: () => {
        setActioned((prev) => new Set(prev).add(d.id))
        setToast({
          status: 'ok',
          msg: canApprove
            ? t('owner.home.action_done', { action: t(ACTION_LABEL[action]), site: siteName })
            : t('owner.needs.proposed', { site: siteName }),
        })
      },
      onError: () => setToast({ status: 'risk', msg: t('owner.home.action_failed') }),
    })
  }

  return (
    <section aria-labelledby="owner-needs-heading" className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-3">
        <h2 id="owner-needs-heading" className="font-display text-h1 font-bold text-text">
          {t('owner.needs.title')}
        </h2>
        {pending.length > 0 ? (
          <StatusPill status="risk" label={t('owner.needs.count', { n: pending.length })} />
        ) : null}
      </header>

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
      ) : pending.length === 0 ? (
        <section className="rounded-sheet border border-line bg-card p-6 text-center shadow-card">
          <StatusPill status="ok" label={t('owner.needs.empty_clean')} />
        </section>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((d) => {
            const site = d.site_id ? siteNames[d.site_id] : null
            return (
              <li
                key={d.id}
                className="rounded-card border border-line bg-card p-3 shadow-card"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5">
                    <StatusDot status={d.kind === 'hold_payment' ? 'warn' : 'risk'} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Body className="font-semibold text-text">{d.title}</Body>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-body text-micro text-text-mute">
                      {site ? <span className="truncate">{site}</span> : null}
                      <Mono className="text-micro text-text-mute">
                        {relativeTime(d.created_at, t)}
                      </Mono>
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex justify-end">
                  <DecisionChips
                    canApprove={canApprove}
                    money={d.kind === 'approval'}
                    onApprove={() => act(d, 'approve')}
                    onHold={() => act(d, 'hold')}
                    onAssign={() => act(d, 'assign')}
                    onPropose={() => act(d, 'approve')}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <DecisionLog siteNames={siteNames} />
    </section>
  )
}

/** Capability-gated chip cluster — owner acts, everyone else proposes. */
function DecisionChips({
  canApprove,
  money,
  onApprove,
  onHold,
  onAssign,
  onPropose,
}: {
  canApprove: boolean
  money: boolean
  onApprove: () => void
  onHold: () => void
  onAssign: () => void
  onPropose: () => void
}) {
  const t = useT()
  if (!canApprove) {
    return (
      <button
        type="button"
        onClick={onPropose}
        className="inline-flex min-h-tap items-center gap-1.5 rounded-pill border border-brand/50 bg-card px-3 font-body text-small font-semibold text-brand-text cstk-animate transition hover:bg-brand/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-card"
      >
        {t('owner.needs.propose')} <span aria-hidden>→</span>
      </button>
    )
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Chip
        onClick={onApprove}
        label={money ? t('owner.needs.approve_money') : t('action.approve')}
        cls="border-ok/40 text-ok hover:bg-ok/10 active:bg-ok/15"
        Icon={CheckIcon}
      />
      <Chip
        onClick={onHold}
        label={t('action.hold')}
        cls="border-warn/40 text-warn hover:bg-warn/10 active:bg-warn/15"
        Icon={PauseIcon}
      />
      <Chip
        onClick={onAssign}
        label={t('action.assign')}
        cls="border-info/40 text-info hover:bg-info/10 active:bg-info/15"
        Icon={UserPlusIcon}
      />
    </div>
  )
}

function Chip({
  onClick,
  label,
  cls,
  Icon,
}: {
  onClick: () => void
  label: string
  cls: string
  Icon: (p: { title?: string }) => ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-tap items-center gap-1.5 rounded-pill border bg-card px-3 font-body text-small font-semibold cstk-animate transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-card ${cls}`}
    >
      <span className="text-[1.05em] leading-none" aria-hidden>
        <Icon title={label} />
      </span>
      {label}
    </button>
  )
}
