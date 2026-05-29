import { useState } from 'react'
import { useCreateGroup, useGroups, useSites } from '../api/hooks'
import { EmptyState, ErrorState, Spinner } from '../components/states'

export function Groups() {
  const groups = useGroups()
  const sites = useSites()
  const createGroup = useCreateGroup()

  const [externalGroupId, setExternalGroupId] = useState('')
  const [label, setLabel] = useState('')
  const [siteId, setSiteId] = useState('')
  const [source, setSource] = useState('whatsapp')

  const siteName = (id: string) =>
    sites.data?.items.find((s) => s.id === id)?.name ?? id

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    createGroup.mutate(
      { external_group_id: externalGroupId, source, site_id: siteId, label },
      {
        onSuccess: () => {
          setExternalGroupId('')
          setLabel('')
          setSiteId('')
        },
      },
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Mapping form */}
      <section>
        <h1 className="text-2xl font-bold text-slate-900">WhatsApp Groups</h1>
        <p className="mt-1 text-sm text-slate-500">
          Map a WhatsApp group to a site so its messages flow into the timeline.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div>
            <label htmlFor="label" className="block text-sm font-medium text-slate-700">
              Label
            </label>
            <input
              id="label"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Green Valley — Site Updates"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label
              htmlFor="external_group_id"
              className="block text-sm font-medium text-slate-700"
            >
              External group ID
            </label>
            <input
              id="external_group_id"
              required
              value={externalGroupId}
              onChange={(e) => setExternalGroupId(e.target.value)}
              placeholder="1203630000000000@g.us"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label htmlFor="site_id" className="block text-sm font-medium text-slate-700">
              Site
            </label>
            <select
              id="site_id"
              required
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="" disabled>
                Select a site…
              </option>
              {sites.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="source" className="block text-sm font-medium text-slate-700">
              Source
            </label>
            <input
              id="source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {createGroup.isError && (
            <p role="alert" className="text-sm text-red-600">
              {(createGroup.error as Error).message}
            </p>
          )}
          {createGroup.isSuccess && (
            <p className="text-sm text-green-700">Group mapped.</p>
          )}

          <button
            type="submit"
            disabled={createGroup.isPending}
            className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {createGroup.isPending ? 'Saving…' : 'Map group'}
          </button>
        </form>
      </section>

      {/* List */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900">Mapped groups</h2>
        <div className="mt-3">
          {groups.isLoading && <Spinner label="Loading groups…" />}
          {groups.isError && (
            <ErrorState
              message={(groups.error as Error)?.message ?? 'Failed to load groups.'}
              onRetry={() => groups.refetch()}
            />
          )}
          {!groups.isLoading &&
            !groups.isError &&
            groups.data &&
            groups.data.items.length === 0 && (
              <EmptyState title="No groups mapped yet" hint="Add one using the form." />
            )}
          {!groups.isLoading &&
            !groups.isError &&
            groups.data &&
            groups.data.items.length > 0 && (
              <ul className="space-y-3">
                {groups.data.items.map((g) => (
                  <li
                    key={g.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <p className="font-medium text-slate-900">{g.label}</p>
                    <p className="mt-1 text-sm text-slate-500">→ {siteName(g.site_id)}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">
                      {g.source} · {g.external_group_id}
                    </p>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </section>
    </div>
  )
}
