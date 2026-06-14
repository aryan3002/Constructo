/**
 * DrawingLinkPicker — select a published drawing revision to link to a site change.
 *
 * Loads the site's current drawings register via drawingsApi.listRegister, shows
 * a select list of title + version rows. Selecting one calls onLink(drawingId).
 *
 * State cases:
 *   loading — spinner
 *   empty   — honest "No drawings published for this site yet" hint
 *   data    — select element + "Link drawing" action button
 *   already linked — shows the linked drawing info + "Link to a different drawing" toggle
 */

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { drawingsApi } from '../../api/drawings'
import { qk } from '../../api/queryKeys'
import { useT } from '../../i18n'
import { Small } from '../../ui'
import { Button } from '../../ui/Button'
import type { DrawingRegisterRow } from '../../api/drawings'

interface DrawingLinkPickerProps {
  siteId: string
  linkedDrawingId: string | null
  onLink: (drawingId: string) => void
  busy: boolean
}

export function DrawingLinkPicker({
  siteId,
  linkedDrawingId,
  onLink,
  busy,
}: DrawingLinkPickerProps) {
  const t = useT()
  const qc = useQueryClient()
  const [relinking, setRelinking] = useState(false)
  const [selected, setSelected] = useState<string>('')

  const { data: drawings, isLoading, isError } = useQuery({
    queryKey: qk.drawings(siteId),
    queryFn: () => drawingsApi.listRegister(siteId),
  })

  // If already linked and not in re-link mode, show the linked drawing info
  const linkedDrawing: DrawingRegisterRow | undefined = linkedDrawingId
    ? drawings?.find((d) => d.id === linkedDrawingId)
    : undefined

  const handleLink = () => {
    if (!selected) return
    onLink(selected)
    setRelinking(false)
    // Optimistically pre-populate the selected value for future re-links
    setSelected('')
    // The parent's onLink handles cache invalidation
    void qc.invalidateQueries({ queryKey: qk.drawings(siteId) })
  }

  if (isLoading) {
    return (
      <p className="font-body text-small text-text-mute">
        {t('sitechanges.drawer.drawings_loading')}
      </p>
    )
  }

  if (isError) {
    return (
      <p className="font-body text-small text-risk">
        {t('sitechanges.error.link')}
      </p>
    )
  }

  const currentDrawings = drawings?.filter((d) => d.is_current) ?? []

  // No drawings published yet
  if (!isLoading && currentDrawings.length === 0) {
    return (
      <p className="font-body text-small text-text-mute italic">
        {t('sitechanges.drawer.no_drawings')}
      </p>
    )
  }

  // Already linked + not in re-link mode
  if (linkedDrawingId && linkedDrawing && !relinking) {
    return (
      <div className="space-y-2">
        <div className="rounded-card border border-info/30 bg-info/10 px-3 py-2">
          <p className="font-body text-small font-semibold text-info">
            {linkedDrawing.title}
            <span className="ml-1.5 font-normal text-text-mute">{linkedDrawing.version}</span>
          </p>
          {linkedDrawing.change_note && (
            <Small className="mt-0.5">{linkedDrawing.change_note}</Small>
          )}
        </div>
        <button
          type="button"
          onClick={() => setRelinking(true)}
          className="font-body text-small text-primary underline underline-offset-2 hover:opacity-80 cstk-animate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
        >
          {t('sitechanges.drawer.relink')}
        </button>
      </div>
    )
  }

  // Linked but drawing not in the list (e.g. loading still)
  if (linkedDrawingId && !linkedDrawing && !relinking) {
    return (
      <div className="space-y-2">
        <p className="font-body text-small text-text-mute">{t('sitechanges.drawer.linked_drawing')}: {linkedDrawingId}</p>
        <button
          type="button"
          onClick={() => setRelinking(true)}
          className="font-body text-small text-primary underline underline-offset-2 hover:opacity-80 cstk-animate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
        >
          {t('sitechanges.drawer.relink')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <select
        aria-label={t('sitechanges.drawer.link_placeholder')}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        data-testid="drawing-link-select"
        className={[
          'w-full rounded-control border border-line bg-card px-3 py-2',
          'font-body text-small text-text min-h-tap',
          'focus:outline-none focus:ring-2 focus:ring-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'cstk-animate',
        ].join(' ')}
        disabled={busy}
      >
        <option value="">{t('sitechanges.drawer.link_placeholder')}</option>
        {currentDrawings.map((d) => (
          <option key={d.id} value={d.id}>
            {d.title} {d.version}
            {d.change_note ? ` — ${d.change_note}` : ''}
          </option>
        ))}
      </select>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={handleLink}
          disabled={!selected || busy}
          type="button"
          data-testid="link-drawing-btn"
        >
          {busy ? t('sitechanges.drawer.saving') : t('sitechanges.drawer.link_action')}
        </Button>
        {relinking && (
          <Button
            variant="ghost"
            onClick={() => {
              setRelinking(false)
              setSelected('')
            }}
            type="button"
          >
            {t('action.cancel')}
          </Button>
        )}
      </div>
    </div>
  )
}
