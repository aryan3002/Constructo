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

import { useLayoutEffect, useRef, useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useChatThread } from './useChatThread'
import { MessageBubble } from './MessageBubble'
import { CaptureCard } from './CaptureCard'
import { NivaanProposalCard } from './NivaanProposalCard'
import { SystemNotice } from './SystemNotice'
import { ChatComposer } from './ChatComposer'
import { BriefPin } from './insights/BriefPin'
import { RadarDrawer } from './insights/RadarDrawer'
import { RecapDrawer } from './insights/RecapDrawer'
import { ActionItemsDrawer } from './actionitems/ActionItemsDrawer'
import { DisputeModal } from './disputes/DisputeModal'
import { useMe } from '../../auth/useCan'
import { useToast } from '../../ui/Toast'
import { chatApi, type ChatAddress, type ChatEvent, type ChatMessage } from '../../api/chat'
import { actionItemsApi } from '../../api/actionItems'

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
  /** When set (group threads), shows a "Members" button that opens the manage drawer. */
  onManageGroup?: () => void
  /** The thread's site (Phase D) — enables the brief pin + Radar/Recap/To-dos + card dispute/to-do. */
  siteId?: string
  /** Best-effort: scroll this message id into view on open (activity deep-link). */
  scrollToMessageId?: string
}

// ---------------------------------------------------------------------------
// ChatThread
// ---------------------------------------------------------------------------

export function ChatThread({ address, title, hasHomeowner, onManageGroup, siteId, scrollToMessageId }: ChatThreadProps) {
  const { data: me } = useMe()
  const { show } = useToast()
  const queryClient = useQueryClient()

  const {
    messages,
    isLoading,
    error,
    sending,
    reply,
    setReply,
    send,
    sendMedia,
    startMedia,
    failMedia,
    sendProposal,
    loadOlder,
    hasOlder,
    deliveryState,
    retry,
    pending,
  } = useChatThread(address)

  // ---- Scroll management ----
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Pinned-to-bottom tracking so a new message never yanks a reader who has
  // scrolled up into history; only own sends / an at-bottom view autoscroll.
  const atBottomRef = useRef(true)
  const loadingOlderRef = useRef(false)
  const olderBeforeHeightRef = useRef<number | null>(null)
  const prevFirstSeqRef = useRef<number | null>(null)
  const prevPendingLenRef = useRef(pending.length)
  const firstPaintRef = useRef(true)
  // Deep-link scroll target (activity feed → a specific photo/message). While a
  // target is pending we suppress the bottom-autoscroll so the view lands on the
  // message, not the newest row. Best-effort: no-op if the id isn't in the thread.
  const scrolledToRef = useRef<string | null>(null)
  const pendingScroll = Boolean(scrollToMessageId && scrolledToRef.current !== scrollToMessageId)

  useLayoutEffect(() => {
    const el = listRef.current
    const firstSeq = messages.length > 0 ? messages[0].seq : null

    // Older history just prepended (first seq shrank) → preserve reading
    // position instead of teleporting to the bottom.
    const prepended =
      firstSeq !== null &&
      prevFirstSeqRef.current !== null &&
      firstSeq < prevFirstSeqRef.current

    if (prepended) {
      prevFirstSeqRef.current = firstSeq
      prevPendingLenRef.current = pending.length
      if (el && olderBeforeHeightRef.current !== null) {
        const delta = el.scrollHeight - olderBeforeHeightRef.current
        olderBeforeHeightRef.current = null
        if (delta > 0) el.scrollTop += delta
      }
      return
    }

    prevFirstSeqRef.current = firstSeq

    const ownSend = pending.length > prevPendingLenRef.current
    prevPendingLenRef.current = pending.length

    const shouldScroll =
      (firstPaintRef.current || ownSend || atBottomRef.current) && !pendingScroll
    if (!shouldScroll) return

    // Guard: jsdom does not implement scrollIntoView; real browsers do.
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: firstPaintRef.current ? 'auto' : 'smooth' })
    }
    if (firstSeq !== null || pending.length > 0) firstPaintRef.current = false
  }, [messages, pending.length])

  // ---- Deep-link scroll: bring a target message into view once it's loaded ----
  useLayoutEffect(() => {
    if (!scrollToMessageId || scrolledToRef.current === scrollToMessageId) return
    if (messages.length === 0) return
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-msgid="${scrollToMessageId}"]`,
    )
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center' })
      scrolledToRef.current = scrollToMessageId
      firstPaintRef.current = false // don't let the bottom anchor override the landing
    }
  }, [scrollToMessageId, messages])

  // ---- loadOlder trigger — ONE guarded path shared by the scroll-to-top
  // auto-load and the manual button. The loadingOlderRef guard means neither can
  // double-fire, and the scroll-restore height (olderBeforeHeightRef) is captured
  // exactly once per load — a second trigger mid-load can't overwrite it with a
  // post-prepend height and corrupt the delta. ----
  const triggerLoadOlder = useCallback(() => {
    const el = listRef.current
    if (!el || !hasOlder || loadingOlderRef.current) return
    loadingOlderRef.current = true
    olderBeforeHeightRef.current = el.scrollHeight
    void loadOlder().finally(() => {
      loadingOlderRef.current = false
    })
  }, [hasOlder, loadOlder])

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (el.scrollTop < 80) triggerLoadOlder()
  }, [triggerLoadOlder])

  // ---- Load-older button: the same guarded path (captures height first). ----
  const handleLoadOlderClick = triggerLoadOlder

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
  // Phase D — command tools (site threads only)
  // -------------------------------------------------------------------------
  const [radarOpen, setRadarOpen] = useState(false)
  const [recapOpen, setRecapOpen] = useState(false)
  const [todosOpen, setTodosOpen] = useState(false)
  const [disputeFor, setDisputeFor] = useState<{ eventId: string; contested: boolean } | null>(null)

  const briefQuery = useQuery({
    queryKey: ['chat', 'brief', siteId],
    queryFn: () => chatApi.brief(siteId!),
    enabled: !!siteId,
    staleTime: 30_000,
  })

  const addrKey = 'siteId' in address ? address.siteId : address.conversationId

  const makeTodo = useCallback(
    async (message: ChatMessage, ev: ChatEvent) => {
      if (!siteId) return
      try {
        await actionItemsApi.create({
          site_id: siteId,
          title: ev.summary || 'Follow up',
          source_message_id: message.id,
        })
        await queryClient.invalidateQueries({ queryKey: ['chat', 'actionItems', siteId] })
        show({ status: 'ok', message: 'Added to to-dos' })
      } catch (e) {
        show({ status: 'risk', message: e instanceof Error ? e.message : 'Could not add the to-do' })
      }
    },
    [siteId, show, queryClient],
  )

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
        <div className="flex items-center justify-between gap-2">
          {title ? (
            <h2 className="min-w-0 truncate font-body text-h2 font-semibold text-text-primary">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <div className="flex shrink-0 items-center gap-1.5">
            {siteId ? (
              <>
                <button type="button" onClick={() => setRadarOpen(true)} className="rounded-full border border-edge bg-surface-card px-3 py-1 font-body text-small font-medium text-text-primary hover:bg-surface-hover">
                  Radar
                </button>
                <button type="button" onClick={() => setRecapOpen(true)} className="rounded-full border border-edge bg-surface-card px-3 py-1 font-body text-small font-medium text-text-primary hover:bg-surface-hover">
                  Recap
                </button>
                <button type="button" onClick={() => setTodosOpen(true)} className="rounded-full border border-edge bg-surface-card px-3 py-1 font-body text-small font-medium text-text-primary hover:bg-surface-hover">
                  To-dos
                </button>
              </>
            ) : null}
            {onManageGroup ? (
              <button type="button" onClick={onManageGroup} className="rounded-full border border-edge bg-surface-card px-3 py-1 font-body text-small font-medium text-text-primary hover:bg-surface-hover">
                Members
              </button>
            ) : null}
          </div>
        </div>

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
        {/* Pinned brief (Phase D) — site threads with risks only */}
        {siteId ? <BriefPin brief={briefQuery.data} /> : null}

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
                  onClick={handleLoadOlderClick}
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
                      onDispute={siteId ? () => setDisputeFor({ eventId: ev.id, contested: ev.contested }) : undefined}
                      onMakeTodo={siteId ? () => makeTodo(message, ev) : undefined}
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
            {pending.map((p) => {
              // Reserve the same fixed-size box as a confirmed image bubble so
              // the optimistic preview does not reflow when it swaps to the real row.
              const preview = p.previewUrl ? (
                <div className="mb-1 h-[180px] w-[240px] overflow-hidden rounded-md bg-surface-sunken">
                  <img
                    src={p.previewUrl}
                    alt="attachment preview"
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null

              return (
                <div key={p.clientMsgId} className="group mb-1.5 flex flex-col">
                  {p.state === 'sending' ? (
                    <div
                      data-testid="pending-sending"
                      className="ml-auto flex max-w-[80%] flex-col rounded-sheet bg-brand-subtle px-3 py-2 font-body text-small text-text-muted"
                    >
                      {preview}
                      {p.body ? <span className="text-text-primary">{p.body}</span> : null}
                      <span className="opacity-60">{preview ? 'Sending photo…' : 'sending…'}</span>
                    </div>
                  ) : (
                    <div
                      data-testid="pending-failed"
                      className="ml-auto flex max-w-[80%] flex-col gap-1"
                    >
                      {preview}
                      <div className="rounded-sheet border border-risk-fg/20 bg-risk-bg px-3 py-2 font-body text-small text-risk-fg">
                        {p.body ?? (preview ? 'Photo failed to send' : '…')}
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
              )
            })}

            {/* Autoscroll anchor */}
            <div ref={bottomRef} aria-hidden />
          </>
        )}
      </div>

      {/* ── Composer ──────────────────────────────────────────────────────── */}
      <ChatComposer
        onSend={send}
        onSendMedia={sendMedia}
        onMediaStart={startMedia}
        onMediaError={failMedia}
        onSendProposal={sendProposal}
        reply={reply}
        onCancelReply={() => setReply(null)}
        sending={sending}
        address={address}
      />

      {/* ── Phase D command tools (site threads only) ─────────────────────── */}
      {siteId ? (
        <>
          <RadarDrawer open={radarOpen} onClose={() => setRadarOpen(false)} siteId={siteId} />
          <RecapDrawer open={recapOpen} onClose={() => setRecapOpen(false)} siteId={siteId} />
          <ActionItemsDrawer open={todosOpen} onClose={() => setTodosOpen(false)} siteId={siteId} />
        </>
      ) : null}
      {disputeFor ? (
        <DisputeModal
          open
          onClose={() => setDisputeFor(null)}
          eventId={disputeFor.eventId}
          contested={disputeFor.contested}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['chat', 'thread', addrKey] })}
        />
      ) : null}
    </div>
  )
}
