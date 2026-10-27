// PM "Today" (W3.4) — the project manager's multi-site execution glance.
//
// Not the owner's cash brief: the PM scans every site that needs action and
// either *assigns* the operational exceptions (their job) or leaves the
// money ones to the owner — never approves spend (WC4 / Invariant 4). The
// owner-only note comes straight from the capability gate
// (`useCan('approve_money')` is false for the PM), exactly as in NeedsYou.
//
// Money exceptions (unverified invoice, pending approval) show the owner-only
// note — the owner decides them on Home — plus "Assign" to delegate the
// follow-up; everything else gets "Assign". The chips are shared with the
// owner's Home (DecisionChips), so a recorded decision clears the risk.
// DPR-due weighting (vault 11/03 §5) is deferred until `getHome` exposes a
// per-site DPR signal — we don't invent one.
import { useRoleBadge } from '../../ui/useRoleBadge'
import { useMemo, useState } from 'react'
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
import { toEvidenceItems } from '../../lib/evidence'
import type { DecisionAction } from '../owner/useDecide'
import { ChipRow, PendingUndoBar, useChipActions } from '../owner/DecisionChips'
import { chipsFor } from '../owner/NeedsYou'
import { usePendingHiddenIds } from '../owner/pendingDecisions'
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

const RISK_KIND_KEY: Record<string, TranslationKey> = {
  labor_shortfall: 'brief.risk.labor_shortfall',
  unverified_invoice: 'brief.risk.unverified_invoice',
  pending_approval: 'brief.risk.pending_approval',
  data_quality: 'brief.risk.data_quality',
}

const STATUS_RANK: Record<Status, number> = { risk: 0, warn: 1, info: 2, ok: 3, done: 3 }

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
  // The signed-in person's name and real initials on the avatar.
  const roleBadge = useRoleBadge()
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
      roleBadge={roleBadge}
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
  const [toast, setToast] = useState<{ status: Status; msg: string } | null>(null)
  const { act, dialogs } = useChipActions(date, (o) =>
    setToast({ status: o.status, msg: o.message }),
  )
  // Risks whose money action is waiting in its undo window.
  const hidden = usePendingHiddenIds()

  const ranked = useMemo(() => {
    const all = rankExceptionSites(home.sites)
    return selectedSiteId ? all.filter((s) => s.site_id === selectedSiteId) : all
  }, [home.sites, selectedSiteId])

  function actOn(site: SiteCard, risk: DashRisk, riskKey: string, action: DecisionAction) {
    act(
      {
        type: 'risk',
        siteId: site.site_id,
        riskKey,
        title: risk.message,
        evidenceEventIds: risk.evidence_event_ids,
      },
      action,
      site.name,
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
      <PendingUndoBar />
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
              risks={toBriefRisks(site, t).filter((r) => !hidden.has(r.id))}
              renderActions={(brisk) => {
                const idx = Number(brisk.id.slice(site.site_id.length + 1))
                const risk = site.top_risks[idx]
                if (!risk) return null
                // Money is the owner's call (WC4 / Invariant 4): a PM sees the
                // owner-only note and can still delegate the follow-up.
                return (
                  <ChipRow
                    chips={chipsFor({ type: 'risk', kind: risk.kind }, canApprove)}
                    onAct={(action) => actOn(site, risk, brisk.id, action)}
                  />
                )
              }}
            />
          </li>
        ))}
      </ul>
      {dialogs}
    </section>
  )
}

function toBriefRisks(site: SiteCard, t: ReturnType<typeof useT>): BriefRisk[] {
  return site.top_risks.map((r, i) => ({
    id: `${site.site_id}-${i}`,
    claim: r.message,
    status: r.status as Status,
    detail: t(RISK_KIND_KEY[r.kind] ?? 'brief.risk.data_quality'),
    evidence: toEvidenceItems(r.evidence, r.evidence_event_ids, t),
  }))
}
