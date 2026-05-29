import { Link } from 'react-router-dom'
import { useSites } from '../api/hooks'
import { EmptyState, ErrorState, Spinner } from '../components/states'

const statusClasses: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-amber-100 text-amber-800',
  completed: 'bg-slate-200 text-slate-700',
}

export function Sites() {
  const { data, isLoading, isError, error, refetch } = useSites()

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Sites</h1>

      <div className="mt-6">
        {isLoading && <Spinner label="Loading sites…" />}
        {isError && (
          <ErrorState
            message={(error as Error)?.message ?? 'Failed to load sites.'}
            onRetry={() => refetch()}
          />
        )}
        {!isLoading && !isError && data && data.items.length === 0 && (
          <EmptyState title="No sites yet" hint="Sites will appear here once added." />
        )}
        {!isLoading && !isError && data && data.items.length > 0 && (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.items.map((site) => (
              <li key={site.id}>
                <Link
                  to={`/sites/${site.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-900">{site.name}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        statusClasses[site.status] ?? 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {site.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{site.location}</p>
                  <p className="mt-0.5 text-xs uppercase tracking-wide text-slate-400">
                    {site.type}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
