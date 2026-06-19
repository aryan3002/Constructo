import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useSites } from '../../api/hooks'
import { type Role } from '../../api/auth'
import { useMeRole } from '../../auth/useCan'
import { specsApi, type DeskLine, type DeskOut } from '../../api/specs'
import { EmptyState, ErrorState, Spinner } from '../../components/states'
import { useT } from '../../i18n'
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
  const t = useT()
  const STATUS_LABEL: Record<DeskLine['approval_status'], string> = {
    approved: t('specdesk.status.approved'),
    pending: t('specdesk.status.pending'),
    rejected: t('specdesk.status.rejected'),
  }
  const sites = useSites()
  const role: Role = useMeRole() ?? 'owner'
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
            <H1>{t('specdesk.title')}</H1>
            <Small>{t('specdesk.subtitle')}</Small>
          </div>
          {siteOptions.length > 0 && (
            <label className="flex items-center gap-2">
              <Small className="font-semibold !text-text">{t('specdesk.site_label')}</Small>
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

        {sites.isLoading && <Spinner label={t('specdesk.sites_loading')} />}
        {sites.isError && (
          <ErrorState message={t('specdesk.sites_error')} onRetry={() => sites.refetch()} />
        )}
        {!sites.isLoading && !sites.isError && siteOptions.length === 0 && (
          <EmptyState title={t('specdesk.empty_title')} hint={t('specdesk.empty_hint')} />
        )}

        {effectiveSiteId && (
          <>
            {desk.isLoading && <Spinner label={t('specdesk.loading')} />}
            {desk.isError && (
              <ErrorState
                message={t('specdesk.error')}
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
                  <Small className="font-semibold !text-text">{t('specdesk.cost_label')}</Small>
                  <Mono className="text-h2 font-semibold text-text">{inr(data.grand_total)}</Mono>
                  {data.excluded_total > 0 ? (
                    <StatusPill status="warn" label={t('specdesk.awaiting_rate', { count: data.excluded_total })} />
                  ) : (
                    <StatusPill status="ok" label={t('specdesk.all_priced')} />
                  )}
                </div>

                {data.rooms.length === 0 ? (
                  <EmptyState
                    title={t('specdesk.no_specs_title')}
                    hint={t('specdesk.no_specs_hint')}
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
                              <Small className="text-text-mute">{t('specdesk.unpriced', { count: room.excluded })}</Small>
                            )}
                            <Mono className="font-semibold text-text">{inr(room.total)}</Mono>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="border-b border-line text-text-mute">
                                <th className="px-4 py-2 font-body text-micro font-semibold uppercase tracking-wide">
                                  {t('specdesk.col.element')}
                                </th>
                                <th className="px-4 py-2 font-body text-micro font-semibold uppercase tracking-wide">
                                  {t('specdesk.col.material')}
                                </th>
                                <th className="px-4 py-2 text-right font-body text-micro font-semibold uppercase tracking-wide">
                                  {t('specdesk.col.qty')}
                                </th>
                                <th className="px-4 py-2 text-right font-body text-micro font-semibold uppercase tracking-wide">
                                  {t('specdesk.col.rate')}
                                </th>
                                <th className="px-4 py-2 text-right font-body text-micro font-semibold uppercase tracking-wide">
                                  {t('specdesk.col.total')}
                                </th>
                                <th className="px-4 py-2 font-body text-micro font-semibold uppercase tracking-wide">
                                  {t('specdesk.col.status')}
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
