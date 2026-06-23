/**
 * DrawingDetailDrawer — D6 flagship component.
 *
 * Opens from clicking a DrawingRow. Shows:
 *   - Header: title + current version + kind badge
 *   - DrawingPreview (image / pdf / cad)
 *   - Version history as a TimelineItem list (newest → oldest)
 *   - Linked site changes (changes whose linked_drawing_id is in the chain)
 *   - Upload new revision action (with supersede-confirm guard)
 */

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { DrawingRegisterRow, DrawingKind } from '../../api/drawings'
import { drawingsApi, describeUploadError, DRAWING_KINDS } from '../../api/drawings'
import { siteChangesApi } from '../../api/siteChanges'
import { qk } from '../../api/queryKeys'
import { useT } from '../../i18n'
import type { TranslationKey } from '../../i18n/en'
import {
  Drawer,
  ConfirmDialog,
  Button,
  Small,
  StatusPill,
  TimelineItem,
} from '../../ui'
import { DrawingPreview } from './DrawingPreview'
import { formatDate } from '../../lib/format'

// ---------------------------------------------------------------------------
// Kind badge
// ---------------------------------------------------------------------------

const SC_STATUS_LABEL: Record<string, TranslationKey> = {
  new: 'sitechanges.badge.new',
  linked: 'sitechanges.badge.linked',
  resolved: 'sitechanges.badge.resolved',
}

const KIND_CLASS: Record<string, string> = {
  plan: 'bg-primary/10 text-primary-deep border-primary/20',
  elevation: 'bg-ok/10 text-ok border-ok/20',
  section: 'bg-warn/10 text-warn border-warn/20',
  structural: 'bg-risk/10 text-risk border-risk/20',
  electrical: 'bg-info/10 text-info border-info/20',
  plumbing: 'bg-info/10 text-info border-info/20',
  other: 'bg-paper text-text-mute border-line',
}

interface KindBadgeProps {
  kind: string
  label: string
}

export function KindBadge({ kind, label }: KindBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-pill border px-2.5 py-0.5 font-body text-micro font-semibold uppercase tracking-wide ${KIND_CLASS[kind] ?? KIND_CLASS.other}`}
    >
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// UploadRevision (inline) — supersede-confirm gated
// ---------------------------------------------------------------------------

type UploadPhase = 'idle' | 'uploading' | 'unavailable' | 'error'

interface RevisionUploadPanelProps {
  current: DrawingRegisterRow
  onDone: () => void
  onCancel: () => void
  /** When true the panel starts with the file input focused (autoUpload keyboard shortcut). */
  autoUpload?: boolean
}

function RevisionUploadPanel({ current, onDone, onCancel }: RevisionUploadPanelProps) {
  const t = useT()
  const [file, setFile] = useState<File | null>(null)
  const [version, setVersion] = useState('')
  const [kind, setKind] = useState<DrawingKind>(current.kind)
  const [changeNote, setChangeNote] = useState('')
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // drag state
  const [dragging, setDragging] = useState(false)

  const canSave = Boolean(file) && version.trim().length > 0 && phase !== 'uploading'

  async function doPublish() {
    if (!file || !version.trim()) return
    setPhase('uploading')
    setErrorMsg(null)
    setConfirmOpen(false)

    try {
      const ticket = await drawingsApi.presign(current.site_id, file.name, file.type)

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
        site_id: current.site_id,
        title: current.title,
        version: version.trim(),
        file_url: ticket.key,
        kind,
        change_note: changeNote.trim() || null,
        supersedes_id: current.id,
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

  function handleSaveClick() {
    if (!canSave) return
    // Always show supersede confirm since this is always a revision.
    setConfirmOpen(true)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  return (
    <>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void doPublish()}
        title={t('drawings.supersede.title', { version: current.version })}
        message={t('drawings.supersede.message')}
        confirmLabel={t('drawings.supersede.confirm')}
        cancelLabel={t('drawings.supersede.cancel')}
        busy={phase === 'uploading'}
      />

      <div
        className={[
          'mt-3 rounded-card border-2 bg-paper p-4 transition cstk-animate',
          dragging ? 'border-primary bg-primary/5' : 'border-dashed border-line',
        ].join(' ')}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="flex flex-col gap-3">
          {/* Drop zone + File input */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`drawer-upload-file-${current.id}`}
              className="font-body text-small font-semibold text-text-mute"
            >
              {t('documents.file_label')}
            </label>
            <input
              id={`drawer-upload-file-${current.id}`}
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

          {/* Version */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`drawer-upload-version-${current.id}`}
              className="font-body text-small font-semibold text-text-mute"
            >
              {t('documents.version_label')}
            </label>
            <input
              id={`drawer-upload-version-${current.id}`}
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. v3"
              className="min-h-tap rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          {/* Type (drawing kind) */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`drawer-upload-kind-${current.id}`}
              className="font-body text-small font-semibold text-text-mute"
            >
              {t('documents.kind_label')}
            </label>
            <select
              id={`drawer-upload-kind-${current.id}`}
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

          {/* Change note */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`drawer-upload-note-${current.id}`}
              className="font-body text-small font-semibold text-text-mute"
            >
              {t('documents.change_note')}
            </label>
            <input
              id={`drawer-upload-note-${current.id}`}
              type="text"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="Optional"
              className="min-h-tap rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
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

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              disabled={!canSave}
              onClick={handleSaveClick}
            >
              {phase === 'uploading' ? t('documents.uploading') : t('documents.save')}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              {t('documents.cancel')}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Main export: DrawingDetailDrawer
// ---------------------------------------------------------------------------

export interface DrawingDetailDrawerProps {
  open: boolean
  onClose: () => void
  current: DrawingRegisterRow
  chain: DrawingRegisterRow[]  // newest → oldest (includes current)
  canManage: boolean
  siteId?: string
  /** When true the revision-upload panel is shown immediately (keyboard shortcut `u`). */
  autoUpload?: boolean
}

export function DrawingDetailDrawer({
  open,
  onClose,
  current,
  chain,
  canManage,
  siteId,
  autoUpload = false,
}: DrawingDetailDrawerProps) {
  const t = useT()
  const qc = useQueryClient()
  const [showUpload, setShowUpload] = useState(false)

  // When the drawer opens, honour the autoUpload prop.
  // Reset on close so re-opening without the flag starts collapsed.
  useEffect(() => {
    if (open) {
      setShowUpload(autoUpload)
    } else {
      setShowUpload(false)
    }
  }, [open, autoUpload])

  // Collect all version IDs in this drawing's chain for linked-change matching.
  const chainIds = new Set(chain.map((v) => v.id))

  // Query site changes and filter to ones linked to any version in this chain.
  // Guard: do not fire when siteId is undefined.
  const { data: allChanges } = useQuery({
    queryKey: qk.siteChanges({ siteId }),
    queryFn: () => siteChangesApi.list({ siteId }),
    enabled: open && !!siteId,
  })

  const linkedChanges = (allChanges ?? []).filter(
    (sc) => sc.linked_drawing_id && chainIds.has(sc.linked_drawing_id),
  )

  function handleUploadDone() {
    setShowUpload(false)
    void qc.invalidateQueries({ queryKey: qk.drawings() })
  }

  const kindLabel = t(`drawings.kind.${current.kind}` as Parameters<typeof t>[0])

  const footer = canManage && !showUpload ? (
    <Button variant="primary" onClick={() => setShowUpload(true)}>
      {t('drawings.detail_drawer.upload_revision')}
    </Button>
  ) : null

  return (
    <Drawer
      open={open}
      onClose={() => { setShowUpload(false); onClose() }}
      title={current.title}
      widthClass="max-w-xl"
      footer={footer}
    >
      {/* Header meta: version + kind badge */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="font-body text-small font-semibold text-text">
          {t('documents.version')} {current.version}
        </span>
        <KindBadge kind={current.kind} label={kindLabel} />
        <Small className="text-text-mute">{current.site_name}</Small>
      </div>

      {/* File preview */}
      <DrawingPreview fileUrl={current.file_url} title={current.title} />

      {/* Inline revision upload */}
      {showUpload && (
        <RevisionUploadPanel
          current={current}
          onDone={handleUploadDone}
          onCancel={() => setShowUpload(false)}
        />
      )}

      {/* Version history */}
      <section className="mt-6">
        <Small className="mb-3 block font-semibold uppercase tracking-wide text-text-mute">
          {t('drawings.detail_drawer.version_history')}
        </Small>
        <ul className="flex flex-col">
          {chain.map((v, idx) => (
            <TimelineItem
              key={v.id}
              typeLabel={`${t('documents.version')} ${v.version}`}
              typeClassName={
                v.is_current
                  ? 'bg-ok/10 text-ok border border-ok/20'
                  : 'bg-paper text-text-mute border border-line'
              }
              summary={
                v.change_note ? (
                  <span>{v.change_note}</span>
                ) : (
                  <span className="text-text-mute">{v.is_current ? t('documents.current') : t('documents.superseded')}</span>
                )
              }
              occurredOn={formatDate(v.published_at.slice(0, 10))}
              hasEvidence={true}
              onViewEvidence={() => window.open(v.file_url, '_blank', 'noreferrer')}
              isLast={idx === chain.length - 1}
            />
          ))}
        </ul>
      </section>

      {/* Linked site changes */}
      {linkedChanges.length > 0 && (
        <section className="mt-6">
          <Small className="mb-3 block font-semibold uppercase tracking-wide text-text-mute">
            {t('drawings.detail_drawer.linked_changes')}
          </Small>
          <ul className="flex flex-col gap-2">
            {linkedChanges.map((sc) => (
              <li
                key={sc.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-line bg-paper px-3 py-2"
              >
                <Small className="flex-1 font-semibold text-text">{sc.title}</Small>
                <StatusPill
                  status={sc.status === 'resolved' ? 'ok' : sc.status === 'linked' ? 'info' : 'warn'}
                  label={t(SC_STATUS_LABEL[sc.status] ?? 'sitechanges.badge.new')}
                  size="sm"
                />
                {sc.room && (
                  <Small className="text-text-mute">{sc.room}</Small>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Drawer>
  )
}
