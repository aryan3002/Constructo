/**
 * ChatThread — the top-level assembly that wires all chat primitives together
 * into a complete thread view.
 *
 * Routing logic (highest-priority first):
 *   1. meta.proposal          → NivaanProposalCard
 *   2. events with known type → CaptureCard (one per event)
 *   3. SystemNotice returns non-null (system/blocked) → SystemNotice
 *   4. else                   → MessageBubble
 *
 * Also: day separators, autoscroll-to-bottom, load-older, pending bubbles.
 * Semantic tokens only — no hardcoded hex.  Neev light + neev-dark aware.
 */

import { useEffect, useRef, useCallback } from 'react'
import { useChatThread } from './useChatThread'
import { MessageBubble } from './MessageBubble'
import { CaptureCard } from './CaptureCard'
import { NivaanProposalCard } from './NivaanProposalCard'
import { SystemNotice } from './SystemNotice'
import { ChatComposer } from './ChatComposer'
import { useMe } from '../../auth/useCan'
import type { ChatAddress, ChatMessage } from '../../api/chat'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return true when SystemNotice would render a notice for this message. */
function isSystemNotice(message: ChatMessage): boolean {
  return (
    message.meta?.blocked?.reason === 'contested' ||
    message.sender_kind === 'system'
  )
}

/** Calendar-day label: "Mon, 2 Jun" style.  No Intl locale needed in English-first. */
function dayLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** True when two ISO strings fall on different calendar days (local time). */
function differentDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false
  return (
    da.getFullYear() !== db.getFullYear() ||
    da.getMonth() !== db.getMonth() ||
    da.getDate() !== db.getDate()
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatThreadProps {
  address: ChatAddress
  title?: string
  /** True when a homeowner client has joined this thread. */
  hasHomeowner?: boolean
}

// ---------------------------------------------------------------------------
// ChatThread
// ---------------------------------------------------------------------------

export function ChatThread({ address, title, hasHomeowner }: ChatThreadProps) {
  const { data: me } = useMe()

  const {
    messages,
    isLoading,
    error,
    sending,
    reply,
    setReply,
    send,
    sendMedia,
    sendProposal,
    loadOlder,
    hasOlder,
    deliveryState,
    retry,
    pending,
  } = useChatThread(address)

  // ---- Autoscroll ----
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Guard: jsdom does not implement scrollIntoView; real browsers do.
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, pending.length])

  // ---- Scroll-to-top → loadOlder ----
  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el || !hasOlder) return
    if (el.scrollTop < 80) {
      loadOlder()
    }
  }, [hasOlder, loadOlder])

  // ---- resolveParent helper (stable — doesn't close over messages directly) ----
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const resolveParent = useCallback(
    (id: string) => messagesRef.current.find((m) => m.id === id),
    [],
  )

  // ---- Determine whether a homeowner-present banner should show ----
  // The banner appears when hasHomeowner=true AND this is NOT a homeowner-type
  // conversation (i.e. sender_side data would be 'contractor' side).
  // Since we can't read the conversation_kind directly from the address, we
  // show the banner whenever hasHomeowner is true (the parent page knows).
  const showClientBanner = hasHomeowner === true

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      data-testid="chat-thread"
      className="flex h-full flex-col bg-surface"
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-edge bg-surface-card px-4 py-3">
        {title ? (
          <h2 className="font-body text-heading font-semibold text-text-primary truncate">
            {title}
          </h2>
        ) : null}

        {/* Client-present banner */}
        {showClientBanner ? (
          <div
            data-testid="client-banner"
            className="mt-1.5 rounded-control bg-info-bg px-3 py-1.5 font-body text-small text-info"
          >
            Client is in this thread
          </div>
        ) : null}
      </header>

      {/* ── Message list ──────────────────────────────────────────────────── */}
      <div
        ref={listRef}
        data-testid="message-list"
        className="flex-1 overflow-y-auto px-4 py-3"
        onScroll={handleScroll}
      >
        {/* Loading state */}
        {isLoading ? (
          <p
            data-testid="loading-state"
            className="text-center font-body text-small text-text-muted py-8"
          >
            Loading…
          </p>
        ) : error ? (
          /* Error state */
          <p
            data-testid="error-state"
            role="alert"
            className="text-center font-body text-small text-risk-fg py-8"
          >
            Failed to load messages.
          </p>
        ) : messages.length === 0 && pending.length === 0 ? (
          /* Empty state */
          <p
            data-testid="empty-state"
            className="text-center font-body text-small text-text-muted py-8"
          >
            No messages yet.
          </p>
        ) : (
          <>
            {/* Load-older button at the top */}
            {hasOlder ? (
              <div className="flex justify-center pb-3">
                <button
                  type="button"
                  data-testid="load-older-btn"
                  onClick={loadOlder}
                  className="rounded-full border border-edge bg-surface-card px-4 py-1 font-body text-small text-text-secondary hover:bg-surface-hover"
                >
                  Load older messages
                </button>
              </div>
            ) : null}

            {/* Confirmed messages */}
            {messages.map((message, idx) => {
              const prev = idx > 0 ? messages[idx - 1] : null
              const showDaySep =
                prev !== null && differentDay(prev.created_at, message.created_at)
              const mine = message.sender_id === me?.id

              // ── Choose the right primitive ──────────────────────────────
              let content: React.ReactNode

              if (message.meta?.proposal) {
                content = (
                  <NivaanProposalCard
                    message={message}
                    onConfirm={sendProposal}
                  />
                )
              } else if (
                message.events &&
                message.events.filter((e) => e.event_type !== 'unknown').length > 0
              ) {
                content = message.events
                  .filter((e) => e.event_type !== 'unknown')
                  .map((ev) => (
                    <CaptureCard
                      key={ev.id}
                      event={ev}
                      message={message}
                    />
                  ))
              } else if (isSystemNotice(message)) {
                content = <SystemNotice message={message} />
              } else {
                content = (
                  <MessageBubble
                    message={message}
                    mine={mine}
                    showSenderName={!mine}
                    deliveryState={deliveryState(message.seq)}
                    onReply={setReply}
                    resolveParent={resolveParent}
                  />
                )
              }

              return (
                <div key={message.id}>
                  {/* Day separator */}
                  {showDaySep ? (
                    <div
                      data-testid="day-separator"
                      className="my-3 flex items-center gap-2"
                      aria-label={dayLabel(message.created_at)}
                    >
                      <div className="flex-1 border-t border-edge" />
                      <span className="font-body text-micro text-text-muted">
                        {dayLabel(message.created_at)}
                      </span>
                      <div className="flex-1 border-t border-edge" />
                    </div>
                  ) : null}

                  {/* Message row — `group` so MessageBubble's reply btn hover works */}
                  <div
                    className="group mb-1.5 flex flex-col"
                    data-msgid={message.id}
                  >
                    {content}
                  </div>
                </div>
              )
            })}

            {/* Pending (optimistic) bubbles */}
            {pending.map((p) => (
              <div key={p.clientMsgId} className="group mb-1.5 flex flex-col">
                {p.state === 'sending' ? (
                  <div
                    data-testid="pending-sending"
                    className="ml-auto max-w-[80%] rounded-sheet bg-brand-subtle px-3 py-2 font-body text-small text-text-muted"
                  >
                    {p.body ?? '…'}
                    <span className="ml-1.5 opacity-60">sending…</span>
                  </div>
                ) : (
                  <div
                    data-testid="pending-failed"
                    className="ml-auto flex max-w-[80%] flex-col gap-1"
                  >
                    <div className="rounded-sheet border border-risk-fg/20 bg-risk-bg px-3 py-2 font-body text-small text-risk-fg">
                      {p.body ?? '…'}
                    </div>
                    <button
                      type="button"
                      onClick={() => retry(p.clientMsgId)}
                      className="self-end font-body text-micro text-brand-text hover:underline"
                    >
                      Tap to retry
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Autoscroll anchor */}
            <div ref={bottomRef} aria-hidden />
          </>
        )}
      </div>

      {/* ── Composer ──────────────────────────────────────────────────────── */}
      <ChatComposer
        onSend={send}
        onSendMedia={sendMedia}
        reply={reply}
        onCancelReply={() => setReply(null)}
        sending={sending}
        address={address}
      />
    </div>
  )
}
