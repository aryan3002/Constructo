/**
 * SiteChanges — D3: the designer's field-reality reconciliation tool.
 *
 * Field engineers report site-condition changes; the designer writes a design-
 * impact note, links the change to a drawing revision (closing the field →
 * designer → drawing loop), and resolves it.
 *
 * Props:
 *   siteId? — if undefined, renders an internal site selector from useSites().
 *             D4 will lift this once the workspace shell is in place.
 *
 * Layout:
 *   Header — title + "N new" badge + status filter tabs (All/New/Linked/Resolved)
 *   Feed   — SiteChangeCard list (newest first), 4-state (loading/empty/error/data)
 *   Drawer — SiteChangeDrawer on card click
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { siteChangesApi } from '../../api/siteChanges'
import type { SiteChange, SiteChangeStatus } from '../../api/siteChanges'
import { qk } from '../../api/queryKeys'
import { useSites } from '../../api/hooks'
import { useT } from '../../i18n'
import { H1, Small } from '../../ui'
import { Spinner, ErrorState, EmptyState } from '../../components/states'
import { SiteChangeCard } from './SiteChangeCard'
import { SiteChangeDrawer } from './SiteChangeDrawer'

// ---------------------------------------------------------------------------
// Status filter type (null = All)
// ---------------------------------------------------------------------------

type FilterStatus = SiteChangeStatus | null

// ---------------------------------------------------------------------------
// Filter tab bar
// ---------------------------------------------------------------------------

interface FilterTabsProps {
  active: FilterStatus
  onChange: (s: FilterStatus) => void
  newCount: number
}

const TABS: { label: string; value: FilterStatus; key: string }[] = [
  { label: 'sitechanges.filter.all', value: null, key: 'all' },
  { label: 'sitechanges.filter.new', value: 'new', key: 'new' },
  { label: 'sitechanges.filter.linked', value: 'linked', key: 'linked' },
  { label: 'sitechanges.filter.resolved', value: 'resolved', key: 'resolved' },
]

function FilterTabs({ active, onChange, newCount }: FilterTabsProps) {
  const t = useT()
  return (
    <div
      role="tablist"
      aria-label="Filter site changes"
      className="flex gap-1 rounded-card bg-paper border border-line p-1"
    >
      {TABS.map((tab) => {
        const isActive = active === tab.value
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(tab.value)}
            className={[
              'inline-flex items-center gap-1.5 rounded-control px-3 py-1.5',
              'font-body text-small font-semibold transition min-h-[44px]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              'cstk-animate',
              isActive
                ? 'bg-card text-text shadow-card'
                : 'text-text-mute hover:text-text hover:bg-card/60',
            ].join(' ')}
          >
            {t(tab.label as 'sitechanges.filter.all')}
            {tab.value === null && newCount > 0 && (
              <span
                aria-label={t('sitechanges.count.needs_you', { n: newCount })}
                className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-warn px-1 font-body text-micro font-bold text-warn-fg leading-none"
              >
                {newCount}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SiteChanges({ siteId: externalSiteId }: { siteId?: string }) {
  const t = useT()
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(null)
  const [selectedChange, setSelectedChange] = useState<SiteChange | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // ── Site selection (standalone mode) ──────────────────────────────────────
  const { data: sitesPage, isLoading: sitesLoading, isError: sitesError } = useSites()
  const [localSiteId, setLocalSiteId] = useState<string>('')

  const sites = sitesPage?.items ?? []

  // Resolve the effective site ID: prefer externalSiteId, then local selection, then first site
  const effectiveSiteId: string | undefined =
    externalSiteId ??
    (localSiteId || (sites.length > 0 ? sites[0].id : undefined))

  // ── Site changes query ────────────────────────────────────────────────────
  const {
    data: changes,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: qk.siteChanges({ siteId: effectiveSiteId, status: filterStatus ?? undefined }),
    queryFn: () =>
      siteChangesApi.list({
        siteId: effectiveSiteId,
        status: filterStatus ?? undefined,
      }),
    enabled: Boolean(effectiveSiteId),
  })

  // Count of "new" changes for the header badge (always from unfiltered context)
  const { data: allChanges } = useQuery({
    queryKey: qk.siteChanges({ siteId: effectiveSiteId }),
    queryFn: () => siteChangesApi.list({ siteId: effectiveSiteId }),
    enabled: Boolean(effectiveSiteId),
  })
  const newCount = allChanges?.filter((c) => c.status === 'new').length ?? 0

  // ── Event handlers ────────────────────────────────────────────────────────
  const handleCardClick = (change: SiteChange) => {
    setSelectedChange(change)
    setDrawerOpen(true)
  }

  const handleDrawerClose = () => {
    setDrawerOpen(false)
    // keep selectedChange until drawer finishes closing to avoid jump
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Site selector (standalone mode — no externalSiteId from D4 yet)
  const showSiteSelector = !externalSiteId

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto px-4 py-6">
      {/* ── Page header ── */}
      <div>
        <div className="flex items-baseline gap-3">
          <H1 as="h1">{t('sitechanges.title')}</H1>
          {newCount > 0 && (
            <span
              data-testid="new-count-badge"
              className="inline-flex items-center gap-1 rounded-pill bg-warn/15 border border-warn/30 px-2 py-0.5 font-body text-micro font-semibold text-warn"
            >
              {t('sitechanges.count.needs_you', { n: newCount })}
            </span>
          )}
        </div>
        <Small className="mt-1">{t('sitechanges.subtitle')}</Small>
      </div>

      {/* ── Site selector (standalone) ── */}
      {showSiteSelector && (
        <div>
          {sitesLoading && (
            <Small>{t('sitechanges.sites_loading')}</Small>
          )}
          {sitesError && (
            <Small className="text-risk">{t('sitechanges.sites_error')}</Small>
          )}
          {!sitesLoading && !sitesError && sites.length === 0 && (
            <EmptyState
              title={t('sitechanges.no_sites.title')}
              hint={t('sitechanges.no_sites.hint')}
            />
          )}
          {!sitesLoading && !sitesError && sites.length > 0 && (
            <div>
              <label
                htmlFor="sc-site-select"
                className="block font-body text-small font-semibold text-text mb-1"
              >
                {t('sitechanges.site_label')}
              </label>
              <select
                id="sc-site-select"
                data-testid="site-select"
                value={localSiteId || effectiveSiteId || ''}
                onChange={(e) => setLocalSiteId(e.target.value)}
                className={[
                  'w-full rounded-control border border-line bg-card px-3 py-2',
                  'font-body text-small text-text min-h-tap',
                  'focus:outline-none focus:ring-2 focus:ring-primary',
                  'cstk-animate',
                ].join(' ')}
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* ── Status filter ── */}
      {effectiveSiteId && (
        <FilterTabs
          active={filterStatus}
          onChange={setFilterStatus}
          newCount={newCount}
        />
      )}

      {/* ── Feed ── */}
      {effectiveSiteId && (
        <>
          {isLoading && <Spinner label={t('sitechanges.loading')} />}

          {isError && (
            <ErrorState
              message={t('sitechanges.error')}
              onRetry={refetch}
              retryLabel={t('action.retry')}
            />
          )}

          {!isLoading && !isError && changes && changes.length === 0 && (
            <EmptyState
              title={t('sitechanges.empty.title')}
              hint={t('sitechanges.empty.hint')}
            />
          )}

          {!isLoading && !isError && changes && changes.length > 0 && (
            <div
              role="feed"
              aria-label="Site changes"
              className="flex flex-col gap-3"
            >
              {changes.map((change) => (
                <SiteChangeCard
                  key={change.id}
                  change={change}
                  onClick={() => handleCardClick(change)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Detail Drawer ── */}
      <SiteChangeDrawer
        change={selectedChange}
        open={drawerOpen}
        onClose={handleDrawerClose}
      />
    </div>
  )
}
