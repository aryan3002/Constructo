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
import { useMe } from '../../auth/useCan'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingMessage {
  clientMsgId: string
  body?: string
  state: 'sending' | 'failed'
}

export interface SendMediaParams {
  attachmentKey: string
  mime: string
  sha256: string
  mediaType: 'image' | 'document' | 'voice'
  body?: string
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OLDER_PAGE_LIMIT = 50

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
  // Initial load query
  // -------------------------------------------------------------------------
  const {
    isLoading,
    error,
    data: initialData,
  } = useQuery({
    queryKey: ['chat', 'thread', addrKey],
    queryFn: () => chatApi.messages(address, { afterSeq: 0 }),
    staleTime: Infinity,  // socket handles incremental updates
    refetchOnWindowFocus: false,
  })

  // Merge newly fetched data into state whenever it arrives
  useEffect(() => {
    if (initialData && initialData.length > 0) {
      setMessages((prev) => mergeMessages(prev, initialData))
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
          setMessages((prev) => mergeMessages(prev, [payload]))
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
  // Mark-read effect: fires when the newest message seq changes
  // -------------------------------------------------------------------------
  const newestSeq = messages.length > 0 ? messages[messages.length - 1].seq : 0
  const newestSeqRef = useRef(0)

  useEffect(() => {
    if (newestSeq > 0 && newestSeq !== newestSeqRef.current) {
      newestSeqRef.current = newestSeq
      void chatApi.read({ ...address, lastSeq: newestSeq })
      void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestSeq]) // address is stable per render cycle; queryClient never changes

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
          ...('siteId' in addr ? { site_id: addr.siteId! } : { conversation_id: addr.conversationId! }),
          client_msg_id: cid,
          body,
          reply_to_id: reply?.id ?? undefined,
        })
        .then(() => {
          // Drop pending — the real row arrives via socket or refetch merge
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
  // retry — re-sends a failed pending message
  // -------------------------------------------------------------------------
  const retry = useCallback(
    (clientMsgId: string) => {
      const addr = addressRef.current
      const pend = pendingRef.current.find((p) => p.clientMsgId === clientMsgId)
      if (!pend || pend.state !== 'failed') return

      setPending((prev) =>
        prev.map((p) => (p.clientMsgId === clientMsgId ? { ...p, state: 'sending' as const } : p)),
      )

      chatApi
        .send({
          ...('siteId' in addr ? { site_id: addr.siteId! } : { conversation_id: addr.conversationId! }),
          client_msg_id: clientMsgId,
          body: pend.body,
          reply_to_id: reply?.id ?? undefined,
        })
        .then(() => {
          setPending((prev) => prev.filter((p) => p.clientMsgId !== clientMsgId))
          setReply(null)
        })
        .catch(() => {
          setPending((prev) =>
            prev.map((p) => (p.clientMsgId === clientMsgId ? { ...p, state: 'failed' as const } : p)),
          )
        })
    },
    [addrKey, reply],
  )

  // -------------------------------------------------------------------------
  // sendMedia
  // -------------------------------------------------------------------------
  const sendMedia = useCallback(
    ({ attachmentKey, mime, sha256, mediaType, body }: SendMediaParams) => {
      const addr = addressRef.current
      const cid = newClientMsgId()
      setPending((prev) => [...prev, { clientMsgId: cid, body, state: 'sending' }])

      chatApi
        .send({
          ...('siteId' in addr ? { site_id: addr.siteId! } : { conversation_id: addr.conversationId! }),
          client_msg_id: cid,
          body,
          attachment_key: attachmentKey,
          attachment_mime: mime,
          attachment_sha256: sha256,
          media_type: mediaType,
          reply_to_id: reply?.id ?? undefined,
        })
        .then(() => {
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
  // sendProposal
  // -------------------------------------------------------------------------
  const sendProposal = useCallback(
    (captureType: string, fields: Record<string, unknown>) => {
      const addr = addressRef.current
      const cid = newClientMsgId()
      setPending((prev) => [...prev, { clientMsgId: cid, state: 'sending' }])

      chatApi
        .send({
          ...('siteId' in addr ? { site_id: addr.siteId! } : { conversation_id: addr.conversationId! }),
          client_msg_id: cid,
          capture_type: captureType,
          fields,
          reply_to_id: reply?.id ?? undefined,
        })
        .then(() => {
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
  // loadOlder
  // -------------------------------------------------------------------------
  const loadOlder = useCallback(() => {
    const minSeq = messagesRef.current.length > 0 ? messagesRef.current[0].seq : 0
    if (minSeq === 0) return

    const addr = addressRef.current
    chatApi
      .messages(addr, { beforeSeq: minSeq, order: 'desc', limit: OLDER_PAGE_LIMIT })
      .then((older) => {
        setMessages((prev) => mergeMessages(prev, older))
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
    sendProposal,
    loadOlder,
    hasOlder,
    deliveryState,
    retry,
    pending,
  }
}
