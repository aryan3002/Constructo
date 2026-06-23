/**
 * ActionItemsDrawer — the site's to-dos (Phase D). Open-first list with a
 * one-tap done toggle, an inline add row, and a "Nivaan" badge on AI-created
 * items. Right slide-over; semantic tokens only.
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Drawer } from '../../../ui/Drawer'
import { Button } from '../../../ui/Button'
import { useToast } from '../../../ui/Toast'
import { actionItemsApi, type ActionItem } from '../../../api/actionItems'

export interface ActionItemsDrawerProps {
  open: boolean
  onClose: () => void
  siteId: string
}

export function ActionItemsDrawer({ open, onClose, siteId }: ActionItemsDrawerProps) {
  const { show } = useToast()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const q = useQuery({
    queryKey: ['chat', 'actionItems', siteId],
    queryFn: () => actionItemsApi.list(siteId),
    enabled: open,
  })
  const items = q.data ?? []
  const ordered = [...items.filter((i) => i.status === 'open'), ...items.filter((i) => i.status === 'done')]

  const refetch = () => qc.invalidateQueries({ queryKey: ['chat', 'actionItems', siteId] })

  async function toggle(it: ActionItem) {
    try {
      await actionItemsApi.update(it.id, { status: it.status === 'done' ? 'open' : 'done' })
      await refetch()
    } catch (e) {
      show({ status: 'risk', message: e instanceof Error ? e.message : 'Could not update the to-do' })
    }
  }

  async function add() {
    const t = title.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      await actionItemsApi.create({ site_id: siteId, title: t })
      setTitle('')
      await refetch()
    } catch (e) {
      show({ status: 'risk', message: e instanceof Error ? e.message : 'Could not add the to-do' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="To-dos">
      <div className="flex flex-col gap-4">
        {/* Add row */}
        <div className="flex gap-2">
          <input
            aria-label="New to-do"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a to-do…"
            className="min-w-0 flex-1 rounded-control border border-edge bg-surface-card px-3 py-2 font-body text-body text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <Button variant="primary" type="button" disabled={!title.trim() || busy} onClick={add}>
            Add
          </Button>
        </div>

        {q.isPending ? (
          <p className="font-body text-small text-text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="font-body text-small text-text-muted">No to-dos yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {ordered.map((it) => {
              const done = it.status === 'done'
              return (
                <li key={it.id} className="flex items-center gap-3 rounded-control px-1 py-1.5">
                  <button
                    type="button"
                    aria-label={`${done ? 'Reopen' : 'Complete'} ${it.title}`}
                    onClick={() => toggle(it)}
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                      done ? 'border-ok bg-ok-bg text-ok-fg' : 'border-edge text-transparent hover:border-brand'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <span className={`min-w-0 flex-1 truncate font-body text-body ${done ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                    {it.title}
                  </span>
                  {it.created_by_ai ? (
                    <span className="shrink-0 rounded-full bg-brand-subtle px-2 py-0.5 font-body text-micro font-medium text-brand-text">
                      Nivaan
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Drawer>
  )
}
