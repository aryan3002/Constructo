import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useSites } from '../../api/hooks'
import { authApi, type Role } from '../../api/auth'
import { reconcileApi, type ReconcileItem } from '../../api/reconcile'
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
import { useT } from '../../i18n'
import { useCockpitKeys } from '../../features/reconcile/useCockpitKeys'
import { ReconcileDetail } from './ReconcileDetail'
import { ReconcileRow } from './ReconcileRow'
import { compareStatus, formatInr, isException } from './helpers'

function useReconcile(siteId: string | null) {
  return useQuery({
    queryKey: ['reconcile', siteId],
    queryFn: () => reconcileApi.list(siteId as string),
    enabled: Boolean(siteId),
  })
}

/**
 * Reconcile screen — the accountant's master-detail view of deliveries vs
 * invoices, and a phone-friendly stacked variant on narrow screens. Leads with
 * exceptions (amount-at-risk first), never a flat log.
 */
export function ReconcilePage() {
  const t = useT()
  const sites = useSites()
  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: () => authApi.me(), retry: false })
  // Reconcile is home for accountant + procurement; default to accountant tabs.
  const role: Role = me.data?.role === 'procurement' ? 'procurement' : 'accountant'
  const tabs = useRoleTabs(role as ShellRole)

  // URL-as-state (04 §4.1): /reconcile?site=…&status=mismatch&sel=… restores the
  // exact pane on refresh and is shareable. Cursor scans update with `replace`
  // (no history pollution); explicit site change / open use `push`.
  const [params, setParams] = useSearchParams()
  const siteParam = params.get('site')
  const onlyExceptions = params.get('status') === 'exceptions'
  const selectedKey = params.get('sel')

  const patchParams = useCallback(
    (patch: Record<string, string | null>, opts?: { replace?: boolean }) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v == null) next.delete(k)
            else next.set(k, v)
          }
          return next
        },
        { replace: opts?.replace ?? false },
      )
    },
    [setParams],
  )

  // Default to the first visible site once sites load (no render-time setState).
  const siteOptions = sites.data?.items ?? []
  const effectiveSiteId = siteParam ?? siteOptions[0]?.id ?? null

  const recon = useReconcile(effectiveSiteId)

  const allItems = recon.data?.items ?? []
  const items = useMemo(() => {
    const filtered = onlyExceptions ? allItems.filter((i) => isException(i.status)) : allItems
    return [...filtered].sort(
      (a, b) =>
        compareStatus(a.status, b.status) || b.amount_at_risk - a.amount_at_risk,
    )
  }, [allItems, onlyExceptions])

  const selected: ReconcileItem | null =
    items.find((i) => i.key === selectedKey) ?? items[0] ?? null

  // Keyboard cockpit (W2.3): ↑/↓ scan (replace), Enter opens (push). H/F land
  // with the optimistic hold/flag slice (W2.4).
  const moveSel = useCallback(
    (key: string) => patchParams({ sel: key }, { replace: true }),
    [patchParams],
  )
  const openSel = useCallback(
    (key: string) => patchParams({ sel: key }, { replace: false }),
    [patchParams],
  )
  useCockpitKeys({
    keys: items.map((i) => i.key),
    selectedKey: selected?.key ?? null,
    onMove: moveSel,
    onOpen: openSel,
    enabled: items.length > 0,
  })

  const summary = recon.data?.summary
  const exceptionCount = (summary?.needs_approval ?? 0) + (summary?.mismatch ?? 0)

  return (
    <AppShell role={role as ShellRole} tabs={tabs}>
      <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <H1>{t('reconcile.title')}</H1>
          <Small>{t('reconcile.subtitle')}</Small>
        </div>
        {siteOptions.length > 0 && (
          <label className="flex items-center gap-2">
            <Small className="font-semibold !text-text">{t('nav.sites')}</Small>
            <select
              value={effectiveSiteId ?? ''}
              onChange={(e) => patchParams({ site: e.target.value, sel: null })}
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

      {sites.isLoading && <Spinner label={t('common.loading')} />}
      {sites.isError && (
        <ErrorState message={t('common.error')} onRetry={() => sites.refetch()} />
      )}
      {!sites.isLoading && !sites.isError && siteOptions.length === 0 && (
        <EmptyState title={t('reconcile.pick_site')} hint={t('reconcile.pick_site_hint')} />
      )}

      {effectiveSiteId && (
        <>
          {recon.isLoading && <Spinner label={t('reconcile.loading')} />}
          {recon.isError && (
            <ErrorState message={t('reconcile.error')} onRetry={() => recon.refetch()} />
          )}

          {recon.data && (
            <>
              {/* Exceptions-first summary banner */}
              {summary && (summary.total_amount_at_risk > 0 || exceptionCount > 0) ? (
                <div
                  className="flex flex-wrap items-center gap-3 rounded-card border border-risk/30 bg-risk/10 px-4 py-3"
                  role="status"
                >
                  <StatusPill status="risk" label={t('reconcile.at_risk')} />
                  <Mono className="text-h2 font-semibold text-risk">
                    {formatInr(summary.total_amount_at_risk)}
                  </Mono>
                  <Small>
                    {t('reconcile.summary_at_risk', {
                      amount: formatInr(summary.total_amount_at_risk),
                      count: exceptionCount,
                    })}
                  </Small>
                </div>
              ) : summary && allItems.length > 0 ? (
                <div role="status">
                  <StatusPill status="ok" label={t('reconcile.all_clear')} />
                </div>
              ) : null}

              {allItems.length === 0 ? (
                <EmptyState
                  title={t('reconcile.empty_title')}
                  hint={t('reconcile.empty_hint')}
                />
              ) : (
                <>
                  {/* Filter toggle + keyboard legend (the cockpit advertises its keys). */}
                  <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="filter">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={!onlyExceptions}
                      onClick={() => patchParams({ status: null }, { replace: true })}
                      className={`min-h-tap rounded-pill border px-4 font-body text-small font-semibold cstk-animate ${
                        !onlyExceptions
                          ? 'border-primary bg-primary/10 text-primary-deep'
                          : 'border-line bg-card text-text-mute'
                      }`}
                    >
                      {t('reconcile.filter.all', { count: allItems.length })}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={onlyExceptions}
                      onClick={() => patchParams({ status: 'exceptions' }, { replace: true })}
                      className={`min-h-tap rounded-pill border px-4 font-body text-small font-semibold cstk-animate ${
                        onlyExceptions
                          ? 'border-primary bg-primary/10 text-primary-deep'
                          : 'border-line bg-card text-text-mute'
                      }`}
                    >
                      {t('reconcile.filter.exceptions', { count: exceptionCount })}
                    </button>
                    <Mono className="ml-auto hidden text-micro text-text-mute md:inline">
                      {t('reconcile.kbd_hint')}
                    </Mono>
                  </div>

                  {/* Master-detail (md+) / stacked (phone) */}
                  <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_1fr]">
                    <ul className="space-y-2" aria-label={t('reconcile.title')}>
                      {items.map((item) => (
                        <li key={item.key}>
                          <ReconcileRow
                            item={item}
                            selected={selected?.key === item.key}
                            onSelect={() => openSel(item.key)}
                          />
                          {/* Phone: expand the detail inline under the row. */}
                          {selected?.key === item.key && (
                            <div className="mt-2 md:hidden">
                              <ReconcileDetail item={item} onHeld={() => recon.refetch()} />
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>

                    {/* Desktop detail pane */}
                    <div className="hidden md:block">
                      {selected ? (
                        <ReconcileDetail
                          key={selected.key}
                          item={selected}
                          onHeld={() => recon.refetch()}
                        />
                      ) : (
                        <div className="rounded-card border border-dashed border-line p-8 text-center">
                          <H2 className="!text-text-mute">{t('reconcile.detail_heading')}</H2>
                          <Small>{t('reconcile.select_prompt')}</Small>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
      </div>
    </AppShell>
  )
}
