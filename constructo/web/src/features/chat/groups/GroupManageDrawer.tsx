/**
 * GroupManageDrawer — the group roster + management surface (web Phase C).
 *
 * A right slide-over (keeps the thread visible behind it). C5: roster + role
 * derivation + Leave (any member). C6 layers in the admin controls (rename,
 * add, archive, promote/demote) gated on the caller's roster role.
 *
 * RBAC is enforced server-side; the last-admin guard surfaces as a 409 → toast.
 * Semantic tokens only — neev light + neev-dark inherit.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Drawer } from '../../../ui/Drawer'
import { ConfirmDialog } from '../../../ui/Modal'
import { useToast } from '../../../ui/Toast'
import { useMe } from '../../../auth/useCan'
import { ApiError } from '../../../api/client'
import { groupsApi, type GroupMember } from '../../../api/groups'

export interface GroupManageDrawerProps {
  open: boolean
  onClose: () => void
  groupId: string
  groupTitle: string
  /** Called after the current user leaves (parent clears selection). */
  onLeft?: () => void
}

function initials(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function GroupManageDrawer({ open, onClose, groupId, groupTitle, onLeft }: GroupManageDrawerProps) {
  const { show } = useToast()
  const { data: me } = useMe()
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const membersQuery = useQuery({
    queryKey: ['chat', 'group', groupId, 'members'],
    queryFn: () => groupsApi.members(groupId),
    enabled: open,
  })
  const members: GroupMember[] = membersQuery.data?.members ?? []

  async function handleLeave() {
    if (!me?.id) return
    setLeaving(true)
    try {
      await groupsApi.removeMember(groupId, me.id)
      setConfirmLeave(false)
      onLeft?.()
      onClose()
    } catch (e) {
      setConfirmLeave(false)
      if (e instanceof ApiError && e.status === 409) {
        show({ status: 'warn', message: 'A group needs at least one admin. Promote someone else first.' })
      } else {
        show({ status: 'risk', message: e instanceof Error ? e.message : 'Could not leave the group' })
      }
    } finally {
      setLeaving(false)
    }
  }

  return (
    <>
      <Drawer open={open} onClose={onClose} title={groupTitle}>
        <div className="flex flex-col gap-5">
          {/* Roster */}
          <section>
            <h3 className="mb-2 font-body text-small font-semibold uppercase tracking-wide text-text-muted">
              Members ({members.length})
            </h3>
            {membersQuery.isPending ? (
              <p className="font-body text-small text-text-muted">Loading members…</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {members.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-3 rounded-control px-1 py-1.5">
                    <span
                      aria-hidden
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-sunken font-body text-micro font-bold text-text-secondary"
                    >
                      {initials(m.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-body text-body text-text-primary">
                      {m.name ?? 'Unknown'}
                      {m.user_id === me?.id ? <span className="ml-1 text-text-muted">(you)</span> : null}
                    </span>
                    {m.is_homeowner ? (
                      <span className="shrink-0 rounded-full bg-info-bg px-2 py-0.5 font-body text-micro text-info">
                        Client
                      </span>
                    ) : null}
                    {m.role === 'admin' ? (
                      <span className="shrink-0 rounded-full bg-brand-subtle px-2 py-0.5 font-body text-micro font-medium text-brand-text">
                        Admin
                      </span>
                    ) : (
                      <span className="shrink-0 font-body text-micro text-text-muted">Member</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* PHASE C T6: admin controls (rename / add / archive / role) inserted here */}

          {/* Leave */}
          <section className="border-t border-edge pt-4">
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              className="font-body text-small font-medium text-risk-fg hover:underline"
            >
              Leave group
            </button>
          </section>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={handleLeave}
        title="Leave group?"
        message="You will stop receiving messages from this group. An admin can add you back."
        confirmLabel="Leave"
        variant="danger"
        busy={leaving}
      />
    </>
  )
}
