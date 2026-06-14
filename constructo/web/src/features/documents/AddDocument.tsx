/**
 * AddDocument — form for uploading a new company document.
 *
 * Flow: pick doc_type + title + optional expiry + optional site + optional
 * notes + file → Save → presign → (presigned) putToR2 → create → invalidate;
 *                                  (unavailable) show note, stop.
 *
 * Gate: passed in via `canManage` prop — DocumentsTab handles the gate.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { documentsApi, putToR2, type DocType } from '../../api/documents'
import { useSites } from '../../api/hooks'
import { useT, type TranslationKey } from '../../i18n'
import { Button, Small } from '../../ui'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = 'idle' | 'saving' | 'unavailable' | 'error'

const DOC_TYPES: DocType[] = ['contract', 'boq', 'noc', 'insurance', 'license', 'other']

function docTypeKey(dt: DocType): TranslationKey {
  return `documents.doc_type.${dt}` as TranslationKey
}

interface AddDocumentProps {
  onDone: () => void
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddDocument({ onDone, onCancel }: AddDocumentProps) {
  const t = useT()
  const qc = useQueryClient()
  const { data: sitesData } = useSites()
  const sites = sitesData?.items ?? []

  const [docType, setDocType] = useState<DocType>('contract')
  const [title, setTitle] = useState('')
  const [expiry, setExpiry] = useState('')
  const [siteId, setSiteId] = useState<string>('')   // '' = company-wide
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSave() {
    if (!file || !title.trim()) return

    setPhase('saving')
    setErrorMsg(null)

    try {
      const siteArg = siteId || undefined
      const ticket = await documentsApi.presign(file.name, file.type, siteArg)

      if (ticket.mode === 'unavailable') {
        setPhase('unavailable')
        return
      }

      // mode === 'presigned'
      await putToR2(ticket.put_url!, file)
      await documentsApi.create({
        doc_type: docType,
        title: title.trim(),
        file_url: ticket.key,
        expiry_on: expiry || null,
        site_id: siteArg,
        notes: notes.trim() || null,
      })

      // Invalidate both archived and non-archived views.
      void qc.invalidateQueries({ queryKey: ['company_documents'] })
      setPhase('idle')
      onDone()
    } catch {
      setPhase('error')
      setErrorMsg(t('common.error'))
    }
  }

  const canSave = Boolean(file) && title.trim().length > 0 && phase !== 'saving'

  return (
    <div className="mb-5 rounded-card border border-line bg-paper p-4">
      <div className="flex flex-col gap-3">

        {/* Document type */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="add-doc-type"
            className="font-body text-small font-semibold text-text-mute"
          >
            {t('documents.tab_documents')} — {t('documents.doc_type.other').toLowerCase()} …
          </label>
          <label htmlFor="add-doc-type" className="sr-only">
            Type
          </label>
          <select
            id="add-doc-type"
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocType)}
            className="min-h-tap rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Type"
          >
            {DOC_TYPES.map((dt) => (
              <option key={dt} value={dt}>
                {t(docTypeKey(dt))}
              </option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="add-doc-title"
            className="font-body text-small font-semibold text-text-mute"
          >
            {t('documents.doc_title')}
          </label>
          <input
            id="add-doc-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Contractor All-Risk Insurance"
            className="min-h-tap rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        {/* Expiry */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="add-doc-expiry"
            className="font-body text-small font-semibold text-text-mute"
          >
            {t('documents.expiry')}
          </label>
          <input
            id="add-doc-expiry"
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="min-h-tap rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        {/* Site (optional — empty = company-wide) */}
        {sites.length > 0 && (
          <div className="flex flex-col gap-1">
            <label
              htmlFor="add-doc-site"
              className="font-body text-small font-semibold text-text-mute"
            >
              {t('documents.site_label')}
            </label>
            <select
              id="add-doc-site"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="min-h-tap rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">{t('documents.company_wide')}</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Notes (optional) */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="add-doc-notes"
            className="font-body text-small font-semibold text-text-mute"
          >
            {t('documents.notes')}
          </label>
          <input
            id="add-doc-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            className="min-h-tap rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        {/* File */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="add-doc-file"
            className="font-body text-small font-semibold text-text-mute"
          >
            {t('documents.file_label')}
          </label>
          <input
            id="add-doc-file"
            type="file"
            accept=".pdf,.doc,.docx,.xlsx,.png,.jpg"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="font-body text-small text-text"
          />
        </div>

        {/* Upload unavailable note */}
        {phase === 'unavailable' && (
          <p role="alert" className="font-body text-small text-text-mute">
            {t('documents.upload_unavailable_doc')}
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
            {phase === 'saving' ? (
              <Small className="font-semibold">{t('common.loading')}</Small>
            ) : (
              t('documents.save')
            )}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            {t('documents.cancel')}
          </Button>
        </div>
      </div>
    </div>
  )
}
