/**
 * DocumentsPage — D6 elevation (drawings register flagship upgrade).
 *
 * Route: /settings/documents
 * Gate: owner | pm | architect (manage_settings)
 *
 * Two tabs:
 *   Drawings — append-only register with:
 *     • DrawingDetailDrawer (click → detail, version timeline, linked changes)
 *     • KindFilter pill bar
 *     • Kind badge on each DrawingRow
 *     • Sort control (newest/oldest/title/site)
 *     • Keyboard nav (↑/↓/Enter/u)
 *     • EmptyState with CTA action slot
 *     • Drag-drop on New drawing file input
 *     • Supersede-confirm guard in the drawer
 *   Documents — company documents with expiry pills (D6b scope — unchanged).
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  drawingsApi,
  describeUploadError,
  DRAWING_KINDS,
  type DrawingRegisterRow,
  type DrawingKind,
} from '../../api/drawings'
import { qk } from '../../api/queryKeys'
import { useCan, useMeRole } from '../../auth/useCan'
import { useSites } from '../../api/hooks'
import { useT } from '../../i18n'
import { AppShell, Body, Button, H1, H2, Small, useRoleTabs, type Role as ShellRole } from '../../ui'
import { EmptyState, ErrorState, Spinner } from '../../components/states'
import { formatDate } from '../../lib/format'
import { DocumentsTab } from './DocumentsTab'
import { DrawingDetailDrawer } from './DrawingDetailDrawer'
import { KindFilter, type FilterKind } from './KindFilter'
import { KindBadge } from './DrawingDetailDrawer'
import { SaveHint } from './SaveHint'

// ---------------------------------------------------------------------------
// Upload phase state
// ---------------------------------------------------------------------------

type UploadPhase = 'idle' | 'uploading' | 'unavailable' | 'error'

// ---------------------------------------------------------------------------
// Sort options
// ---------------------------------------------------------------------------

type SortKey = 'newest' | 'oldest' | 'title_az' | 'site'

function sortRows(rows: DrawingRegisterRow[], sort: SortKey): DrawingRegisterRow[] {
  return [...rows].sort((a, b) => {
    switch (sort) {
      case 'newest':
        return b.published_at.localeCompare(a.published_at)
      case 'oldest':
        return a.published_at.localeCompare(b.published_at)
      case 'title_az':
        return a.title.localeCompare(b.title)
      case 'site':
        return a.site_name.localeCompare(b.site_name) || a.title.localeCompare(b.title)
      default:
        return 0
    }
  })
}

// ---------------------------------------------------------------------------
// NewDrawing — top-level form for uploading a brand-new drawing (drag-drop)
// ---------------------------------------------------------------------------

interface NewDrawingProps {
  onDone: () => void
  onCancel: () => void
}

function NewDrawing({ onDone, onCancel }: NewDrawingProps) {
  const t = useT()
  const { data: sitesData } = useSites()
  const sites = sitesData?.items ?? []

  const [siteId, setSiteId] = useState(sites[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<DrawingKind>('plan')
  const [version, setVersion] = useState('')
  const [changeNote, setChangeNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  // The sites list loads asynchronously; if it arrives AFTER this form mounted,
  // `siteId` would stay '' (the initializer ran with an empty list) while the
  // <select> visually shows the first site — leaving Save disabled. Default the
  // site once the list is available and nothing is chosen yet.
  useEffect(() => {
    if (!siteId && sites.length > 0) setSiteId(sites[0].id)
  }, [siteId, sites])

  async function handleSave() {
    if (!file || !siteId || !title.trim() || !version.trim()) return

    setPhase('uploading')
    setErrorMsg(null)

    try {
      const ticket = await drawingsApi.presign(siteId, file.name, file.type)

      if (ticket.mode === 'unavailable') {
        setPhase('unavailable')
        return
      }
      if (!ticket.put_url) {
        // 'presigned' without a URL shouldn't happen, but never PUT to null.
        setPhase('error')
        setErrorMsg(t('drawings.error_upload'))
        return
      }

      await drawingsApi.putToR2(ticket.put_url, file)
      await drawingsApi.publish({
        site_id: siteId,
        title: title.trim(),
        version: version.trim(),
        file_url: ticket.key,
        kind,
        change_note: changeNote.trim() || null,
        // No supersedes_id — brand-new drawing.
      })

      setPhase('idle')
      onDone()
    } catch (err) {
      setPhase('error')
      const info = describeUploadError(err)
      setErrorMsg(
        info.kind === 'save'
          ? t('drawings.error_save', { detail: info.detail })
          : t('drawings.error_upload'),
      )
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  const canSave =
    Boolean(file) &&
    siteId.length > 0 &&
    title.trim().length > 0 &&
    version.trim().length > 0 &&
    phase !== 'uploading'

  return (
    <div
      className={[
        'mb-5 rounded-card border-2 bg-paper p-4 transition cstk-animate',
        dragging ? 'border-primary bg-primary/5' : 'border-dashed border-line',
      ].join(' ')}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="flex flex-col gap-3">
        {/* Site selector */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="new-drawing-site"
            className="font-body text-small font-semibold text-text-mute"
          >
            {t('documents.site_label')}
          </label>
          <select
            id="new-drawing-site"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="min-h-tap rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Drawing title */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="new-drawing-title"
            className="font-body text-small font-semibold text-text-mute"
          >
            {t('documents.title_label')}
          </label>
          <input
            id="new-drawing-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Ground Floor Plan"
            className="min-h-tap rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        {/* Type (drawing kind) */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="new-drawing-kind"
            className="font-body text-small font-semibold text-text-mute"
          >
            {t('documents.kind_label')}
          </label>
          <select
            id="new-drawing-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as DrawingKind)}
            className="min-h-tap rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {DRAWING_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`drawings.kind.${k}` as Parameters<typeof t>[0])}
              </option>
            ))}
          </select>
        </div>

        {/* Version */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="new-drawing-version"
            className="font-body text-small font-semibold text-text-mute"
          >
            {t('documents.version_label')}
          </label>
          <input
            id="new-drawing-version"
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="e.g. v1"
            className="min-h-tap rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        {/* Change note (optional) */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="new-drawing-note"
            className="font-body text-small font-semibold text-text-mute"
          >
            {t('documents.change_note')}
          </label>
          <input
            id="new-drawing-note"
            type="text"
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            placeholder="Optional"
            className="min-h-tap rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        {/* File input + drop hint */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="new-drawing-file"
            className="font-body text-small font-semibold text-text-mute"
          >
            {t('documents.file_label')}
          </label>
          <input
            id="new-drawing-file"
            type="file"
            accept=".pdf,.dwg,.dxf,.png,.jpg"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="font-body text-small text-text"
          />
          {!file && (
            <Small className="text-text-mute">{t('drawings.drop.hint')}</Small>
          )}
          {file && (
            <Small className="font-semibold text-text">{file.name}</Small>
          )}
        </div>

        {phase === 'unavailable' && (
          <p role="alert" className="font-body text-small text-text-mute">
            {t('documents.upload_unavailable')}
          </p>
        )}
        {phase === 'error' && errorMsg && (
          <p role="alert" className="font-body text-small text-risk">
            {errorMsg}
          </p>
        )}

        <SaveHint
          hidden={phase === 'uploading' || phase === 'error' || phase === 'unavailable'}
          checks={[
            { ok: siteId.length > 0, msg: t('documents.need_site') },
            { ok: title.trim().length > 0, msg: t('documents.need_title') },
            { ok: version.trim().length > 0, msg: t('documents.need_version') },
            { ok: Boolean(file), msg: t('documents.need_file') },
          ]}
        />

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            disabled={!canSave}
            onClick={() => void handleSave()}
          >
            {phase === 'uploading' ? t('documents.uploading') : t('documents.save')}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            {t('documents.cancel')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DrawingRow — one current drawing (click opens the detail drawer)
// ---------------------------------------------------------------------------

interface DrawingRowProps {
  current: DrawingRegisterRow
  isSelected: boolean
  onClick: () => void
  kindLabel: string
  rowRef?: React.Ref<HTMLLIElement>
}

function DrawingRow({ current, isSelected, onClick, kindLabel, rowRef }: DrawingRowProps) {
  const t = useT()

  return (
    <li
      ref={rowRef}
      data-drawing={current.id}
      role="option"
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick()
      }}
      className={[
        'flex flex-col gap-1 rounded-card border bg-card px-4 py-3 cursor-pointer transition cstk-animate',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        isSelected
          ? 'border-primary/60 bg-primary/5 shadow-card'
          : 'border-line hover:border-primary/40 hover:shadow-card',
      ].join(' ')}
    >
      {/*
       * Single DOM structure — one heading, one Open link per row.
       * CSS grid places the action button in a fixed right column on wide
       * screens and in-line with title on narrow screens.
       *
       * Layout:
       *   Narrow (<md):
       *     Row 1: [title ···············] [Open]
       *     Row 2: [kind] [site] [ver] [date] [note]
       *   Wide (md+):
       *     Row 1: [title ··] [kind][site][ver][date][note] ··· [Open]
       *
       * grid-template-areas achieves position switching without duplication.
       */}
      <div
        className={[
          'grid gap-x-3 gap-y-0.5',
          // Narrow: two rows (title+action / meta)
          '[grid-template-areas:"title_action""meta_meta"]',
          '[grid-template-columns:1fr_auto]',
          // Wide: single row (title+meta span left, action right)
          'md:[grid-template-areas:"title_action""meta_action"]',
        ].join(' ')}
      >
        <h3
          className="font-body text-body font-semibold text-text [grid-area:title]"
        >
          {current.title}
        </h3>

        {/* Metadata row */}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 [grid-area:meta]">
          <KindBadge kind={current.kind} label={kindLabel} />
          <Small className="text-text-mute">{current.site_name}</Small>
          <Small className="font-semibold text-text">
            {t('documents.version')} {current.version}
          </Small>
          <Small className="text-text-mute">
            {t('documents.published')}: {formatDate(current.published_at.slice(0, 10))}
          </Small>
          {current.change_note && (
            <Small className="text-text-mute">{current.change_note}</Small>
          )}
        </div>

        {/* Open link — single node, CSS grid places it in [action] area */}
        <a
          href={current.file_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={[
            'inline-flex min-h-tap shrink-0 self-start items-center',
            'rounded-control border border-line bg-paper px-3',
            'font-body text-small font-semibold text-text cstk-animate',
            'hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            '[grid-area:action]',
          ].join(' ')}
        >
          {t('documents.open')}
        </a>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// DocumentsPage — main export
// ---------------------------------------------------------------------------

type PageTab = 'drawings' | 'documents'

export function DocumentsPage() {
  const t = useT()
  const role = useMeRole() ?? 'owner'
  const tabs = useRoleTabs(role as ShellRole)
  const canManage = useCan('manage_settings')
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<PageTab>('drawings')
  const [search, setSearch] = useState('')
  const [showNewDrawing, setShowNewDrawing] = useState(false)
  const [activeKind, setActiveKind] = useState<FilterKind>('all')
  const [sort, setSort] = useState<SortKey>('newest')
  const [selectedIdx, setSelectedIdx] = useState<number>(-1)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerRow, setDrawerRow] = useState<DrawingRegisterRow | null>(null)
  const [drawerChain, setDrawerChain] = useState<DrawingRegisterRow[]>([])
  const [drawerAutoUpload, setDrawerAutoUpload] = useState(false)

  const listRef = useRef<HTMLUListElement>(null)
  const rowRefs = useRef<(HTMLLIElement | null)[]>([])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.drawings(),
    queryFn: () => drawingsApi.listRegister(),
  })

  // -------------------------------------------------------------------------
  // Group rows into version chains
  // -------------------------------------------------------------------------

  const rows = data ?? []
  const byId = new Map(rows.map((r) => [r.id, r]))
  const currentRows = rows.filter((r) => r.is_current)

  function buildChain(current: DrawingRegisterRow): DrawingRegisterRow[] {
    const chain: DrawingRegisterRow[] = []
    const seen = new Set<string>()
    let v: DrawingRegisterRow | undefined = current
    while (v) {
      if (seen.has(v.id)) break
      seen.add(v.id)
      chain.push(v)
      v = v.supersedes_id ? byId.get(v.supersedes_id) : undefined
    }
    return chain
  }

  function invalidateDrawings() {
    void qc.invalidateQueries({ queryKey: qk.drawings() })
  }

  // -------------------------------------------------------------------------
  // Kind filter + search + sort
  // -------------------------------------------------------------------------

  const presentKinds = [...new Set(currentRows.map((r) => r.kind))] as DrawingKind[]

  const filtered = sortRows(
    currentRows.filter((r) => {
      const matchesKind = activeKind === 'all' || r.kind === activeKind
      if (!matchesKind) return false
      if (!search.trim()) return true
      const q = search.trim().toLowerCase()
      return (
        r.title.toLowerCase().includes(q) ||
        r.site_name.toLowerCase().includes(q) ||
        r.version.toLowerCase().includes(q)
      )
    }),
    sort,
  )

  // -------------------------------------------------------------------------
  // Keyboard navigation
  // -------------------------------------------------------------------------

  const isDialogOpen = drawerOpen || showNewDrawing

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLUListElement>) => {
      if (isDialogOpen) return
      if (filtered.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((prev) => {
          const next = Math.min(prev + 1, filtered.length - 1)
          rowRefs.current[next]?.focus()
          return next
        })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((prev) => {
          const next = Math.max(prev - 1, 0)
          rowRefs.current[next]?.focus()
          return next
        })
      } else if (e.key === 'Enter' && selectedIdx >= 0) {
        e.preventDefault()
        const row = filtered[selectedIdx]
        if (row) openDrawer(row)
      } else if (e.key === 'u' && selectedIdx >= 0) {
        e.preventDefault()
        const row = filtered[selectedIdx]
        if (row) {
          // Open drawer with the revision-upload panel already expanded.
          openDrawer(row, true)
        }
      }
    },
    [filtered, selectedIdx, isDialogOpen],
  )

  function openDrawer(row: DrawingRegisterRow, autoUpload = false) {
    setDrawerRow(row)
    setDrawerChain(buildChain(row))
    setDrawerAutoUpload(autoUpload)
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    // Return focus to the selected row.
    if (selectedIdx >= 0) {
      rowRefs.current[selectedIdx]?.focus()
    }
  }

  // Reset rowRefs on filtered length change.
  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, filtered.length)
  }, [filtered.length])

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <AppShell role={role as ShellRole} tabs={tabs}>
      <header className="mb-6">
        <H1>{t('documents.title')}</H1>
        <Small className="mt-1 block text-text-mute">{t('documents.subtitle')}</Small>
      </header>

      {/* Access gate */}
      {!canManage ? (
        <section className="rounded-sheet border border-line bg-card p-6 shadow-card">
          <H2 as="h2">{t('admin.denied.title')}</H2>
          <Body className="mt-2 text-text-mute">{t('admin.denied.hint')}</Body>
        </section>
      ) : (
        <>
          {/* Tab switcher */}
          <div
            role="tablist"
            aria-label="Document sections"
            className="mb-6 flex gap-1 rounded-control border border-line bg-paper p-1"
            style={{ width: 'fit-content' }}
          >
            {(
              [
                { id: 'drawings' as PageTab, label: t('documents.tab_drawings') },
                { id: 'documents' as PageTab, label: t('documents.tab_documents') },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={[
                  'min-h-tap rounded-control px-4 font-body text-body font-semibold transition cstk-animate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  activeTab === id
                    ? 'bg-primary text-on-primary shadow-card'
                    : 'text-text-mute hover:text-text',
                ].join(' ')}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Documents tab ── */}
          {activeTab === 'documents' && <DocumentsTab canManage={canManage} />}

          {/* ── Drawings tab ── */}
          {activeTab === 'drawings' && (
            <>
              {/* Search bar + sort + New drawing action */}
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <label htmlFor="docs-search" className="sr-only">
                  {t('documents.search_placeholder')}
                </label>
                <input
                  id="docs-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('documents.search_placeholder')}
                  className="min-w-0 flex-1 rounded-control border border-line bg-paper px-3 py-2 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                {/* Sort control */}
                <label className="sr-only" htmlFor="drawings-sort">
                  {t('drawings.sort.label')}
                </label>
                <select
                  id="drawings-sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="min-h-tap rounded-control border border-line bg-paper px-3 font-body text-small text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="newest">{t('drawings.sort.newest')}</option>
                  <option value="oldest">{t('drawings.sort.oldest')}</option>
                  <option value="title_az">{t('drawings.sort.title_az')}</option>
                  <option value="site">{t('drawings.sort.site')}</option>
                </select>
                {!showNewDrawing && (
                  <Button variant="primary" onClick={() => setShowNewDrawing(true)}>
                    {t('documents.new_drawing')}
                  </Button>
                )}
              </div>

              {/* Kind filter */}
              {currentRows.length > 0 && (
                <KindFilter
                  presentKinds={presentKinds}
                  activeKind={activeKind}
                  onChange={(k) => { setActiveKind(k); setSelectedIdx(-1) }}
                />
              )}

              {/* New drawing form */}
              {showNewDrawing && (
                <NewDrawing
                  onDone={() => {
                    setShowNewDrawing(false)
                    invalidateDrawings()
                  }}
                  onCancel={() => setShowNewDrawing(false)}
                />
              )}

              {/* Four states */}
              {isLoading && <Spinner label={t('common.loading')} />}

              {isError && (
                <ErrorState
                  message={(error as Error)?.message ?? t('common.error')}
                  onRetry={() => refetch()}
                  retryLabel={t('action.retry')}
                />
              )}

              {!isLoading && !isError && currentRows.length === 0 && (
                <EmptyState
                  title={t('drawings.empty.title')}
                  hint={t('drawings.empty.hint')}
                  action={
                    canManage ? (
                      <Button variant="primary" onClick={() => setShowNewDrawing(true)}>
                        {t('drawings.empty.cta')}
                      </Button>
                    ) : undefined
                  }
                />
              )}

              {!isLoading && !isError && currentRows.length > 0 && (
                <section aria-label={t('documents.drawings_heading')}>
                  <Small className="mb-3 block font-semibold uppercase tracking-wide text-text-mute">
                    {t('documents.drawings_heading')}
                  </Small>
                  <ul
                    ref={listRef}
                    role="listbox"
                    aria-label={t('documents.drawings_heading')}
                    className="flex flex-col gap-3"
                    onKeyDown={handleListKeyDown}
                  >
                    {filtered.map((current, idx) => (
                      <DrawingRow
                        key={current.id}
                        current={current}
                        isSelected={selectedIdx === idx}
                        onClick={() => { setSelectedIdx(idx); openDrawer(current) }}
                        kindLabel={t(`drawings.kind.${current.kind}` as Parameters<typeof t>[0])}
                        rowRef={(el) => { rowRefs.current[idx] = el }}
                      />
                    ))}
                  </ul>

                  {filtered.length === 0 && (search.trim() || activeKind !== 'all') && (
                    <p className="mt-4 font-body text-small text-text-mute">
                      {t('documents.no_drawings')}
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}

      {/* Drawing detail drawer */}
      {drawerRow && (
        <DrawingDetailDrawer
          open={drawerOpen}
          onClose={closeDrawer}
          current={drawerRow}
          chain={drawerChain}
          canManage={canManage}
          siteId={drawerRow.site_id}
          autoUpload={drawerAutoUpload}
        />
      )}
    </AppShell>
  )
}
