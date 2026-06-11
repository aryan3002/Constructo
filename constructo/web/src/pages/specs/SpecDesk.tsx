import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useSites } from '../../api/hooks'
import { authApi, type Role } from '../../api/auth'
import { specsApi, type DeskLine, type DeskOut } from '../../api/specs'
import { EmptyState, ErrorState, Spinner } from '../../components/states'
import {
  AppShell,
  H1,
  H2,
  Mono,
  Small,
  StatusPill,
  useRoleTabs,
  type Role as ShellRole,
} from '../../ui'

const STATUS: Record<DeskLine['approval_status'], 'ok' | 'warn' | 'risk'> = {
  approved: 'ok',
  pending: 'warn',
  rejected: 'risk',
}
const STATUS_LABEL: Record<DeskLine['approval_status'], string> = {
  approved: 'Approved',
  pending: 'Pending',
  rejected: 'Rejected',
}

/** ₹ with Indian (lakh/crore) grouping; em-dash for a missing value. */
function inr(value: string | null): string {
  if (value == null) return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function useDesk(siteId: string | null) {
  return useQuery({
    queryKey: ['specs-desk', siteId],
    queryFn: () => specsApi.desk(siteId as string),
    enabled: Boolean(siteId),
  })
}

/**
 * Spec-desk — the Architect's Material Specification Schedule: rooms → spec
 * line items + deterministic costing. AI proposes, a human confirms; unpriced
 * lines are shown honestly (never invented). Mirrors the Reconcile cockpit IA.
 */
export function SpecDesk() {
  const sites = useSites()
  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: () => authApi.me(), retry: false })
  const role: Role = (me.data?.role as Role) ?? 'owner'
  const tabs = useRoleTabs(role as ShellRole)

  const [params, setParams] = useSearchParams()
  const siteParam = params.get('site')
  const siteOptions = sites.data?.items ?? []
  const effectiveSiteId = siteParam ?? siteOptions[0]?.id ?? null
  const desk = useDesk(effectiveSiteId)

  const patchSite = useCallback(
    (id: string) =>
      setParams((p) => {
        const n = new URLSearchParams(p)
        n.set('site', id)
        return n
      }),
    [setParams],
  )

  const data: DeskOut | undefined = desk.data

  return (
    <AppShell role={role as ShellRole} tabs={tabs}>
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <H1>Spec schedule</H1>
            <Small>Materials by room — proposed by AI, confirmed by you.</Small>
          </div>
          {siteOptions.length > 0 && (
            <label className="flex items-center gap-2">
              <Small className="font-semibold !text-text">Site</Small>
              <select
                value={effectiveSiteId ?? ''}
                onChange={(e) => patchSite(e.target.value)}
                className="min-h-tap rounded-control border border-line bg-card px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {siteOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </header>

        {sites.isLoading && <Spinner label="Loading…" />}
        {sites.isError && (
          <ErrorState message="Could not load sites." onRetry={() => sites.refetch()} />
        )}
        {!sites.isLoading && !sites.isError && siteOptions.length === 0 && (
          <EmptyState title="No sites yet" hint="Create a site to start a spec schedule." />
        )}

        {effectiveSiteId && (
          <>
            {desk.isLoading && <Spinner label="Loading spec schedule…" />}
            {desk.isError && (
              <ErrorState
                message="Could not load the spec schedule."
                onRetry={() => desk.refetch()}
              />
            )}

            {data && (
              <>
                {/* Deterministic costing summary — honest about unpriced lines. */}
                <div
                  className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-card px-4 py-3"
                  role="status"
                >
                  <Small className="font-semibold !text-text">Estimated material cost</Small>
                  <Mono className="text-h2 font-semibold text-text">{inr(data.grand_total)}</Mono>
                  {data.excluded_total > 0 ? (
                    <StatusPill status="warn" label={`${data.excluded_total} awaiting a rate`} />
                  ) : (
                    <StatusPill status="ok" label="All priced" />
                  )}
                </div>

                {data.rooms.length === 0 ? (
                  <EmptyState
                    title="No specs yet"
                    hint="Import a schedule, or add a material from a photo."
                  />
                ) : (
                  <div className="space-y-6">
                    {data.rooms.map((room) => (
                      <section
                        key={room.room}
                        className="overflow-hidden rounded-card border border-line bg-card"
                      >
                        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                          <H2 className="!text-text">{room.room}</H2>
                          <div className="flex items-center gap-3">
                            {room.excluded > 0 && (
                              <Small className="text-text-mute">{room.excluded} unpriced</Small>
                            )}
                            <Mono className="font-semibold text-text">{inr(room.total)}</Mono>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="border-b border-line text-text-mute">
                                <th className="px-4 py-2 font-body text-micro font-semibold uppercase tracking-wide">
                                  Element
                                </th>
                                <th className="px-4 py-2 font-body text-micro font-semibold uppercase tracking-wide">
                                  Material
                                </th>
                                <th className="px-4 py-2 text-right font-body text-micro font-semibold uppercase tracking-wide">
                                  Qty
                                </th>
                                <th className="px-4 py-2 text-right font-body text-micro font-semibold uppercase tracking-wide">
                                  Rate
                                </th>
                                <th className="px-4 py-2 text-right font-body text-micro font-semibold uppercase tracking-wide">
                                  Total
                                </th>
                                <th className="px-4 py-2 font-body text-micro font-semibold uppercase tracking-wide">
                                  Status
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {room.lines.map((l) => (
                                <tr key={l.id} className="border-b border-line last:border-0">
                                  <td className="px-4 py-2.5 align-top">
                                    <div className="font-body text-small text-text">{l.element}</div>
                                    {l.location && (
                                      <div className="font-body text-micro text-text-mute">
                                        {l.location}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 align-top">
                                    <div className="font-body text-small text-text">
                                      {[l.brand, l.colour].filter(Boolean).join(' · ') ||
                                        l.category ||
                                        '—'}
                                    </div>
                                    {(l.sku || l.finish) && (
                                      <div className="font-body text-micro text-text-mute">
                                        {[l.sku, l.finish].filter(Boolean).join(' · ')}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 text-right align-top">
                                    <Mono className="text-small text-text">
                                      {l.qty ? `${l.qty}${l.unit ? ' ' + l.unit : ''}` : '—'}
                                    </Mono>
                                  </td>
                                  <td className="px-4 py-2.5 text-right align-top">
                                    <Mono className="text-small text-text">{inr(l.unit_rate)}</Mono>
                                  </td>
                                  <td className="px-4 py-2.5 text-right align-top">
                                    <Mono className="text-small font-semibold text-text">
                                      {inr(l.line_total)}
                                    </Mono>
                                  </td>
                                  <td className="px-4 py-2.5 align-top">
                                    <StatusPill
                                      status={STATUS[l.approval_status]}
                                      label={STATUS_LABEL[l.approval_status]}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
