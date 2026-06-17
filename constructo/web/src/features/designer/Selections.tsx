/**
 * Selections — D2: the Selections Cockpit.
 *
 * The CENTERPIECE of the designer workspace. Implements the full
 * propose→commit lifecycle for material selections:
 *   designer drafts → routes to owner → owner approves/returns → designer releases
 *
 * Layout:
 *   1. Header: site selector (standalone mode) + summary chips (RollupChips)
 *   2. Master: room-grouped list (SpecRow) with keyboard nav (useCockpitKeys)
 *   3. Spec detail Drawer (SelectionDrawer) with role-shaped actions
 *
 * Role shaping — the propose→commit spine:
 *   canPropose = owner | pm | architect  — route + edit + release
 *   canCommit  = owner only             — approve + return
 *   Authority is surfaced as identity: never show-and-disable.
 *
 * Props:
 *   siteId? — if undefined, renders an internal site selector and picks the
 *             first site by default. D4 will lift this as the workspace shell
 *             passes the active site down.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { specsApi } from '../../api/specs'
import type { DeskLine } from '../../api/specs'
import { qk } from '../../api/queryKeys'
import { useMeRole } from '../../auth/useCan'
import { useSites } from '../../api/hooks'
import { Spinner, ErrorState, EmptyState } from '../../components/states'
import { useT } from '../../i18n'
import { H1, H2, Small, Mono } from '../../ui'
import { useCockpitKeys } from '../reconcile/useCockpitKeys'
import { formatRupees } from '../../lib/money'
import { RollupChips } from './RollupChips'
import { SpecRow } from './SpecRow'
import { SelectionDrawer } from './SelectionDrawer'

// ---------------------------------------------------------------------------
// ₹ helper (for room subtotals in the section header)
// ---------------------------------------------------------------------------

/** Null-safe ₹ formatter: returns em-dash for missing/non-finite values. */
function inr(value: string | null | undefined): string {
  if (value == null) return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return formatRupees(n)
}

// ---------------------------------------------------------------------------
// Query hook — separate so D4 can reuse
// ---------------------------------------------------------------------------

function useSpecDesk(siteId: string | null) {
  return useQuery({
    queryKey: qk.specDesk(siteId ?? '__none__'),
    queryFn: () => specsApi.desk(siteId as string),
    enabled: Boolean(siteId),
  })
}

// ---------------------------------------------------------------------------
// Selections component
// ---------------------------------------------------------------------------

export interface SelectionsProps {
  siteId?: string
}

export function Selections({ siteId: propSiteId }: SelectionsProps) {
  const t = useT()
  const role = useMeRole()
  const sites = useSites()

  // --- Site selector state (standalone mode) ---
  const siteOptions = sites.data?.items ?? []
  const [localSiteId, setLocalSiteId] = useState<string | null>(null)

  // Effective site: prop takes precedence; if standalone, use local selection
  // or fall back to the first available site.
  const effectiveSiteId: string | null =
    propSiteId ?? localSiteId ?? siteOptions[0]?.id ?? null

  // --- Desk query ---
  const desk = useSpecDesk(effectiveSiteId)

  // --- Selection / drawer state ---
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Flatten all line IDs in render order for cockpit keyboard navigation
  const allLineIds: string[] = desk.data?.rooms.flatMap((r) => r.lines.map((l) => l.id)) ?? []

  // Roving focus refs — one per line in allLineIds order
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([])

  // Reset rowRefs on list length change
  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, allLineIds.length)
  }, [allLineIds.length])

  // Find the line and its room for the drawer
  function findLineAndRoom(id: string): { line: DeskLine; room: string } | null {
    if (!desk.data) return null
    for (const r of desk.data.rooms) {
      const line = r.lines.find((l) => l.id === id)
      if (line) return { line, room: r.room }
    }
    return null
  }

  const selectedEntry = selectedId ? findLineAndRoom(selectedId) : null

  // --- Keyboard nav ---
  const handleMove = useCallback((id: string) => {
    setSelectedId(id)
    // Roving focus: focus + scroll the moved-to row
    const el = rowRefs.current.find((r) => r?.getAttribute('data-spec-id') === id)
    if (el) {
      el.focus()
      el.scrollIntoView?.({ block: 'nearest' })
    }
  }, [])

  const handleOpen = useCallback((id: string) => {
    setSelectedId(id)
    setDrawerOpen(true)
  }, [])

  useCockpitKeys({
    keys: allLineIds,
    selectedKey: selectedId,
    onMove: handleMove,
    onOpen: handleOpen,
    // Disable cockpit keys while the drawer (and its own inputs) is open
    enabled: !drawerOpen,
  })

  // --- Standalone site selector ---
  const isStandalone = !propSiteId

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <H1>{t('selections.title')}</H1>
          <Small>{t('selections.subtitle')}</Small>
        </div>

        {/* Site selector (standalone mode only) */}
        {isStandalone && siteOptions.length > 0 && (
          <label className="flex items-center gap-2">
            <Small className="font-semibold !text-text">{t('selections.site_label')}</Small>
            <select
              value={effectiveSiteId ?? ''}
              onChange={(e) => setLocalSiteId(e.target.value || null)}
              aria-label={t('selections.site_label')}
              className={[
                'min-h-tap rounded-control border border-line bg-card px-3',
                'font-body text-body text-text',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              ].join(' ')}
            >
              <option value="" disabled>
                {t('selections.site_placeholder')}
              </option>
              {siteOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {/* ── Four-state for sites loading ── */}
      {isStandalone && sites.isLoading && <Spinner label={t('selections.sites_loading')} />}
      {isStandalone && sites.isError && (
        <ErrorState
          message={t('selections.sites_error')}
          onRetry={() => sites.refetch()}
          retryLabel={t('action.retry')}
        />
      )}
      {isStandalone && !sites.isLoading && !sites.isError && siteOptions.length === 0 && (
        <EmptyState
          title={t('selections.no_sites.title')}
          hint={t('selections.no_sites.hint')}
        />
      )}

      {/* ── Four-state for desk query ── */}
      {effectiveSiteId && (
        <>
          {desk.isLoading && <Spinner label={t('selections.loading')} />}
          {desk.isError && (
            <ErrorState
              message={t('selections.error')}
              onRetry={() => desk.refetch()}
              retryLabel={t('action.retry')}
            />
          )}

          {desk.data && desk.data.rooms.length === 0 && (
            <EmptyState
              title={t('selections.empty.title')}
              hint={t('selections.empty.hint')}
            />
          )}

          {desk.data && desk.data.rooms.length > 0 && (
            <>
              {/* Summary chips */}
              <RollupChips desk={desk.data} />

              {/* Keyboard hint */}
              <Small className="!text-text-mute">{t('selections.kbd_hint')}</Small>

              {/* Room-grouped master list */}
              <div className="space-y-6" role="region" aria-label={t('selections.title')}>
                {desk.data.rooms.map((room) => (
                  <section
                    key={room.room}
                    aria-label={room.room}
                    className="overflow-hidden rounded-card border border-line bg-card"
                  >
                    {/* Room header */}
                    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                      <H2 className="!text-text">{room.room}</H2>
                      <div className="flex items-center gap-3">
                        {room.excluded > 0 && (
                          <Small className="text-text-mute">
                            {t('specdesk.unpriced', { count: room.excluded })}
                          </Small>
                        )}
                        <Mono className="font-semibold text-text">{inr(room.total)}</Mono>
                      </div>
                    </div>

                    {/* Line items */}
                    <div className="overflow-x-auto">
                      <table
                        className="w-full text-left"
                        aria-label={room.room}
                      >
                        <thead>
                          <tr
                            className="border-b border-line text-text-mute"
                          >
                            <th
                              scope="col"
                              className="px-4 py-2 font-body text-micro font-semibold uppercase tracking-wide"
                            >
                              {t('specdesk.col.element')}
                            </th>
                            <th
                              scope="col"
                              className="px-4 py-2 font-body text-micro font-semibold uppercase tracking-wide"
                            >
                              {t('specdesk.col.material')}
                            </th>
                            <th
                              scope="col"
                              className="px-4 py-2 text-right font-body text-micro font-semibold uppercase tracking-wide"
                            >
                              {t('specdesk.col.qty')}
                            </th>
                            <th
                              scope="col"
                              className="px-4 py-2 text-right font-body text-micro font-semibold uppercase tracking-wide"
                            >
                              {t('specdesk.col.rate')}
                            </th>
                            <th
                              scope="col"
                              className="px-4 py-2 text-right font-body text-micro font-semibold uppercase tracking-wide"
                            >
                              {t('specdesk.col.total')}
                            </th>
                            <th
                              scope="col"
                              className="px-4 py-2 font-body text-micro font-semibold uppercase tracking-wide"
                            >
                              {t('specdesk.col.status')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {room.lines.map((line) => {
                            const globalIdx = allLineIds.indexOf(line.id)
                            return (
                              <SpecRow
                                key={line.id}
                                line={line}
                                selected={selectedId === line.id}
                                onClick={() => {
                                  setSelectedId(line.id)
                                  setDrawerOpen(true)
                                }}
                                rowRef={(el) => { rowRefs.current[globalIdx] = el }}
                              />
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Spec detail drawer ── */}
      {selectedEntry && effectiveSiteId && (
        <SelectionDrawer
          open={drawerOpen}
          onClose={() => {
            setDrawerOpen(false)
          }}
          lineId={selectedEntry.line.id}
          room={selectedEntry.room}
          siteId={effectiveSiteId}
          role={role}
        />
      )}
    </div>
  )
}
