/**
 * DocumentsPage (W5 Slice 2a — S2a-E3).
 *
 * Route: /settings/documents
 * Gate: owner | pm | architect (manage_settings)
 *
 * Renders the append-only drawings register:
 *   - Groups rows into "current drawings" (one row per is_current=true entry).
 *   - Each current drawing shows its version chain via a "Show versions" toggle,
 *     walking the supersedes_id chain newest → oldest.
 *   - Per-drawing upload form: file + version → presign → PUT → publish.
 *   - Client-side search over title + site_name + version.
 *
 * No delete / edit-in-place — append-only by design.
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { drawingsApi, type DrawingRegisterRow } from '../../api/drawings'
import { qk } from '../../api/queryKeys'
import { useCan, useMeRole } from '../../auth/useCan'
import { useT } from '../../i18n'
import { AppShell, Body, Button, H1, H2, Small, StatusPill, useRoleTabs, type Role as ShellRole } from '../../ui'
import { EmptyState, ErrorState, Spinner } from '../../components/states'
import { formatDate } from '../../lib/format'

// ---------------------------------------------------------------------------
// Upload phase state
// ---------------------------------------------------------------------------

type UploadPhase = 'idle' | 'uploading' | 'unavailable' | 'error'

// ---------------------------------------------------------------------------
// UploadRevision — inline per-drawing upload form
// ---------------------------------------------------------------------------

interface UploadRevisionProps {
  current: DrawingRegisterRow
  onDone: () => void
  onCancel: () => void
}

function UploadRevision({ current, onDone, onCancel }: UploadRevisionProps) {
  const t = useT()
  const [file, setFile] = useState<File | null>(null)
  const [version, setVersion] = useState('')
  const [changeNote, setChangeNote] = useState('')
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSave() {
    if (!file || !version.trim()) return

    setPhase('uploading')
    setErrorMsg(null)

    try {
      const ticket = await drawingsApi.presign(current.site_id, file.name, file.type)

      if (ticket.mode === 'unavailable') {
        setPhase('unavailable')
        return
      }

      // mode === 'presigned'
      await drawingsApi.putToR2(ticket.put_url!, file)
      await drawingsApi.publish({
        site_id: current.site_id,
        title: current.title,
        version: version.trim(),
        file_url: ticket.key,
        kind: current.kind,
        change_note: changeNote.trim() || null,
        supersedes_id: current.id,
      })

      setPhase('idle')
      onDone()
    } catch {
      setPhase('error')
      setErrorMsg(t('common.error'))
    }
  }

  const canSave = Boolean(file) && version.trim().length > 0 && phase !== 'uploading'

  return (
    <div className="mt-3 rounded-card border border-line bg-paper p-4">
      <div className="flex flex-col gap-3">
        {/* File input */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`upload-file-${current.id}`}
            className="font-body text-small font-semibold text-text-mute"
          >
            {t('documents.file_label')}
          </label>
          <input
            id={`upload-file-${current.id}`}
            type="file"
            accept=".pdf,.dwg,.dxf,.png,.jpg"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="font-body text-small text-text"
          />
        </div>

        {/* Version input */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`upload-version-${current.id}`}
            className="font-body text-small font-semibold text-text-mute"
          >
            {t('documents.version_label')}
          </label>
          <input
            id={`upload-version-${current.id}`}
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="e.g. v3"
            className="min-h-tap rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        {/* Change note (optional) */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`upload-note-${current.id}`}
            className="font-body text-small font-semibold text-text-mute"
          >
            {t('documents.change_note')}
          </label>
          <input
            id={`upload-note-${current.id}`}
            type="text"
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            placeholder="Optional"
            className="min-h-tap rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        {/* Upload unavailable note */}
        {phase === 'unavailable' && (
          <p role="alert" className="font-body text-small text-text-mute">
            {t('documents.upload_unavailable')}
          </p>
        )}

        {/* Generic error */}
        {phase === 'error' && errorMsg && (
          <p role="alert" className="font-body text-small text-risk">
            {errorMsg}
          </p>
        )}

        {/* Actions */}
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
// VersionHistory — the collapsed chain of versions for a drawing
// ---------------------------------------------------------------------------

interface VersionHistoryProps {
  chain: DrawingRegisterRow[] // newest → oldest
}

function VersionHistory({ chain }: VersionHistoryProps) {
  const t = useT()
  return (
    <ul className="mt-2 flex flex-col gap-2 border-l-2 border-line pl-4">
      {chain.map((v) => (
        <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Small className="font-semibold text-text">
            {t('documents.version')} {v.version}
          </Small>
          {!v.is_current && (
            <StatusPill status="info" label={t('documents.superseded')} size="sm" />
          )}
          {v.is_current && (
            <StatusPill status="ok" label={t('documents.current')} size="sm" />
          )}
          <Small className="text-text-mute">
            {t('documents.published')}: {formatDate(v.published_at.slice(0, 10))}
          </Small>
          {v.change_note && (
            <Small className="text-text-mute">{v.change_note}</Small>
          )}
          <a
            href={v.file_url}
            target="_blank"
            rel="noreferrer"
            className="font-body text-small font-semibold text-primary-deep underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('documents.open')}
          </a>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// DrawingRow — one current drawing + its version chain + upload form
// ---------------------------------------------------------------------------

interface DrawingRowProps {
  current: DrawingRegisterRow
  chain: DrawingRegisterRow[] // newest → oldest, includes current
  canManage: boolean
  onRefresh: () => void
}

function DrawingRow({ current, chain, canManage, onRefresh }: DrawingRowProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [uploading, setUploading] = useState(false)

  const hasHistory = chain.length > 1

  return (
    <li
      data-drawing={current.id}
      className="flex flex-col gap-1 rounded-card border border-line bg-card px-4 py-3"
    >
      {/* Primary row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3
            role="heading"
            aria-level={3}
            className="font-body text-body font-semibold text-text"
          >
            {current.title}
          </h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
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
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <a
            href={current.file_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-tap items-center rounded-control border border-line bg-paper px-3 font-body text-small font-semibold text-text cstk-animate hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('documents.open')}
          </a>
          {canManage && !uploading && (
            <Button variant="ghost" onClick={() => setUploading(true)}>
              {t('documents.upload_revision')}
            </Button>
          )}
        </div>
      </div>

      {/* Version history toggle */}
      {hasHistory && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="font-body text-small font-semibold text-primary-deep underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {expanded ? t('documents.hide_versions') : t('documents.show_versions')} {expanded ? '▲' : '▾'}
          </button>
          {expanded && <VersionHistory chain={chain} />}
        </div>
      )}

      {/* Upload form */}
      {uploading && (
        <UploadRevision
          current={current}
          onDone={() => {
            setUploading(false)
            onRefresh()
          }}
          onCancel={() => setUploading(false)}
        />
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// DocumentsPage — main export
// ---------------------------------------------------------------------------

export function DocumentsPage() {
  const t = useT()
  const role = useMeRole() ?? 'owner'
  const tabs = useRoleTabs(role as ShellRole)
  const canManage = useCan('manage_settings')
  const qc = useQueryClient()

  const [search, setSearch] = useState('')

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.drawings(),
    queryFn: () => drawingsApi.listRegister(),
  })

  // -------------------------------------------------------------------------
  // Group rows into version chains
  // -------------------------------------------------------------------------

  const rows = data ?? []

  // Build lookup of all rows by id (for chain walking).
  const byId = new Map(rows.map((r) => [r.id, r]))

  // Current drawings = rows where is_current is true.
  const currentRows = rows.filter((r) => r.is_current)

  // For each current row, build its version chain by walking supersedes_id.
  function buildChain(current: DrawingRegisterRow): DrawingRegisterRow[] {
    const chain: DrawingRegisterRow[] = []
    let v: DrawingRegisterRow | undefined = current
    while (v) {
      chain.push(v)
      v = v.supersedes_id ? byId.get(v.supersedes_id) : undefined
    }
    return chain // newest → oldest
  }

  // Apply client-side search filter.
  const filtered = currentRows.filter((r) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      r.title.toLowerCase().includes(q) ||
      r.site_name.toLowerCase().includes(q) ||
      r.version.toLowerCase().includes(q)
    )
  })

  // -------------------------------------------------------------------------
  // Gate: owner/pm/architect only
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
          {/* Search bar */}
          <div className="mb-5">
            <label htmlFor="docs-search" className="sr-only">
              {t('documents.search_placeholder')}
            </label>
            <input
              id="docs-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('documents.search_placeholder')}
              className="w-full rounded-control border border-line bg-paper px-3 py-2 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

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
            <EmptyState title={t('documents.no_drawings')} />
          )}

          {!isLoading && !isError && currentRows.length > 0 && (
            <section aria-label={t('documents.drawings_heading')}>
              <Small className="mb-3 block font-semibold uppercase tracking-wide text-text-mute">
                {t('documents.drawings_heading')}
              </Small>
              <ul className="flex flex-col gap-3">
                {filtered.map((current) => (
                  <DrawingRow
                    key={current.id}
                    current={current}
                    chain={buildChain(current)}
                    canManage={canManage}
                    onRefresh={() =>
                      qc.invalidateQueries({ queryKey: ['drawings'] })
                    }
                  />
                ))}
              </ul>

              {filtered.length === 0 && search.trim() && (
                <p className="mt-4 font-body text-small text-text-mute">
                  {t('documents.no_drawings')}
                </p>
              )}
            </section>
          )}
        </>
      )}
    </AppShell>
  )
}
