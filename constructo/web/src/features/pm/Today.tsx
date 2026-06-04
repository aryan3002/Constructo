// PM "Today" (W3.4) — the project manager's multi-site execution glance.
//
// Not the owner's cash brief: the PM scans every site that needs action and
// either *assigns* the operational exceptions (their job) or *proposes* the
// money ones to the owner — never approves spend (WC4 / Invariant 4). The
// propose-not-approve shape comes straight from the capability gate
// (`useCan('approve_money')` is false for the PM), exactly as in NeedsYou.
//
// Money decisions (unverified invoice, pending approval) → "Propose to owner →".
// Everything else → "Assign" (delegate to the team). Both ride the shared
// optimistic `useDecide` hook so the card clears instantly and rolls back on
// error. DPR-due weighting (vault 11/03 §5) is deferred until `getHome` exposes
// a per-site DPR signal — we don't invent one.
import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { todayIso } from '../../api/config'
import { qk } from '../../api/queryKeys'
import {
  dashboardApi,
  type DashRisk,
  type OwnerHome,
  type SiteCard,
} from '../../api/dashboard'
import { useCan } from '../../auth/useCan'
import { useDecide, type DecideInput } from '../owner/useDecide'
import { useT, type TranslationKey } from '../../i18n'
import { formatDate } from '../../lib/format'
import { ErrorState, Spinner } from '../../components/states'
import {
  AppShell,
  BriefCommandCard,
  Display,
  Mono,
  Small,
  StatusPill,
  type BriefRisk,
  type SiteSummary,
  type Status,
} from '../../ui'
import { CheckIcon, UserPlusIcon } from '../../ui/icons'

/** Money-bearing exception kinds the PM must escalate, never action. */
const MONEY_KINDS = new Set(['unverified_invoice', 'pending_approval'])

const RISK_KIND_KEY: Record<string, TranslationKey> = {
  labor_shortfall: 'brief.risk.labor_shortfall',
  unverified_invoice: 'brief.risk.unverified_invoice',
  pending_approval: 'brief.risk.pending_approval',
  data_quality: 'brief.risk.data_quality',
}

const STATUS_RANK: Record<Status, number> = { risk: 0, warn: 1, info: 2, ok: 3 }

/** Worst-status-first, then busiest; only sites that actually need attention. */
function rankExceptionSites(sites: SiteCard[]): SiteCard[] {
  return sites
    .filter((s) => s.top_risks.length > 0)
    .sort((a, b) => {
      const r = STATUS_RANK[a.status as Status] - STATUS_RANK[b.status as Status]
      return r !== 0 ? r : b.counts.total - a.counts.total
    })
}

function usePmHome(date: string) {
  return useQuery({ queryKey: qk.home(date), queryFn: () => dashboardApi.getHome(date) })
}

export function Today() {
  const t = useT()
  const date = todayIso()
  const { data: home, isLoading, isError, error, refetch } = usePmHome(date)
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)

  const sites = home?.sites ?? []
  const siteSummaries = useMemo<SiteSummary[]>(
    () =>
      sites.map((s) => ({
        id: s.site_id,
        name: s.name,
        status: s.status as Status,
        meta:
          s.top_risks.length > 0
            ? `${s.top_risks.length + s.risk_overflow} open`
            : undefined,
      })),
    [sites],
  )

  return (
    <AppShell
      role="pm"
      sites={siteSummaries}
      selectedSiteId={selectedSiteId}
      onSelectSite={setSelectedSiteId}
      roleBadge={{ name: 'PM', initials: 'PM' }}
    >
      <header>
        <Small className="!text-text-mute">{t('pm.today.title')}</Small>
        <Display className="mt-1">{renderHeadline(home, t)}</Display>
        <Mono className="mt-1 block text-small text-text-mute">{formatDate(date)}</Mono>
        <Small className="mt-2 block !text-text-mute">{t('pm.today.subtitle')}</Small>
      </header>

      <div className="mt-6">
        {isLoading && <Spinner label={t('pm.today.loading')} />}

        {isError && (
          <ErrorState
            message={(error as Error)?.message ?? t('pm.today.error')}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && home && (
          <Glance
            home={home}
            date={date}
            selectedSiteId={selectedSiteId}
          />
        )}
      </div>
    </AppShell>
  )
}

function renderHeadline(home: OwnerHome | undefined, t: ReturnType<typeof useT>) {
  if (!home) return t('pm.today.title')
  const needing = home.sites.filter((s) => s.top_risks.length > 0).length
  if (needing === 0) return t('pm.today.all_calm')
  return t(needing === 1 ? 'pm.today.needs_one' : 'pm.today.needs_many', {
    n: needing,
  })
}

/** The multi-site glance: a command card per exception site, PM-shaped chips. */
function Glance({
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

  const ranked = useMemo(() => {
    const all = rankExceptionSites(home.sites)
    return selectedSiteId ? all.filter((s) => s.site_id === selectedSiteId) : all
  }, [home.sites, selectedSiteId])

  function act(
    site: SiteCard,
    risk: DashRisk,
    riskKey: string,
    action: DecideInput['action'],
  ) {
    decide(
      {
        siteId: site.site_id,
        siteName: site.name,
        riskKey,
        action,
        title: risk.message,
        evidenceEventIds: risk.evidence_event_ids,
      },
      {
        onSuccess: () =>
          setToast({
            status: 'ok',
            msg:
              action === 'assign'
                ? t('pm.today.assigned', { site: site.name })
                : t('owner.needs.proposed', { site: site.name }),
          }),
        onError: () => setToast({ status: 'risk', msg: t('owner.home.action_failed') }),
      },
    )
  }

  if (ranked.length === 0) {
    return (
      <section className="rounded-sheet border border-line bg-card p-6 text-center shadow-card">
        <StatusPill status="ok" label={t('pm.today.all_calm')} />
        <p className="mt-2 font-body text-small text-text-mute">
          {t('pm.today.all_calm_hint')}
        </p>
      </section>
    )
  }

  return (
    <section aria-label={t('pm.today.glance_label')} className="flex flex-col gap-4">
      {toast ? (
        <p role="status" aria-live="polite">
          <StatusPill status={toast.status} label={toast.msg} />
        </p>
      ) : null}

      <ul className="flex flex-col gap-4">
        {ranked.map((site) => (
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
                if (MONEY_KINDS.has(risk.kind)) {
                  // Money is gated on `approve_money` (false for the PM): the PM
                  // sees "Propose to owner →", never Approve (WC4 / Invariant 4).
                  return canApprove ? (
                    <ApproveChip onClick={() => act(site, risk, brisk.id, 'approve')} />
                  ) : (
                    <ProposeChip onClick={() => act(site, risk, brisk.id, 'approve')} />
                  )
                }
                // Operational exception → the PM's lever is delegation.
                return <AssignChip onClick={() => act(site, risk, brisk.id, 'assign')} />
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  )
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

function ApproveChip({ onClick }: { onClick: () => void }) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-tap items-center gap-1.5 rounded-pill border border-ok/40 bg-card px-3 font-body text-small font-semibold text-ok cstk-animate transition hover:bg-ok/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ok focus-visible:ring-offset-1 focus-visible:ring-offset-card"
    >
      <span className="text-[1.05em] leading-none" aria-hidden>
        <CheckIcon title={t('owner.needs.approve_money')} />
      </span>
      {t('owner.needs.approve_money')}
    </button>
  )
}

function ProposeChip({ onClick }: { onClick: () => void }) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-tap items-center gap-1.5 rounded-pill border border-brand/50 bg-card px-3 font-body text-small font-semibold text-brand-text cstk-animate transition hover:bg-brand/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-card"
    >
      {t('owner.needs.propose')} <span aria-hidden>→</span>
    </button>
  )
}

function AssignChip({ onClick }: { onClick: () => void }): ReactNode {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-tap items-center gap-1.5 rounded-pill border border-info/40 bg-card px-3 font-body text-small font-semibold text-info cstk-animate transition hover:bg-info/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-1 focus-visible:ring-offset-card"
    >
      <span className="text-[1.05em] leading-none" aria-hidden>
        <UserPlusIcon title={t('action.assign')} />
      </span>
      {t('action.assign')} <span aria-hidden>→</span>
    </button>
  )
}
