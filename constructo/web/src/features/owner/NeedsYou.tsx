// Col-1 of the Owner Command Center (W1-B): "Needs You" — the ≤3 ranked
// exceptions the owner must act on, each with inline decision chips, then a calm
// divider, then the append-only Decision Log. This is the product's "aha": the
// owner clears their brief here and closes the tab — never scrolls a feed.
//
// Capability gate (W1): an owner sees binding [Approve ₹]/[Hold]/[Assign]; any
// other role (PM/accountant/…) sees a single "Propose to owner →" — the server
// stays the authorization source of truth (vault 11/04 §5.1).
import { useMemo, useState, type ReactNode } from 'react'
import { useDecide, type DecideInput } from './useDecide'
import { DecisionLog } from './DecisionLog'
import { useCan } from '../../auth/useCan'
import type { DashRisk, OwnerHome, SiteCard } from '../../api/dashboard'
import { useT } from '../../i18n'
import {
  BriefCommandCard,
  Body,
  StatusPill,
  type BriefRisk,
  type Status,
} from '../../ui'
import { CheckIcon, PauseIcon, UserPlusIcon } from '../../ui/icons'
import type { TranslationKey } from '../../i18n'

const RISK_KIND_KEY: Record<string, TranslationKey> = {
  labor_shortfall: 'brief.risk.labor_shortfall',
  unverified_invoice: 'brief.risk.unverified_invoice',
  pending_approval: 'brief.risk.pending_approval',
  data_quality: 'brief.risk.data_quality',
}

/** Money-bearing exception kinds get the explicit ₹ glyph on the Approve chip. */
const MONEY_KINDS = new Set(['unverified_invoice', 'pending_approval'])

const STATUS_RANK: Record<Status, number> = { risk: 0, warn: 1, info: 2, ok: 3, done: 3 }
const MAX_CARDS = 3

/** Worst-status-first, then busiest; only sites that actually need attention. */
function rankExceptionSites(sites: SiteCard[]): SiteCard[] {
  return sites
    .filter((s) => s.top_risks.length > 0)
    .sort((a, b) => {
      const r = STATUS_RANK[a.status as Status] - STATUS_RANK[b.status as Status]
      return r !== 0 ? r : b.counts.total - a.counts.total
    })
}

export function NeedsYou({
  home,
  date,
  selectedSiteId,
}: {
  home: OwnerHome
  date: string
  selectedSiteId: string | null
}) {
  const t = useT()
  const canApprove = useCan('approve_money')
  const { decide } = useDecide(date)
  const [toast, setToast] = useState<{ status: Status; msg: string } | null>(null)

  const siteNames = useMemo(
    () => Object.fromEntries(home.sites.map((s) => [s.site_id, s.name])),
    [home.sites],
  )

  const ranked = useMemo(() => {
    const all = rankExceptionSites(home.sites)
    return selectedSiteId
      ? all.filter((s) => s.site_id === selectedSiteId)
      : all
  }, [home.sites, selectedSiteId])

  const shown = ranked.slice(0, MAX_CARDS)
  const overflowSites = ranked.length - shown.length
  const calmSites = home.sites_total - ranked.length

  function act(site: SiteCard, risk: DashRisk, riskKey: string, action: DecideInput['action']) {
    const input: DecideInput = {
      siteId: site.site_id,
      siteName: site.name,
      riskKey,
      action,
      title: risk.message,
      evidenceEventIds: risk.evidence_event_ids,
    }
    decide(input, {
      onSuccess: () =>
        setToast({
          status: 'ok',
          msg: canApprove
            ? t('owner.home.action_done', {
                action: t(ACTION_LABEL[action]),
                site: site.name,
              })
            : t('owner.needs.proposed', { site: site.name }),
        }),
      onError: () => setToast({ status: 'risk', msg: t('owner.home.action_failed') }),
    })
  }

  return (
    <section aria-labelledby="owner-needs-heading" className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-3">
        <h2
          id="owner-needs-heading"
          className="font-display text-h1 font-bold text-text"
        >
          {t('owner.needs.title')}
        </h2>
        {home.needs_attention_count > 0 ? (
          <StatusPill
            status="risk"
            label={t('owner.needs.count', { n: home.needs_attention_count })}
          />
        ) : null}
      </header>

      {toast ? (
        <p role="status" aria-live="polite">
          <StatusPill status={toast.status} label={toast.msg} />
        </p>
      ) : null}

      {shown.length === 0 ? (
        <section className="rounded-sheet border border-line bg-card p-6 text-center shadow-card">
          <StatusPill status="ok" label={t('owner.home.all_calm')} />
          <Body className="mt-2 !text-text-mute">{t('owner.home.all_calm_hint')}</Body>
        </section>
      ) : (
        <ul className="flex flex-col gap-4">
          {shown.map((site) => (
            <li key={site.site_id}>
              <BriefCommandCard
                siteName={site.name}
                siteStatus={site.status as Status}
                meta={`${site.counts.attendance} present · ${site.counts.deliveries} del · ${site.counts.issues} issues`}
                risks={toBriefRisks(site, t)}
                renderActions={(brisk) => {
                  const idx = Number(brisk.id.slice(site.site_id.length + 1))
                  const risk = site.top_risks[idx]
                  if (!risk) return null
                  return (
                    <DecisionChips
                      canApprove={canApprove}
                      money={MONEY_KINDS.has(risk.kind)}
                      onApprove={() => act(site, risk, brisk.id, 'approve')}
                      onHold={() => act(site, risk, brisk.id, 'hold')}
                      onAssign={() => act(site, risk, brisk.id, 'assign')}
                      onPropose={() => act(site, risk, brisk.id, 'approve')}
                    />
                  )
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {(overflowSites > 0 || calmSites > 0) && shown.length > 0 ? (
        <p className="text-center font-body text-small text-text-mute">
          <span aria-hidden>· · · </span>
          {overflowSites > 0
            ? t('owner.needs.more_sites', { n: overflowSites })
            : t('owner.needs.rest_calm', { n: calmSites })}
          <span aria-hidden> · · ·</span>
        </p>
      ) : null}

      <DecisionLog siteNames={siteNames} />
    </section>
  )
}

const ACTION_LABEL: Record<'approve' | 'hold' | 'assign', TranslationKey> = {
  approve: 'action.approve',
  hold: 'action.hold',
  assign: 'action.assign',
}

function toBriefRisks(site: SiteCard, t: ReturnType<typeof useT>): BriefRisk[] {
  return site.top_risks.map((r, i) => ({
    id: `${site.site_id}-${i}`,
    claim: r.message,
    status: r.status as Status,
    detail: t(RISK_KIND_KEY[r.kind] ?? 'brief.risk.data_quality'),
    evidence: r.evidence_event_ids.map((id) => ({
      kind: 'message' as const,
      label: t('brief.evidence.linked'),
      detail: id,
    })),
  }))
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
