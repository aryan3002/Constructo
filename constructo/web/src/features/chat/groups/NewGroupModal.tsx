/**
 * NewGroupModal — the owner's "create a group" form (web Phase C).
 *
 * Reuses the shared `Modal` chrome. Fields: name, an optional site (a tokenized
 * <select> whose first option is "Company-wide", value '' → site_id null), and a
 * `MemberPicker` fed by `groupsApi.addableUsers({siteId})` (refetched per site).
 * Submit → `groupsApi.create` → `onCreated(group)` + close. Errors → toast.
 *
 * Owner-gating lives at the call site (NewGroupButton); the backend is the real
 * gate (`require_role(owner)`).
 *
 * Semantic tokens only — neev light + neev-dark inherit.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal } from '../../../ui/Modal'
import { Button } from '../../../ui/Button'
import { useToast } from '../../../ui/Toast'
import { MemberPicker } from './MemberPicker'
import { groupsApi, type Group } from '../../../api/groups'

export interface NewGroupModalProps {
  open: boolean
  onClose: () => void
  onCreated: (group: Group) => void
  /** The owner's sites; "Company-wide" is added internally as the null option. */
  sites: { id: string; name: string }[]
}

export function NewGroupModal({ open, onClose, onCreated, sites }: NewGroupModalProps) {
  const { show } = useToast()
  const [name, setName] = useState('')
  const [siteId, setSiteId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  const addable = useQuery({
    queryKey: ['chat', 'groups', 'addable', siteId || null],
    queryFn: () => groupsApi.addableUsers(siteId ? { siteId } : {}),
    enabled: open,
  })

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  function reset() {
    setName('')
    setSiteId('')
    setSelected(new Set())
  }

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      const group = await groupsApi.create({
        name: trimmed,
        site_id: siteId || null,
        member_user_ids: [...selected],
      })
      onCreated(group)
      reset()
      onClose()
    } catch (e) {
      show({ status: 'risk', message: e instanceof Error ? e.message : 'Could not create the group' })
    } finally {
      setSubmitting(false)
    }
  }

  const footer = (
    <div className="flex justify-end gap-3">
      <Button variant="ghost" type="button" onClick={onClose}>
        Cancel
      </Button>
      <Button
        variant="primary"
        type="button"
        onClick={handleCreate}
        disabled={!name.trim() || submitting}
        aria-busy={submitting || undefined}
      >
        Create group
      </Button>
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title="New group" footer={footer}>
      <div className="flex flex-col gap-4">
        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-group-name" className="font-body text-small font-medium text-text-primary">
            Group name
          </label>
          <input
            id="new-group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Phase 2 crew"
            className="rounded-control border border-edge bg-surface-card px-3 py-2 font-body text-body text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        {/* Site */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-group-site" className="font-body text-small font-medium text-text-primary">
            Site
          </label>
          <select
            id="new-group-site"
            value={siteId}
            onChange={(e) => {
              setSiteId(e.target.value)
              setSelected(new Set()) // membership rules differ by site (homeowners excluded company-wide)
            }}
            className="rounded-control border border-edge bg-surface-card px-3 py-2 font-body text-body text-text-primary focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="">Company-wide (no site)</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="font-body text-micro text-text-muted">
            {siteId ? 'Captures in this group file to the site.' : 'Talk-only · crew only · no client.'}
          </p>
        </div>

        {/* Members */}
        <div className="flex flex-col gap-1.5">
          <span className="font-body text-small font-medium text-text-primary">Add people</span>
          <MemberPicker
            users={addable.data ?? []}
            selected={selected}
            onToggle={toggle}
            loading={addable.isPending}
          />
        </div>
      </div>
    </Modal>
  )
}
