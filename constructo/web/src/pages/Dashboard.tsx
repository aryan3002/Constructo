import { api } from '../api/client'
import { todayIso } from '../api/config'
import { useBrief, useRunBrief } from '../api/hooks'
import { BriefCard } from '../components/BriefCard'
import { EmptyState, ErrorState, Spinner } from '../components/states'
import { formatDate } from '../lib/format'

export function Dashboard() {
  const date = todayIso()
  const { data: brief, isLoading, isError, error, refetch } = useBrief(date)
  const runBrief = useRunBrief()

  function handleRun() {
    runBrief.mutate({ company_id: api.companyId, date })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Today’s Brief</h1>
          <p className="text-sm text-slate-500">{formatDate(date)}</p>
        </div>
        <button
          onClick={handleRun}
          disabled={runBrief.isPending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {runBrief.isPending ? 'Running…' : 'Run brief now'}
        </button>
      </div>

      {runBrief.isError && (
        <p className="mt-3 text-sm text-red-600">
          Could not run brief: {(runBrief.error as Error).message}
        </p>
      )}
      {runBrief.isSuccess && (
        <p className="mt-3 text-sm text-green-700">
          Brief generated ({runBrief.data.brief_id}).
        </p>
      )}

      <div className="mt-6">
        {isLoading && <Spinner label="Loading today’s brief…" />}

        {isError && (
          <ErrorState
            message={(error as Error)?.message ?? 'Failed to load brief.'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && (!brief || brief.payload.sites.length === 0) && (
          <EmptyState
            title="No brief for today yet"
            hint="Generate one to see per-site risks and counts."
            action={
              <button
                onClick={handleRun}
                disabled={runBrief.isPending}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {runBrief.isPending ? 'Running…' : 'Run brief now'}
              </button>
            }
          />
        )}

        {!isLoading && !isError && brief && brief.payload.sites.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {brief.payload.sites.map((site) => (
              <BriefCard key={site.site_id} site={site} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
