import { Link, useParams } from 'react-router-dom'
import { todayIso } from '../api/config'
import { useSite, useSiteEvents } from '../api/hooks'
import { EventTimeline } from '../components/EventTimeline'
import { EmptyState, ErrorState, Spinner } from '../components/states'

export function SiteDetail() {
  const { id = '' } = useParams()
  const date = todayIso()
  const site = useSite(id)
  const events = useSiteEvents(id, date)

  return (
    <div>
      <Link to="/sites" className="text-sm text-brand-600 hover:underline">
        ← Back to sites
      </Link>

      {/* Site header */}
      <div className="mt-3">
        {site.isLoading && <Spinner label="Loading site…" />}
        {site.isError && (
          <ErrorState
            message={(site.error as Error)?.message ?? 'Failed to load site.'}
            onRetry={() => site.refetch()}
          />
        )}
        {site.data && (
          <header>
            <h1 className="text-2xl font-bold text-slate-900">{site.data.name}</h1>
            <p className="text-sm text-slate-500">
              {site.data.location} · {site.data.type} · {site.data.status}
            </p>
          </header>
        )}
      </div>

      {/* Event timeline */}
      <section className="mt-6">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Event timeline</h2>
          {events.data?.usedMock && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
              Mock events
            </span>
          )}
        </div>

        <div className="mt-3">
          {events.isLoading && <Spinner label="Loading events…" />}
          {events.isError && (
            <ErrorState
              message={(events.error as Error)?.message ?? 'Failed to load events.'}
              onRetry={() => events.refetch()}
            />
          )}
          {!events.isLoading &&
            !events.isError &&
            events.data &&
            events.data.events.length === 0 && (
              <EmptyState
                title="No events for today"
                hint="Events from site WhatsApp groups will show up here."
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
    </div>
  )
}
