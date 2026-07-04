import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { todayIso } from '../../api/config'
import { qk } from '../../api/queryKeys'
import { dashboardApi } from '../../api/dashboard'
import { activityApi, type ActivityItem } from '../../api/activity'
import { useSites } from '../../api/hooks'
import { useT } from '../../i18n'
import { ErrorState, Spinner } from '../../components/states'
import { SetupChecklist } from './SetupChecklist'
import { HonestHero } from '../../features/owner/HonestHero'
import { NeedsYou } from '../../features/owner/NeedsYou'
import { ActivityStream } from '../../features/owner/ActivityStream'
import { NewProjectModal } from '../../features/owner/NewProjectModal'
import { ProjectsStrip } from '../../features/owner/ProjectsStrip'
import { useOpenHomeownerChannel } from '../../features/chat/useOpenHomeownerChannel'
import { AppShell, type SiteSummary, type Status } from '../../ui'

/**
 * OwnerHome (activity-first) — the owner lands on a running feed of what
 * changed, not a 3-column brief. Composition, top-to-bottom priority:
 *   HonestHero (summary-driven headline) · NeedsYou (genuine pending
 *   decisions) · ActivityStream (the primary union feed) · ProjectsStrip
 *   (project cards).
 * A cold start (no sites / zero activity — `dashboardApi.getHome`'s
 * `cold_start` flag) still routes to the SetupChecklist instead of a blank
 * composition.
 * This page stays thin: it owns the hero-summary query (`qk.activitySummary()`
 * — NOT `qk.activity()`, which is a separate cache entry per the query-key
 * factory's own docstring), the site selection the panels share, and the
 * AppShell chrome; each panel owns its own data.
 */
export function OwnerHome() {
  const t = useT()
  const date = todayIso()
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [showNewProject, setShowNewProject] = useState(false)
  const openHomeownerChannel = useOpenHomeownerChannel()

  // Cold-start gate (unchanged source: the dashboard home aggregation).
  const home = useQuery({ queryKey: qk.home(date), queryFn: () => dashboardApi.getHome(date) })

  // Hero summary — a single tiny activity page gives the counts + newest ts.
  // Deliberately its own cache entry (qk.activitySummary()): ActivityStream's
  // useInfiniteQuery lives under qk.activity(selectedSiteId), and the two do
  // NOT share invalidation (see queryKeys.ts).
  const summaryQ = useQuery({
    queryKey: qk.activitySummary(),
    queryFn: () => activityApi.page({ limit: 1 }),
  })

  // Sites → names for NeedsYou + the AppShell switcher + ProjectsStrip cards.
  const sitesQ = useSites()
  const siteNames = useMemo(
    () => Object.fromEntries((sitesQ.data?.items ?? []).map((s) => [s.id, s.name])),
    [sitesQ.data?.items],
  )
  const siteSummaries = useMemo<SiteSummary[]>(
    () =>
      (sitesQ.data?.items ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        status: (s.status as Status) ?? 'ok',
      })),
    [sitesQ.data?.items],
  )

  const lastActivityAt = summaryQ.data?.items[0]?.occurred_at ?? null

  // A request-kind activity row's Reply button opens the project's homeowner
  // 1:1 channel; the row itself still links to the full Requests surface.
  function handleReply(item: ActivityItem) {
    openHomeownerChannel.mutate(item.site_id)
  }

  return (
    <AppShell
      role="owner"
      sites={siteSummaries}
      selectedSiteId={selectedSiteId}
      onSelectSite={setSelectedSiteId}
      roleBadge={{ name: 'Owner', initials: 'OW' }}
    >
      <HonestHero summary={summaryQ.data?.summary} lastActivityAt={lastActivityAt} date={date} />

      <div className="mt-6">
        {home.isLoading ? (
          <Spinner label={t('owner.home.loading')} />
        ) : home.isError ? (
          <ErrorState
            message={(home.error as Error)?.message ?? t('owner.home.error')}
            onRetry={() => home.refetch()}
          />
        ) : home.data?.cold_start ? (
          <>
            <SetupChecklist
              steps={home.data.setup_checklist}
              onAddProject={() => setShowNewProject(true)}
            />
            <NewProjectModal open={showNewProject} onClose={() => setShowNewProject(false)} />
          </>
        ) : (
          <div className="flex flex-col gap-8">
            <NeedsYou date={date} selectedSiteId={selectedSiteId} siteNames={siteNames} />
            <ActivityStream selectedSiteId={selectedSiteId} onReply={handleReply} />
            <ProjectsStrip sites={sitesQ.data?.items ?? []} />
          </div>
        )}
      </div>
    </AppShell>
  )
}
