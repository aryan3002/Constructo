/**
 * ChatInbox — the conversation list panel for the contractor web chat.
 *
 * Queries `chatApi.conversations()` via TanStack Query (5 s polling +
 * refetch-on-focus) and renders the list as `ConversationRow` entries. Handles
 * loading / error / empty states with the shared `states.tsx` primitives.
 *
 * Props:
 *   selectedId — the currently open conversation's `id`, or null.
 *   onSelect   — called with the full `ConversationSummary` when a row is clicked.
 */
import { useQuery } from '@tanstack/react-query'
import { chatApi, type ConversationSummary } from '../../api/chat'
import { Spinner, ErrorState } from '../../components/states'
import { ConversationRow } from './ConversationRow'
import { NewGroupButton } from './groups/NewGroupButton'

// ---------------------------------------------------------------------------
// ChatInbox
// ---------------------------------------------------------------------------

export interface ChatInboxProps {
  selectedId: string | null
  onSelect: (conversation: ConversationSummary) => void
}

export function ChatInbox({ selectedId, onSelect }: ChatInboxProps) {
  const q = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: chatApi.conversations,
    // Tighter poll + refetch-on-focus so unopened threads bump/badge quickly.
    // (The open thread is already live via the socket.)
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  })

  return (
    <section
      aria-label="Chat conversations"
      className="flex h-full flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="shrink-0 border-b border-edge px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-display text-h1 font-bold text-text-primary">Chat</h2>
            <p className="mt-0.5 font-body text-small text-text-muted">
              Your site crew threads
            </p>
          </div>
          {/* Owner-only "+ New group" (renders null otherwise) */}
          <NewGroupButton />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {q.isPending ? (
          <Spinner label="Loading conversations…" />
        ) : q.isError ? (
          <ErrorState
            message="Could not load your chats just now."
            onRetry={() => void q.refetch()}
            retryLabel="Retry"
          />
        ) : q.data?.length === 0 ? (
          <p
            role="status"
            aria-live="polite"
            className="px-4 py-6 font-body text-body text-text-muted"
          >
            No conversations yet.
          </p>
        ) : (
          <ul role="list" className="flex flex-col gap-0.5">
            {(q.data ?? []).map((c) => (
              <li key={c.id}>
                <ConversationRow
                  conversation={c}
                  selected={c.id === selectedId}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
