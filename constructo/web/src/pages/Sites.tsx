import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSites } from '../api/hooks'
import { type Role } from '../api/auth'
import { useMeRole } from '../auth/useCan'
import { EmptyState, ErrorState, Spinner } from '../components/states'
import { useT, type TranslationKey } from '../i18n'
import {
  AppShell,
  Button,
  Display,
  H2,
  Small,
  StatusPill,
  useRoleTabs,
  type Role as ShellRole,
  type SiteSummary,
  type Status,
} from '../ui'
import { NewProjectModal } from '../features/owner/NewProjectModal'

const STATUS_TO_SPINE: Record<string, Status> = {
  active: 'ok',
  paused: 'warn',
  completed: 'info',
}

const STATUS_KEY: Record<string, TranslationKey> = {
  active: 'sites.status.active',
  paused: 'sites.status.paused',
  completed: 'sites.status.completed',
}

/**
 * Sites list — retrofitted onto the Blueprint kit (status spine, --paper cards,
 * SiteSwitcher-shaped chrome) from the old generic-Tailwind page. Status-first,
 * tappable to each site's detail/timeline. Reachable from the Sites tab.
 */
export function Sites() {
  const t = useT()
  const { data, isLoading, isError, error, refetch } = useSites()
  const role: Role = useMeRole() ?? 'owner'
  const tabs = useRoleTabs(role as ShellRole)
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const items = data?.items ?? []
  const siteSummaries = useMemo<SiteSummary[]>(
    () =>
      items.map((s) => ({
        id: s.id,
        name: s.name,
        status: STATUS_TO_SPINE[s.status] ?? 'info',
        meta: s.location,
      })),
    [items],
  )

  const visible = selectedSiteId
    ? items.filter((s) => s.id === selectedSiteId)
    : items

  return (
    <AppShell
      role={role as ShellRole}
      tabs={tabs}
      sites={siteSummaries}
      selectedSiteId={selectedSiteId}
      onSelectSite={setSelectedSiteId}
    >
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <Display as="h1" className="!text-h1">
            {t('sites.title')}
          </Display>
          <Small className="mt-1 block">{t('sites.subtitle')}</Small>
        </div>
        <Button variant="primary" type="button" onClick={() => setNewOpen(true)}>
          {t('projects.new.cta')}
        </Button>
      </header>

      <NewProjectModal open={newOpen} onClose={() => setNewOpen(false)} />

      {isLoading && <Spinner label={t('sites.loading')} />}
      {isError && (
        <ErrorState
          message={(error as Error)?.message ?? t('sites.error')}
          onRetry={() => refetch()}
          retryLabel={t('action.retry')}
        />
      )}
      {!isLoading && !isError && items.length === 0 && (
        <EmptyState title={t('sites.empty.title')} hint={t('sites.empty.hint')} />
      )}
      {!isLoading && !isError && visible.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((site) => (
            <li key={site.id}>
              <Link
                to={`/sites/${site.id}`}
                className="block min-h-tap rounded-card border border-line bg-card p-4 shadow-card cstk-animate transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex items-start justify-between gap-2">
                  <H2 as="h3" className="!text-h2">
                    {site.name}
                  </H2>
                  <StatusPill
                    status={STATUS_TO_SPINE[site.status] ?? 'info'}
                    size="sm"
                    label={t(STATUS_KEY[site.status] ?? 'sites.status.active')}
                  />
                </div>
                <Small className="mt-1 block">{site.location}</Small>
                <Small className="mt-0.5 block uppercase tracking-wide !text-text-mute">
                  {site.type}
                </Small>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  )
}
