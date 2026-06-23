/**
 * GroupManageDrawer — the group roster + management surface (web Phase C).
 *
 * A right slide-over (keeps the thread visible behind it).
 *  - Any member: read the roster + Leave.
 *  - Admin (caller's roster role === 'admin'): rename, add members, archive,
 *    promote/demote, remove members.
 *
 * RBAC is enforced server-side; admin controls are gated here for UX, and the
 * last-admin guard surfaces as a 409 → toast. Semantic tokens only — neev light
 * + neev-dark inherit.
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Drawer } from '../../../ui/Drawer'
import { ConfirmDialog } from '../../../ui/Modal'
import { Button } from '../../../ui/Button'
import { useToast } from '../../../ui/Toast'
import { useMe } from '../../../auth/useCan'
import { ApiError } from '../../../api/client'
import { MemberPicker } from './MemberPicker'
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

const LAST_ADMIN_MSG = 'A group needs at least one admin. Promote someone else first.'

export function GroupManageDrawer({ open, onClose, groupId, groupTitle, onLeft }: GroupManageDrawerProps) {
  const { show } = useToast()
  const { data: me } = useMe()
  const queryClient = useQueryClient()

  const [renameValue, setRenameValue] = useState(groupTitle)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<GroupMember | null>(null)
  const [busy, setBusy] = useState(false)

  const membersQuery = useQuery({
    queryKey: ['chat', 'group', groupId, 'members'],
    queryFn: () => groupsApi.members(groupId),
    enabled: open,
  })
  const members: GroupMember[] = membersQuery.data?.members ?? []
  const myRole = members.find((m) => m.user_id === me?.id)?.role
  const isAdmin = myRole === 'admin'

  const addable = useQuery({
    queryKey: ['chat', 'group', groupId, 'addable'],
    queryFn: () => groupsApi.addableUsers({ groupId }),
    enabled: open && isAdmin,
  })

  function reportError(e: unknown) {
    if (e instanceof ApiError && e.status === 409) {
      show({ status: 'warn', message: LAST_ADMIN_MSG })
    } else {
      show({ status: 'risk', message: e instanceof Error ? e.message : 'Something went wrong' })
    }
  }

  /** Run an admin mutation, then refetch the roster + addable list. */
  async function run(fn: () => Promise<unknown>, onOk?: () => void) {
    setBusy(true)
    try {
      await fn()
      await queryClient.invalidateQueries({ queryKey: ['chat', 'group', groupId, 'members'] })
      await queryClient.invalidateQueries({ queryKey: ['chat', 'group', groupId, 'addable'] })
      onOk?.()
    } catch (e) {
      reportError(e)
    } finally {
      setBusy(false)
    }
  }

  function toggleSelected(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  async function handleLeave() {
    if (!me?.id) return
    setBusy(true)
    try {
      await groupsApi.removeMember(groupId, me.id)
      setConfirmLeave(false)
      await queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
      onLeft?.()
      onClose()
    } catch (e) {
      setConfirmLeave(false)
      reportError(e)
    } finally {
      setBusy(false)
    }
  }

  const renameDirty = renameValue.trim().length > 0 && renameValue.trim() !== groupTitle

  return (
    <>
      <Drawer open={open} onClose={onClose} title={groupTitle}>
        <div className="flex flex-col gap-5">
          {/* ---- Rename (admin) ---- */}
          {isAdmin ? (
            <section className="flex flex-col gap-1.5">
              <label htmlFor="group-rename" className="font-body text-small font-medium text-text-primary">
                Group name
              </label>
              <div className="flex gap-2">
                <input
                  id="group-rename"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="min-w-0 flex-1 rounded-control border border-edge bg-surface-card px-3 py-2 font-body text-body text-text-primary focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <Button
                  variant="primary"
                  type="button"
                  disabled={!renameDirty || busy}
                  onClick={() =>
                    run(() => groupsApi.patch(groupId, { name: renameValue.trim() }), () =>
                      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] }),
                    )
                  }
                >
                  Save
                </Button>
              </div>
            </section>
          ) : null}

          {/* ---- Roster ---- */}
          <section>
            <h3 className="mb-2 font-body text-small font-semibold uppercase tracking-wide text-text-muted">
              Members ({members.length})
            </h3>
            {membersQuery.isPending ? (
              <p className="font-body text-small text-text-muted">Loading members…</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {members.map((m) => {
                  const isSelf = m.user_id === me?.id
                  return (
                    <li key={m.user_id} className="flex items-center gap-3 rounded-control px-1 py-1.5">
                      <span
                        aria-hidden
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-sunken font-body text-micro font-bold text-text-secondary"
                      >
                        {initials(m.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-body text-body text-text-primary">
                        {m.name ?? 'Unknown'}
                        {isSelf ? <span className="ml-1 text-text-muted">(you)</span> : null}
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
                      {/* Admin per-member actions (never on your own row — use Leave) */}
                      {isAdmin && !isSelf ? (
                        <span className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              run(() =>
                                groupsApi.patch(groupId, {
                                  member_role: {
                                    user_id: m.user_id,
                                    role: m.role === 'admin' ? 'member' : 'admin',
                                  },
                                }),
                              )
                            }
                            className="font-body text-micro font-medium text-brand-text hover:underline disabled:opacity-50"
                          >
                            {m.role === 'admin' ? 'Demote' : 'Make admin'}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setPendingRemove(m)}
                            className="font-body text-micro font-medium text-risk-fg hover:underline disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* ---- Add members (admin) ---- */}
          {isAdmin ? (
            <section className="flex flex-col gap-2">
              <span className="font-body text-small font-medium text-text-primary">Add people</span>
              <MemberPicker
                users={addable.data ?? []}
                selected={selected}
                onToggle={toggleSelected}
                loading={addable.isPending}
              />
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  type="button"
                  disabled={selected.size === 0 || busy}
                  onClick={() =>
                    run(() => groupsApi.addMembers(groupId, [...selected]), () => setSelected(new Set()))
                  }
                >
                  Add
                </Button>
              </div>
            </section>
          ) : null}

          {/* ---- Footer actions ---- */}
          <section className="flex items-center justify-between border-t border-edge pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmLeave(true)}
              className="font-body text-small font-medium text-risk-fg hover:underline disabled:opacity-50"
            >
              Leave group
            </button>
            {isAdmin ? (
              <Button variant="danger" type="button" disabled={busy} onClick={() => setConfirmArchive(true)}>
                Archive group
              </Button>
            ) : null}
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
        busy={busy}
      />

      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={() =>
          run(
            () => groupsApi.patch(groupId, { archived: true }),
            () => {
              setConfirmArchive(false)
              void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
              onClose()
            },
          )
        }
        title="Archive group?"
        message="The group is hidden from everyone's inbox. An admin can restore it later."
        confirmLabel="Archive"
        variant="danger"
        busy={busy}
      />

      <ConfirmDialog
        open={pendingRemove !== null}
        onClose={() => setPendingRemove(null)}
        onConfirm={() => {
          const target = pendingRemove
          if (!target) return
          void run(() => groupsApi.removeMember(groupId, target.user_id), () => setPendingRemove(null))
        }}
        title="Remove member?"
        message={`Remove ${pendingRemove?.name ?? 'this member'} from the group?`}
        confirmLabel="Remove"
        variant="danger"
        busy={busy}
      />
    </>
  )
}
