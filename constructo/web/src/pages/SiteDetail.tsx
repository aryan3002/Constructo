import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { todayIso } from '../api/config'
import { useSite, useSiteEvents } from '../api/hooks'
import { authApi, type Role } from '../api/auth'
import { EventTimeline } from '../components/EventTimeline'
import { EmptyState, ErrorState, Spinner } from '../components/states'
import { useT } from '../i18n'
import {
  AppShell,
  Display,
  H2,
  Small,
  StatusPill,
  useRoleTabs,
  type Role as ShellRole,
} from '../ui'

const STATUS_TO_SPINE: Record<string, 'ok' | 'warn' | 'info'> = {
  active: 'ok',
  paused: 'warn',
  completed: 'info',
}

/**
 * Site detail — retrofitted onto the Blueprint kit. Header carries the site
 * status as a spine pill; the day's events render through the design-system
 * EventTimeline (one-tap evidence). Reachable by tapping a site in the list.
 */
export function SiteDetail() {
  const t = useT()
  const { id = '' } = useParams()
  const date = todayIso()
  const site = useSite(id)
  const events = useSiteEvents(id, date)
  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: () => authApi.me(), retry: false })
  const role: Role = me.data?.role ?? 'owner'
  const tabs = useRoleTabs(role as ShellRole)

  return (
    <AppShell role={role as ShellRole} tabs={tabs}>
      <Link
        to="/sites"
        className="inline-flex min-h-tap items-center font-body text-small font-semibold text-primary-deep hover:underline"
      >
        ← {t('site.back')}
      </Link>

      <div className="mt-3">
        {site.isLoading && <Spinner label={t('site.loading')} />}
        {site.isError && (
          <ErrorState
            message={(site.error as Error)?.message ?? t('site.error')}
            onRetry={() => site.refetch()}
            retryLabel={t('action.retry')}
          />
        )}
        {site.data && (
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Display as="h1" className="!text-h1">
                {site.data.name}
              </Display>
              <Small className="mt-1 block">
                {site.data.location} · {site.data.type}
              </Small>
            </div>
            <StatusPill
              status={STATUS_TO_SPINE[site.data.status] ?? 'info'}
              size="sm"
              label={site.data.status}
            />
          </header>
        )}
      </div>

      <section className="mt-7">
        <div className="flex items-center gap-2">
          <H2>{t('site.timeline.title')}</H2>
          {events.data?.usedMock && (
            <StatusPill status="info" size="sm" label={t('site.mock_badge')} />
          )}
        </div>

        <div className="mt-3">
          {events.isLoading && <Spinner label={t('site.timeline.loading')} />}
          {events.isError && (
            <ErrorState
              message={(events.error as Error)?.message ?? t('site.timeline.error')}
              onRetry={() => events.refetch()}
              retryLabel={t('action.retry')}
            />
          )}
          {!events.isLoading &&
            !events.isError &&
            events.data &&
            events.data.events.length === 0 && (
              <EmptyState
                title={t('site.timeline.empty.title')}
                hint={t('site.timeline.empty.hint')}
              />
            )}
          {!events.isLoading &&
            !events.isError &&
            events.data &&
            events.data.events.length > 0 && (
              <EventTimeline events={events.data.events} />
            )}
        </div>
      </section>
    </AppShell>
  )
}
