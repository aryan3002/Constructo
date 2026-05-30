import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todayIso } from '../../api/config'
import {
  dashboardApi,
  type DecisionAction,
  type OwnerHome as OwnerHomeData,
  type PulseTile,
  type SiteCard,
} from '../../api/dashboard'
import { useT } from '../../i18n'
import { formatDate } from '../../lib/format'
import { ErrorState, Spinner } from '../../components/states'
import { PulseGrid } from './PulseGrid'
import { SetupChecklist } from './SetupChecklist'
import {
  AppShell,
  BriefCommandCard,
  Body,
  Display,
  EvidenceCard,
  H2,
  Mono,
  Small,
  StatusDot,
  StatusPill,
  type BriefAction,
  type BriefRisk,
  type SiteSummary,
  type Status,
} from '../../ui'
import type { TranslationKey } from '../../i18n'

const RISK_KIND_KEY: Record<string, TranslationKey> = {
  labor_shortfall: 'brief.risk.labor_shortfall',
  unverified_invoice: 'brief.risk.unverified_invoice',
  pending_approval: 'brief.risk.pending_approval',
  data_quality: 'brief.risk.data_quality',
}

const ACTION_KEY: Record<BriefAction, TranslationKey> = {
  approve: 'action.approve',
  hold: 'action.hold',
  assign: 'action.assign',
}

function useOwnerHome(date: string) {
  return useQuery({
    queryKey: ['owner-home', date],
    queryFn: () => dashboardApi.getHome(date),
  })
}

export function OwnerHome() {
  const t = useT()
  const date = todayIso()
  const qc = useQueryClient()
  const { data, isLoading, isError, error, refetch } = useOwnerHome(date)
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ status: Status; msg: string } | null>(null)

  const decide = useMutation({
    mutationFn: dashboardApi.createDecision,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['owner-home'] }),
  })

  const home = data
  const sites = home?.sites ?? []

  const siteSummaries = useMemo<SiteSummary[]>(
    () =>
      sites.map((s) => ({
        id: s.site_id,
        name: s.name,
        status: s.status as Status,
        meta:
          s.top_risks.length > 0
            ? `${s.top_risks.length + s.risk_overflow} risk${
                s.top_risks.length + s.risk_overflow === 1 ? '' : 's'
              }`
            : undefined,
      })),
    [sites],
  )

  const visibleSites = selectedSiteId
    ? sites.filter((s) => s.site_id === selectedSiteId)
    : sites

  function handleAction(site: SiteCard, riskId: string, action: BriefAction) {
    const risk = site.top_risks.find((_, i) => `${site.site_id}-${i}` === riskId)
    decide.mutate(
      {
        site_id: site.site_id,
        action: action as DecisionAction,
        title: risk?.message ?? t(ACTION_KEY[action]),
        evidence_event_ids: risk?.evidence_event_ids ?? [],
      },
      {
        onSuccess: () =>
          setToast({
            status: 'ok',
            msg: t('owner.home.action_done', {
              action: t(ACTION_KEY[action]),
              site: site.name,
            }),
          }),
        onError: () =>
          setToast({ status: 'risk', msg: t('owner.home.action_failed') }),
      },
    )
  }

  const headline = renderHeadline(home, t)

  return (
    <AppShell
      role="owner"
      sites={siteSummaries}
      selectedSiteId={selectedSiteId}
      onSelectSite={setSelectedSiteId}
      notificationCount={home?.needs_attention_count ?? 0}
      roleBadge={{ name: 'Owner', initials: 'OW' }}
    >
      <header>
        <Small className="!text-text-mute">{t('owner.home.title')}</Small>
        <Display className="mt-1">{headline}</Display>
        <Mono className="mt-1 block text-small text-text-mute">{formatDate(date)}</Mono>
      </header>

      {toast && (
        <p className="mt-3" role="status">
          <StatusPill status={toast.status} label={toast.msg} />
        </p>
      )}

      <div className="mt-6 space-y-6">
        {isLoading && <Spinner label={t('owner.home.loading')} />}

        {isError && (
          <ErrorState
            message={(error as Error)?.message ?? t('owner.home.error')}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && home && (
          <>
            {home.cold_start ? (
              <SetupChecklist steps={home.setup_checklist} />
            ) : (
              <OwnerHomeBody
                home={home}
                visibleSites={visibleSites}
                selectedSiteId={selectedSiteId}
                onSelectSite={setSelectedSiteId}
                onAction={handleAction}
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}

function renderHeadline(home: OwnerHomeData | undefined, t: ReturnType<typeof useT>) {
  if (!home || home.needs_attention_count === 0) return t('owner.home.all_calm')
  const key =
    home.needs_attention_count === 1
      ? 'owner.home.needs_you_one'
      : 'owner.home.needs_you_many'
  return t(key, {
    count: home.needs_attention_count,
    sites: home.sites_total,
  })
}

function OwnerHomeBody({
  home,
  visibleSites,
  selectedSiteId,
  onSelectSite,
  onAction,
}: {
  home: OwnerHomeData
  visibleSites: SiteCard[]
  selectedSiteId: string | null
  onSelectSite: (id: string | null) => void
  onAction: (site: SiteCard, riskId: string, action: BriefAction) => void
}) {
  const t = useT()
  const [evidenceTile, setEvidenceTile] = useState<PulseTile | null>(null)

  if (home.needs_attention_count === 0) {
    return (
      <>
        <section
          aria-label={t('owner.home.all_calm')}
          className="rounded-sheet border border-line bg-card p-6 text-center shadow-card"
        >
          <StatusPill status="ok" label={t('owner.home.all_calm')} />
          <Body className="mt-2 !text-text-mute">{t('owner.home.all_calm_hint')}</Body>
        </section>
        <RollupAndPulse
          home={home}
          selectedSiteId={selectedSiteId}
          onSelectSite={onSelectSite}
          evidenceTile={evidenceTile}
          setEvidenceTile={setEvidenceTile}
        />
      </>
    )
  }

  return (
    <>
      {/* Above the fold: the command cards (exceptions-first). */}
      {visibleSites.map((site) => (
        <BriefCommandCard
          key={site.site_id}
          siteName={site.name}
          siteStatus={site.status as Status}
          meta={`${site.counts.attendance} present · ${site.counts.deliveries} del · ${site.counts.issues} issues`}
          risks={toBriefRisks(site, t)}
          onAction={(riskId, action) => onAction(site, riskId, action)}
        />
      ))}

      {/* Below the fold: roll-up strip + 2x2 pulse grid. */}
      <RollupAndPulse
        home={home}
        selectedSiteId={selectedSiteId}
        onSelectSite={onSelectSite}
        evidenceTile={evidenceTile}
        setEvidenceTile={setEvidenceTile}
      />
    </>
  )
}

function RollupAndPulse({
  home,
  selectedSiteId,
  onSelectSite,
  evidenceTile,
  setEvidenceTile,
}: {
  home: OwnerHomeData
  selectedSiteId: string | null
  onSelectSite: (id: string | null) => void
  evidenceTile: PulseTile | null
  setEvidenceTile: (t: PulseTile | null) => void
}) {
  const t = useT()
  // The pulse grid follows the SiteSwitcher context: aggregate across all sites
  // when none is selected, else just the selected site's tiles.
  const focusSite =
    home.sites.find((s) => s.site_id === selectedSiteId) ?? home.sites[0]
  const pulseTiles = selectedSiteId
    ? (focusSite?.pulse ?? [])
    : aggregatePulse(home.sites)

  return (
    <>
      {/* Site roll-up strip (wired to the SiteSwitcher selection). */}
      <section aria-labelledby="owner-rollup-heading">
        <H2 id="owner-rollup-heading" className="mb-2">
          {t('owner.home.rollup_title')}
        </H2>
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {home.sites.map((s) => {
            const active = s.site_id === selectedSiteId
            return (
              <li key={s.site_id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectSite(active ? null : s.site_id)}
                  className={`flex min-h-tap items-center gap-2 rounded-pill border px-3 font-body text-small font-semibold cstk-animate transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    active
                      ? 'border-primary bg-paper text-text'
                      : 'border-line bg-card text-text-mute hover:bg-paper'
                  }`}
                >
                  <StatusDot status={s.status as Status} />
                  <span className="truncate">{s.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {/* 2x2 pulse grid — each tile tappable to its evidence. */}
      <section aria-labelledby="owner-pulse-heading">
        <H2 id="owner-pulse-heading" className="mb-2">
          {t('owner.home.pulse_title')}
        </H2>
        <PulseGrid tiles={pulseTiles} onTileTap={setEvidenceTile} />

        {evidenceTile && (
          <div className="mt-3">
            <EvidenceCard
              claim={t(`owner.pulse.${evidenceTile.kind}` as TranslationKey)}
              status={evidenceTile.status as Status}
              detail={`${evidenceTile.evidence_event_ids.length} linked`}
              defaultOpen
              evidence={evidenceTile.evidence_event_ids.map((id) => ({
                kind: 'message' as const,
                label: t('brief.evidence.linked'),
                detail: id,
              }))}
            />
          </div>
        )}
      </section>
    </>
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

const STATUS_RANK: Record<Status, number> = { risk: 0, warn: 1, info: 2, ok: 3 }

/** Aggregate the same-kind tiles across all sites for the "All Sites" view. */
function aggregatePulse(sites: SiteCard[]): PulseTile[] {
  const kinds = ['cash', 'labor', 'material', 'progress'] as const
  return kinds.map((kind) => {
    const tiles = sites
      .map((s) => s.pulse.find((p) => p.kind === kind))
      .filter((p): p is PulseTile => Boolean(p))
    const status = tiles.reduce<Status>((worst, p) => {
      const s = p.status as Status
      return STATUS_RANK[s] < STATUS_RANK[worst] ? s : worst
    }, 'ok')
    const value = tiles.reduce<number | null>((sum, p) => {
      if (p.value == null) return sum
      return (sum ?? 0) + p.value
    }, null)
    const evidence = tiles.flatMap((p) => p.evidence_event_ids)
    return { kind, status, value, evidence_event_ids: evidence, facts: {} }
  })
}
