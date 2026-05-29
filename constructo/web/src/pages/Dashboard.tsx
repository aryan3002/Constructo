import { useMemo, useState } from 'react'
import { todayIso } from '../api/config'
import { useBrief, useRunBrief } from '../api/hooks'
import { EmptyState, ErrorState, Spinner } from '../components/states'
import { formatDate } from '../lib/format'
import type { BriefSite, Risk } from '../api/types'
import {
  AppShell,
  BriefCommandCard,
  Button,
  H1,
  Mono,
  Small,
  StatusPill,
  severityToStatus,
  type BriefRisk,
  type SiteSummary,
  type Status,
} from '../ui'

const STATUS_RANK: Record<Status, number> = { risk: 0, warn: 1, info: 2, ok: 3 }

/** Worst (lowest-rank) status across a site's risks; ok if none. */
function worstStatus(risks: Risk[]): Status {
  return risks.reduce<Status>((worst, r) => {
    const s = severityToStatus(r.severity)
    return STATUS_RANK[s] < STATUS_RANK[worst] ? s : worst
  }, 'ok')
}

function toBriefRisks(site: BriefSite): BriefRisk[] {
  return site.top_risks.map((r, i) => ({
    id: `${site.site_id}-${i}`,
    claim: r.message,
    status: severityToStatus(r.severity),
    detail: r.kind.replace(/_/g, ' '),
    // Evidence ids are surfaced as message slots; full proof wiring lands later.
    evidence: r.evidence_event_ids.map((id) => ({
      kind: 'message' as const,
      label: 'Linked evidence',
      detail: id,
    })),
  }))
}

export function Dashboard() {
  const date = todayIso()
  const { data: brief, isLoading, isError, error, refetch } = useBrief(date)
  const runBrief = useRunBrief()
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [lastAction, setLastAction] = useState<string | null>(null)

  const sites = brief?.payload.sites ?? []

  const siteSummaries = useMemo<SiteSummary[]>(
    () =>
      sites.map((s) => ({
        id: s.site_id,
        name: s.name,
        status: worstStatus(s.top_risks),
        meta: `${s.top_risks.length} risk${s.top_risks.length === 1 ? '' : 's'}`,
      })),
    [sites],
  )

  const visibleSites = selectedSiteId
    ? sites.filter((s) => s.site_id === selectedSiteId)
    : sites

  function handleRun() {
    runBrief.mutate({ date })
  }

  return (
    <AppShell
      role="owner"
      sites={siteSummaries}
      selectedSiteId={selectedSiteId}
      onSelectSite={setSelectedSiteId}
      notificationCount={sites.reduce((n, s) => n + s.top_risks.length, 0)}
      roleBadge={{ name: 'Owner', initials: 'OW' }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <H1>Today’s Brief</H1>
          <Mono className="text-small text-text-mute">{formatDate(date)}</Mono>
        </div>
        <Button variant="primary" onClick={handleRun} disabled={runBrief.isPending}>
          {runBrief.isPending ? 'Running…' : 'Run brief now'}
        </Button>
      </div>

      {runBrief.isError && (
        <p className="mt-3">
          <StatusPill
            status="risk"
            label={`Could not run brief: ${(runBrief.error as Error).message}`}
          />
        </p>
      )}
      {runBrief.isSuccess && (
        <p className="mt-3">
          <StatusPill status="ok" label={`Brief generated (${runBrief.data.brief_id})`} />
        </p>
      )}
      {lastAction && (
        <Small className="mt-2 block" role="status">
          Last action: <Mono>{lastAction}</Mono>
        </Small>
      )}

      <div className="mt-6 space-y-4">
        {isLoading && <Spinner label="Loading today’s brief…" />}

        {isError && (
          <ErrorState
            message={(error as Error)?.message ?? 'Failed to load brief.'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && visibleSites.length === 0 && (
          <EmptyState
            title="No brief for today yet"
            hint="Generate one to see per-site risks and counts."
            action={
              <Button variant="primary" onClick={handleRun} disabled={runBrief.isPending}>
                {runBrief.isPending ? 'Running…' : 'Run brief now'}
              </Button>
            }
          />
        )}

        {!isLoading &&
          !isError &&
          visibleSites.map((site) => (
            <BriefCommandCard
              key={site.site_id}
              siteName={site.name}
              siteStatus={worstStatus(site.top_risks)}
              meta={`${site.counts.attendance} present · ${site.counts.deliveries} del · ${site.counts.issues} issues`}
              risks={toBriefRisks(site)}
              onAction={(riskId, action) => setLastAction(`${action} → ${riskId}`)}
            />
          ))}
      </div>
    </AppShell>
  )
}
