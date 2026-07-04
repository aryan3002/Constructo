/**
 * NewProjectModal — the owner's "create a project (site)" form for the Command
 * Center. Reuses the shared `Modal` chrome, submits via `useMutation` →
 * `sitesApi.create`, and on success invalidates `qk.sites()`, `qk.activity()`,
 * `qk.activitySummary()`, and chat conversations (so the projects strip, the
 * activity feed, the hero summary counters, and chat targets all refresh) then
 * closes.
 *
 * The third invalidation is deliberate, not redundant: `qk.activity()` resolves
 * to `['activity', null]` while `qk.activitySummary()` is `['activity',
 * 'summary']` — under React Query v5's positional array matching these do NOT
 * partial-match each other (see queryKeys.ts's docstring on activitySummary),
 * so a create that only invalidated qk.activity() would leave the owner's
 * "updates today / needs decision" hero counters stale after adding a site.
 *
 * Honest validation: submit is disabled until a name is typed; on a failed
 * create we keep the modal open with the typed values and show a CDS error line.
 * Type select reuses OwnerFirstRun's SITE_TYPES verbatim (labels via
 * auth.onboard.site.type.*, default residential). Location is optional.
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import { useT, type TranslationKey } from '../../i18n'
import { sitesApi, type SiteOut } from '../../api/sites'
import { qk } from '../../api/queryKeys'

// Reused verbatim from pages/auth/OwnerFirstRun.tsx (SITE_TYPES).
const SITE_TYPES = ['residential', 'commercial', 'villa', 'interior', 'infra'] as const

export interface NewProjectModalProps {
  open: boolean
  onClose: () => void
  onCreated?: (site: SiteOut) => void
}

export function NewProjectModal({ open, onClose, onCreated }: NewProjectModalProps) {
  const t = useT()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState<string>('residential')
  const [location, setLocation] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (body: { name: string; type: string; location?: string }) => sitesApi.create(body),
    onSuccess: (site) => {
      qc.invalidateQueries({ queryKey: qk.sites() })
      qc.invalidateQueries({ queryKey: qk.activity() })
      qc.invalidateQueries({ queryKey: qk.activitySummary() })
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] })
      onCreated?.(site)
      reset()
      onClose()
    },
    onError: () => {
      // Keep the modal open + inputs intact; surface a CDS error line.
      setError(t('projects.new.error'))
    },
  })

  function reset() {
    setName('')
    setType('residential')
    setLocation('')
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('projects.new.name_required'))
      return
    }
    if (mutation.isPending) return
    setError(null)
    const loc = location.trim()
    mutation.mutate({ name: trimmed, type, ...(loc ? { location: loc } : {}) })
  }

  const footer = (
    <div className="flex justify-end gap-3">
      <Button variant="ghost" type="button" onClick={handleClose}>
        {t('projects.new.cancel')}
      </Button>
      <Button
        variant="primary"
        type="button"
        onClick={handleSubmit}
        disabled={!name.trim() || mutation.isPending}
        aria-busy={mutation.isPending || undefined}
      >
        {t('projects.new.submit')}
      </Button>
    </div>
  )

  return (
    <Modal open={open} onClose={handleClose} title={t('projects.new.title')} footer={footer}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
        noValidate
      >
        {/* Name (required) */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="new-project-name"
            className="font-body text-small font-medium text-text"
          >
            {t('projects.new.name_label')}
          </label>
          <input
            id="new-project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('projects.new.name_placeholder')}
            className="rounded-control border border-line bg-card px-3 py-2 font-body text-body text-text placeholder:text-text-mute focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Type (default residential) */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="new-project-type"
            className="font-body text-small font-medium text-text"
          >
            {t('projects.new.type_label')}
          </label>
          <select
            id="new-project-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-control border border-line bg-card px-3 py-2 font-body text-body text-text focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {SITE_TYPES.map((tp) => (
              <option key={tp} value={tp}>
                {t(`auth.onboard.site.type.${tp}` as TranslationKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Location (optional) */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="new-project-location"
            className="font-body text-small font-medium text-text"
          >
            {t('projects.new.location_label')}
          </label>
          <input
            id="new-project-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t('projects.new.location_placeholder')}
            className="rounded-control border border-line bg-card px-3 py-2 font-body text-body text-text placeholder:text-text-mute focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="font-body text-micro text-text-mute">{t('projects.new.location_hint')}</p>
        </div>

        {error && (
          <p role="alert" className="font-body text-small font-medium text-risk">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
