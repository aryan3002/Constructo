/**
 * NewGroupButton — the owner-only "+ New group" entry in the chat inbox header
 * (web Phase C). Renders `null` for non-owners (mirrors the backend's
 * `require_role(owner)` on create). Owns the `NewGroupModal` and derives the
 * site-picker options from the already-cached conversations query (no extra
 * fetch); on create, invalidates the inbox so the new group appears.
 *
 * Semantic tokens only — neev light + neev-dark inherit.
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMeRole } from '../../../auth/useCan'
import { chatApi } from '../../../api/chat'
import { NewGroupModal } from './NewGroupModal'

export function NewGroupButton() {
  const role = useMeRole()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  // Shares the inbox's cache entry — no extra network when ChatInbox is mounted.
  const { data: conversations } = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: chatApi.conversations,
    enabled: role === 'owner',
  })

  if (role !== 'owner') return null

  // Distinct site options from the cached site threads.
  const seen = new Set<string>()
  const sites: { id: string; name: string }[] = []
  for (const c of conversations ?? []) {
    if (c.kind === 'site' && c.site_id && !seen.has(c.site_id)) {
      seen.add(c.site_id)
      sites.push({ id: c.site_id, name: c.site_name ?? 'Site' })
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-edge bg-surface-card px-3 py-1 font-body text-small font-medium text-text-primary hover:bg-surface-hover"
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New group
      </button>
      <NewGroupModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
        }}
        sites={sites}
      />
    </>
  )
}
