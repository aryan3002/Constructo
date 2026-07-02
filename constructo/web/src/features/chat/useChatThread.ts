/**
 * useChatThread — integration spine for the web chat Phase A.
 *
 * Wires together:
 *  - chatApi (REST: initial load, send, loadOlder, cursors, read)
 *  - getChatSocket (WebSocket: incremental msg frames + receipts)
 *  - mergeMessages (pure deduplication + sort)
 *  - computeDeliveryState (tick derivation from cursors)
 *  - useMe (current user id for cursor filtering)
 *
 * Return shape is stable — downstream components (T7–T13) consume it.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { chatApi, newClientMsgId, type ChatAddress, type ChatMessage, type CursorOut } from '../../api/chat'
import { mergeMessages } from './threadMerge'
import { computeDeliveryState } from './ticks'
import { getChatSocket } from './socket'
import { uploadChatMedia } from './mediaUpload'
import { useMe } from '../../auth/useCan'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingMessage {
  clientMsgId: string
  body?: string
  state: 'sending' | 'failed'
  /** Optimistic object-URL preview for an in-flight image send. */
  previewUrl?: string
  /** Media kind for an in-flight attachment (drives the pending bubble shape). */
  mediaType?: 'image' | 'document' | 'voice'
  /** Client-only source file, kept so a failed media send can re-upload on retry. */
  file?: File
}

export interface SendMediaParams {
  attachmentKey: string
  mime: string
  sha256: string
  mediaType: 'image' | 'document' | 'voice'
  body?: string
  /** When set, reuse the optimistic pending bubble created by {@link startMedia}. */
  clientMsgId?: string
}

export interface StartMediaParams {
  clientMsgId: string
  previewUrl?: string
  mediaType?: 'image' | 'document' | 'voice'
  file?: File
}

export interface SendProposalParams {
  captureType: string
  fields: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// addrKey helper — stable string key for query keys + socket addressing
// ---------------------------------------------------------------------------

function toAddrKey(address: ChatAddress): string {
  return 'siteId' in address ? address.siteId! : address.conversationId!
}

/** Snake_case address body for the send endpoint. */
function addrBody(addr: ChatAddress): Record<string, string> {
  return 'siteId' in addr ? { site_id: addr.siteId! } : { conversation_id: addr.conversationId! }
}

/** True only when the tab is genuinely visible AND focused (WhatsApp read semantics). */
function isDocumentActive(): boolean {
  if (typeof document === 'undefined') return true
  const visible = document.visibilityState === 'visible'
  const focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true
  return visible && focused
}

/** Best-effort revoke of an object URL (guards jsdom / SSR). */
function revokeObjectUrl(url: string): void {
  try {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url)
    }
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OLDER_PAGE_LIMIT = 50
/** Baseline trim so live append/socket paths never re-slice loaded history. */
const DEFAULT_CAP = 200

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatThread(address: ChatAddress) {
  const queryClient = useQueryClient()
  const { data: me } = useMe()
  const addrKey = toAddrKey(address)

  // -------------------------------------------------------------------------
  // Accumulated message list (lives in React state so it survives re-renders
  // and accumulates socket frames + REST pages without a full refetch).
  // -------------------------------------------------------------------------
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hasOlder, setHasOlder] = useState(false)

  // Optimistic pending queue
  const [pending, setPending] = useState<PendingMessage[]>([])

  // Reply-to state
  const [reply, setReply] = useState<ChatMessage | null>(null)

  // Sending flag (at least one pending in 'sending' state)
  const sending = pending.some((p) => p.state === 'sending')

  // -------------------------------------------------------------------------
  // Refs that mirror the latest render values — keep callbacks stable
  // -------------------------------------------------------------------------
  const messagesRef = useRef<ChatMessage[]>(messages)
  const pendingRef = useRef<PendingMessage[]>(pending)
  const addressRef = useRef<ChatAddress>(address)

  // Update on every render (no effect needed — synchronous before any callbacks fire)
  messagesRef.current = messages
  pendingRef.current = pending
  addressRef.current = address

  // -------------------------------------------------------------------------
  // Initial load query — newest page first (opens pinned to the bottom).
  // The server returns the newest OLDER_PAGE_LIMIT rows in desc order;
  // mergeMessages re-sorts ascending so no rendering change is needed.
  // -------------------------------------------------------------------------
  const {
    isLoading,
    error,
    data: initialData,
  } = useQuery({
    queryKey: ['chat', 'thread', addrKey],
    queryFn: () => chatApi.messages(address, { order: 'desc', limit: OLDER_PAGE_LIMIT }),
    staleTime: Infinity,  // socket handles incremental updates
    refetchOnWindowFocus: false,
  })

  // Merge newly fetched data into state whenever it arrives, and arm upward
  // paging from the start (a full page implies there may be older history).
  useEffect(() => {
    if (initialData && initialData.length > 0) {
      setMessages((prev) =>
        mergeMessages(prev, initialData, Math.max(DEFAULT_CAP, prev.length + initialData.length)),
      )
      setHasOlder(initialData.length >= OLDER_PAGE_LIMIT)
    }
  }, [initialData])

  // -------------------------------------------------------------------------
  // Cursors query (for delivery ticks)
  // -------------------------------------------------------------------------
  const { data: cursors = [] } = useQuery<CursorOut[]>({
    queryKey: ['chat', 'cursors', addrKey],
    queryFn: () => chatApi.cursors(address),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  // -------------------------------------------------------------------------
  // deliveryState — derived from cursors + my user id
  // -------------------------------------------------------------------------
  const deliveryState = useCallback(
    (seq: number): 'sent' | 'delivered' | 'read' | undefined => {
      if (!me?.id) return undefined
      return computeDeliveryState(seq, cursors, me.id)
    },
    [cursors, me?.id],
  )

  // -------------------------------------------------------------------------
  // Socket subscription
  // -------------------------------------------------------------------------
  useEffect(() => {
    const maxSeq = messagesRef.current.reduce((m, msg) => Math.max(m, msg.seq), 0)
    const socket = getChatSocket()

    const unsub = socket.subscribe(addrKey, maxSeq, (frame) => {
      const type = frame.type as string | undefined

      if (type === 'msg') {
        const payload = frame.payload as ChatMessage | undefined
        if (payload) {
          setMessages((prev) =>
            mergeMessages(prev, [payload], Math.max(DEFAULT_CAP, prev.length + 1)),
          )
          socket.markDelivered(addrKey, payload.seq)
        }
      } else if (type === 'receipt') {
        // Refetch cursors so delivery ticks update
        void queryClient.invalidateQueries({ queryKey: ['chat', 'cursors', addrKey] })
      } else if (type === 'event_update') {
        // Re-fetch all messages to get updated event data
        void queryClient.invalidateQueries({ queryKey: ['chat', 'thread', addrKey] })
      }
    })

    return unsub
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrKey]) // intentionally only re-subscribe when addrKey changes

  // -------------------------------------------------------------------------
  // Mark-read effect: fires when the newest message seq changes — but only
  // advances the read cursor while the tab is visible AND focused, so a chat
  // left open in a background tab does not lie with blue ticks. A deferred seq
  // is flushed when the user returns (visibilitychange / focus).
  // -------------------------------------------------------------------------
  const newestSeq = messages.length > 0 ? messages[messages.length - 1].seq : 0
  const newestSeqRef = useRef(0)
  const deferredReadSeqRef = useRef(0)

  const advanceRead = useCallback(
    (seq: number) => {
      if (seq <= 0 || seq === newestSeqRef.current) return
      newestSeqRef.current = seq
      deferredReadSeqRef.current = 0
      void chatApi.read({ ...addressRef.current, lastSeq: seq })
      void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
    },
    [queryClient],
  )

  useEffect(() => {
    if (newestSeq > 0 && newestSeq !== newestSeqRef.current) {
      if (isDocumentActive()) {
        advanceRead(newestSeq)
      } else {
        // Stash — do NOT advance newestSeqRef, or the deferred flush is skipped.
        deferredReadSeqRef.current = newestSeq
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestSeq]) // address is stable per render cycle; queryClient never changes

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onReturn = () => {
      if (isDocumentActive() && deferredReadSeqRef.current > 0) {
        advanceRead(deferredReadSeqRef.current)
      }
    }
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
    return () => {
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
    }
  }, [advanceRead])

  // Revoke any outstanding optimistic preview URLs on unmount (conversation
  // switch remounts the hook via ChatThread's key).
  useEffect(() => {
    return () => {
      for (const p of pendingRef.current) {
        if (p.previewUrl) revokeObjectUrl(p.previewUrl)
      }
    }
  }, [])

  // -------------------------------------------------------------------------
  // send
  // -------------------------------------------------------------------------
  const send = useCallback(
    (body: string) => {
      const addr = addressRef.current
      const cid = newClientMsgId()
      setPending((prev) => [...prev, { clientMsgId: cid, body, state: 'sending' }])

      chatApi
        .send({
          ...addrBody(addr),
          client_msg_id: cid,
          body,
          reply_to_id: reply?.id ?? undefined,
        })
        .then((saved) => {
          // Merge the returned row immediately (idempotent with socket echo — same seq dedupes)
          setMessages((prev) => mergeMessages(prev, [saved], Math.max(DEFAULT_CAP, prev.length + 1)))
          setPending((prev) => prev.filter((p) => p.clientMsgId !== cid))
          setReply(null)
        })
        .catch(() => {
          setPending((prev) =>
            prev.map((p) => (p.clientMsgId === cid ? { ...p, state: 'failed' as const } : p)),
          )
        })
    },
    [addrKey, reply],
  )

  // -------------------------------------------------------------------------
  // startMedia — insert the optimistic pending bubble at the START of an
  // upload (before the R2 PUT), so the photo appears instantly.
  // -------------------------------------------------------------------------
  const startMedia = useCallback((p: StartMediaParams) => {
    setPending((prev) =>
      prev.some((x) => x.clientMsgId === p.clientMsgId)
        ? prev
        : [
            ...prev,
            {
              clientMsgId: p.clientMsgId,
              state: 'sending' as const,
              previewUrl: p.previewUrl,
              mediaType: p.mediaType,
              file: p.file,
            },
          ],
    )
  }, [])

  // -------------------------------------------------------------------------
  // failMedia — flip an in-flight media bubble to failed (upload error).
  // -------------------------------------------------------------------------
  const failMedia = useCallback((clientMsgId: string) => {
    setPending((prev) =>
      prev.map((p) => (p.clientMsgId === clientMsgId ? { ...p, state: 'failed' as const } : p)),
    )
  }, [])

  // -------------------------------------------------------------------------
  // retry — re-sends a failed pending message (media re-uploads from file)
  // -------------------------------------------------------------------------
  const retry = useCallback(
    (clientMsgId: string) => {
      const addr = addressRef.current
      const pend = pendingRef.current.find((p) => p.clientMsgId === clientMsgId)
      if (!pend || pend.state !== 'failed') return

      setPending((prev) =>
        prev.map((p) => (p.clientMsgId === clientMsgId ? { ...p, state: 'sending' as const } : p)),
      )

      const onOk = (saved: ChatMessage) => {
        setMessages((prev) => mergeMessages(prev, [saved], Math.max(DEFAULT_CAP, prev.length + 1)))
        setPending((prev) => {
          const hit = prev.find((p) => p.clientMsgId === clientMsgId)
          if (hit?.previewUrl) revokeObjectUrl(hit.previewUrl)
          return prev.filter((p) => p.clientMsgId !== clientMsgId)
        })
        setReply(null)
      }
      const onErr = () => {
        setPending((prev) =>
          prev.map((p) => (p.clientMsgId === clientMsgId ? { ...p, state: 'failed' as const } : p)),
        )
      }

      if (pend.file) {
        uploadChatMedia(addr, pend.file)
          .then(({ key, sha256, mime, mediaType }) =>
            chatApi.send({
              ...addrBody(addr),
              client_msg_id: clientMsgId,
              attachment_key: key,
              attachment_mime: mime,
              attachment_sha256: sha256,
              media_type: mediaType,
              reply_to_id: reply?.id ?? undefined,
            }),
          )
          .then(onOk)
          .catch(onErr)
      } else {
        chatApi
          .send({
            ...addrBody(addr),
            client_msg_id: clientMsgId,
            body: pend.body,
            reply_to_id: reply?.id ?? undefined,
          })
          .then(onOk)
          .catch(onErr)
      }
    },
    [addrKey, reply],
  )

  // -------------------------------------------------------------------------
  // sendMedia — called after the upload completes; reuses the optimistic
  // bubble created by startMedia (matched on clientMsgId).
  // -------------------------------------------------------------------------
  const sendMedia = useCallback(
    ({ attachmentKey, mime, sha256, mediaType, body, clientMsgId }: SendMediaParams) => {
      const addr = addressRef.current
      const cid = clientMsgId ?? newClientMsgId()
      setPending((prev) =>
        prev.some((p) => p.clientMsgId === cid)
          ? prev
          : [...prev, { clientMsgId: cid, body, state: 'sending' as const, mediaType }],
      )

      chatApi
        .send({
          ...addrBody(addr),
          client_msg_id: cid,
          body,
          attachment_key: attachmentKey,
          attachment_mime: mime,
          attachment_sha256: sha256,
          media_type: mediaType,
          reply_to_id: reply?.id ?? undefined,
        })
        .then((saved) => {
          setMessages((prev) => mergeMessages(prev, [saved], Math.max(DEFAULT_CAP, prev.length + 1)))
          setPending((prev) => {
            const hit = prev.find((p) => p.clientMsgId === cid)
            if (hit?.previewUrl) revokeObjectUrl(hit.previewUrl)
            return prev.filter((p) => p.clientMsgId !== cid)
          })
          setReply(null)
        })
        .catch(() => {
          setPending((prev) =>
            prev.map((p) => (p.clientMsgId === cid ? { ...p, state: 'failed' as const } : p)),
          )
        })
    },
    [addrKey, reply],
  )

  // -------------------------------------------------------------------------
  // sendProposal
  // -------------------------------------------------------------------------
  const sendProposal = useCallback(
    (captureType: string, fields: Record<string, unknown>) => {
      const addr = addressRef.current
      const cid = newClientMsgId()
      setPending((prev) => [...prev, { clientMsgId: cid, state: 'sending' }])

      chatApi
        .send({
          ...addrBody(addr),
          client_msg_id: cid,
          capture_type: captureType,
          fields,
          reply_to_id: reply?.id ?? undefined,
        })
        .then((saved) => {
          setMessages((prev) => mergeMessages(prev, [saved], Math.max(DEFAULT_CAP, prev.length + 1)))
          setPending((prev) => prev.filter((p) => p.clientMsgId !== cid))
          setReply(null)
        })
        .catch(() => {
          setPending((prev) =>
            prev.map((p) => (p.clientMsgId === cid ? { ...p, state: 'failed' as const } : p)),
          )
        })
    },
    [addrKey, reply],
  )

  // -------------------------------------------------------------------------
  // loadOlder — pages older history upward. Returns a promise so the caller
  // can preserve scroll position, and the cap grows with the list so a fetched
  // page is never immediately sliced back off.
  // -------------------------------------------------------------------------
  const loadOlder = useCallback((): Promise<void> => {
    const minSeq = messagesRef.current.length > 0 ? messagesRef.current[0].seq : 0
    if (minSeq === 0) return Promise.resolve()

    const addr = addressRef.current
    return chatApi
      .messages(addr, { beforeSeq: minSeq, order: 'desc', limit: OLDER_PAGE_LIMIT })
      .then((older) => {
        setMessages((prev) => mergeMessages(prev, older, prev.length + older.length))
        setHasOlder(older.length >= OLDER_PAGE_LIMIT)
      })
      .catch(() => {
        // Silently fail — user can retry via pull-to-load
      })
  }, [addrKey])

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------
  return {
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
  }
}
