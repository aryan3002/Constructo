/**
 * MemberPicker — a checkbox multi-select over the group "addable users" list
 * (web Phase C). Reused by the create modal and the manage drawer's add-member
 * panel. Purely controlled: the parent owns the `selected` set. An
 * `already_member` user renders checked + disabled.
 *
 * Semantic tokens only — neev light + neev-dark inherit.
 */
import type { AddableUser } from '../../../api/groups'

export interface MemberPickerProps {
  users: AddableUser[]
  /** Controlled selection of user ids. */
  selected: Set<string>
  onToggle: (userId: string) => void
  loading?: boolean
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  pm: 'PM',
  architect: 'Architect',
  supervisor: 'Supervisor',
  accountant: 'Accountant',
  procurement: 'Procurement',
  labor_contractor: 'Labour',
  contractor: 'Labour',
  homeowner: 'Client',
}

export function MemberPicker({ users, selected, onToggle, loading = false }: MemberPickerProps) {
  if (loading) {
    return <p className="px-1 py-3 font-body text-small text-text-muted">Loading people…</p>
  }
  if (users.length === 0) {
    return <p className="px-1 py-3 font-body text-small text-text-muted">No one to add.</p>
  }

  return (
    <ul className="max-h-56 overflow-y-auto rounded-control border border-edge">
      {users.map((u) => {
        const checked = u.already_member || selected.has(u.user_id)
        const roleLabel = ROLE_LABEL[u.role] ?? u.role
        return (
          <li key={u.user_id} className="border-b border-edge last:border-b-0">
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-hover">
              <input
                type="checkbox"
                checked={checked}
                disabled={u.already_member}
                onChange={() => onToggle(u.user_id)}
                aria-label={u.name ?? 'Unknown'}
                className="h-4 w-4 shrink-0 accent-[var(--brand)] disabled:opacity-60"
              />
              <span className="min-w-0 flex-1 truncate font-body text-body text-text-primary">
                {u.name ?? 'Unknown'}
              </span>
              {u.role === 'homeowner' ? (
                <span className="shrink-0 rounded-full bg-info-bg px-2 py-0.5 font-body text-micro text-info">
                  Client
                </span>
              ) : (
                <span className="shrink-0 font-body text-small text-text-muted">{roleLabel}</span>
              )}
              {u.already_member ? (
                <span className="shrink-0 font-body text-micro text-text-muted">Member</span>
              ) : null}
            </label>
          </li>
        )
      })}
    </ul>
  )
}
