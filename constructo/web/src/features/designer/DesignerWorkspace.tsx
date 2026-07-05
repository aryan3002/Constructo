/**
 * DesignerWorkspace — D4: the unified /designer cockpit.
 *
 * Unifies all designer surfaces into one workspace shell:
 *   • Selections (D2) — material proposal → owner → release lifecycle
 *   • Site changes (D3) — field-reality reconciliation tool
 *   • Intake — placeholder for D5 (design brief surface)
 *
 * Architecture:
 *   - Site selection is LIFTED HERE: one SiteSwitcher at the top, siteId flows
 *     down to each tab surface. Tabs no longer own their own site selector.
 *   - Tab state lives in the URL via ?tab= (selections|site-changes|intake),
 *     defaulting to "selections" so the primary surface always opens fresh.
 *   - Tab panels are role="tabpanel" with correct aria-labelledby + aria-controls.
 *   - TabBar (new reusable primitive) handles roving tabIndex + arrow-key navigation.
 */

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useMeRole } from '../../auth/useCan'
import { designApi } from '../../api/design'
import { useSites } from '../../api/hooks'
import { useT } from '../../i18n'
import {
  AppShell,
  H1,
  Small,
  TabBar,
  useRoleTabs,
  type Role,
  type SiteSummary,
} from '../../ui'
import { Selections } from './Selections'
import { SiteChanges } from './SiteChanges'
import { Intake } from './Intake'

// ---------------------------------------------------------------------------
// Tab IDs
// ---------------------------------------------------------------------------

const TAB_SELECTIONS = 'selections'
const TAB_SITE_CHANGES = 'site-changes'
const TAB_INTAKE = 'intake'
const VALID_TABS = [TAB_SELECTIONS, TAB_SITE_CHANGES, TAB_INTAKE] as const
type TabId = (typeof VALID_TABS)[number]

function isValidTab(s: string | null): s is TabId {
  return VALID_TABS.includes(s as TabId)
}

// ---------------------------------------------------------------------------
// DesignerWorkspace
// ---------------------------------------------------------------------------

export function DesignerWorkspace() {
  const t = useT()

  // Role + tabs
  const role: Role = (useMeRole() ?? 'architect') as Role
  const shellTabs = useRoleTabs(role)

  // Site selection — lifted to the workspace level
  const sitesQuery = useSites()
  const siteOptions: SiteSummary[] = (sitesQuery.data?.items ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    status: (s.status === 'active' ? 'ok' : s.status === 'paused' ? 'warn' : 'ok') as SiteSummary['status'],
  }))

  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(
    siteOptions[0]?.id ?? null,
  )

  // Keep selectedSiteId defaulted once sites load (avoids null on first render)
  const effectiveSiteId: string | undefined =
    (selectedSiteId ?? siteOptions[0]?.id) || undefined

  // Tab state in URL
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab: TabId = isValidTab(tabParam) ? tabParam : TAB_SELECTIONS

  function setActiveTab(id: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', id)
        return next
      },
      { replace: true },
    )
  }

  function handleViewSelections() {
    setActiveTab(TAB_SELECTIONS)
  }

  // Inbox badge — suffix the Intake tab with the count of things waiting on
  // the designer. Best-effort: any fetch failure (incl. a backend without the
  // endpoint yet → 404) leaves the plain label.
  const inboxQuery = useQuery({
    queryKey: ['design', 'inbox-summary'],
    queryFn: () => designApi.inboxSummary(),
    retry: false,
  })
  const inboxCount = inboxQuery.isSuccess
    ? inboxQuery.data.briefs_awaiting_signoff +
      inboxQuery.data.answered_clarifications +
      inboxQuery.data.deferred_conflicts
    : 0

  // Tab definitions for the TabBar (not the AppShell nav)
  const internalTabs = [
    { id: TAB_SELECTIONS, label: t('designer.tab.selections') },
    { id: TAB_SITE_CHANGES, label: t('designer.tab.site_changes') },
    {
      id: TAB_INTAKE,
      label:
        inboxCount > 0
          ? `${t('designer.tab.intake')} (${inboxCount})`
          : t('designer.tab.intake'),
    },
  ]

  return (
    <AppShell
      role={role}
      tabs={shellTabs}
      sites={siteOptions}
      selectedSiteId={selectedSiteId}
      onSelectSite={(id) => setSelectedSiteId(id)}
    >
      <div className="space-y-0">
        {/* Page title */}
        <header className="mb-4">
          <H1>{t('designer.title')}</H1>
          <Small className="text-text-mute">
            {siteOptions.find((s) => s.id === effectiveSiteId)?.name ?? ''}
          </Small>
        </header>

        {/* Internal workspace tabs */}
        <TabBar
          tabs={internalTabs}
          active={activeTab}
          onChange={setActiveTab}
          ariaLabel={t('designer.title')}
          className="mb-6"
        />

        {/* Tab panels */}
        <div
          id={`panel-${TAB_SELECTIONS}`}
          role="tabpanel"
          aria-labelledby={`tab-${TAB_SELECTIONS}`}
          tabIndex={0}
          hidden={activeTab !== TAB_SELECTIONS}
          className="focus-visible:outline-none"
        >
          {activeTab === TAB_SELECTIONS && (
            <div className="max-w-3xl mx-auto">
              <Selections siteId={effectiveSiteId} />
            </div>
          )}
        </div>

        <div
          id={`panel-${TAB_SITE_CHANGES}`}
          role="tabpanel"
          aria-labelledby={`tab-${TAB_SITE_CHANGES}`}
          tabIndex={0}
          hidden={activeTab !== TAB_SITE_CHANGES}
          className="focus-visible:outline-none"
        >
          {activeTab === TAB_SITE_CHANGES && (
            <div className="max-w-3xl mx-auto">
              <SiteChanges siteId={effectiveSiteId} />
            </div>
          )}
        </div>

        <div
          id={`panel-${TAB_INTAKE}`}
          role="tabpanel"
          aria-labelledby={`tab-${TAB_INTAKE}`}
          tabIndex={0}
          hidden={activeTab !== TAB_INTAKE}
          className="focus-visible:outline-none"
        >
          {activeTab === TAB_INTAKE && (
            <div className="max-w-3xl mx-auto">
              <Intake siteId={effectiveSiteId} onViewSelections={handleViewSelections} />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
