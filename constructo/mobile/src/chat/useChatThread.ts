/**
 * Headless thread logic for the unified chat kit — one conversation, addressed by
 * `siteId` (crew thread) XOR `conversationId` (group / homeowner). Offline-first
 * (spine A8–A11):
 *
 *  - Cache-first load: the feed seeds instantly from the persisted thread cache
 *    ({@link loadThreadCache}); the network sync is INCREMENTAL — it fetches only
 *    `after_seq = maxCachedSeq` and merges, replacing the old full afterSeq:0
 *    refetch. Polling stays as a cheap fallback while the socket is down.
 *  - Durable send: {@link send}/{@link sendMedia} enqueue to the persisted outbox
 *    FIRST (an app-kill in a dead zone never loses a message), then trigger a
 *    drain. The pending bubble is backed by storage, not React state.
 *  - Live socket: a MODULE-LEVEL singleton {@link ChatSocket} (one per app
 *    session) notifies of new messages / event upgrades / receipts; REST after_seq
 *    remains the one sync path (the socket is a notifier).
 *  - Ticks: per-message delivery state (sent|delivered|read) derived from the
 *    member cursor set.
 *
 * The supervisor / owner / homeowner thread screens all drive their feed +
 * composer from this, instead of each re-implementing it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import NetInfo from '@react-native-community/netinfo'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import {
  chatApi,
  newClientMsgId,
  type ChatAddress,
  type ChatMessage,
  type CursorOut,
} from '../api/chat'
import { CHAT_WS_URL } from '../api/config'
import { uploadMultipart, type UploadFile } from '../api/client'
import { loadThreadCache, maxCachedSeq, mergeMessages } from './cache'
import { drainPages } from './paging'
import {
  drainChatOutbox,
  enqueueChatSend,
  listChatOutbox,
  retryPermanent,
  type ChatAddressBody,
  type ChatOutboxItem,
  type SendResult,
} from './outbox'
import { ChatSocket } from './socket'
import {
  deliveryStateMap,
  pendingForThread,
  syncOrCache,
  type DeliveryState,
  type PendingMessage,
} from './threadState'

export interface UseChatThread {
  messages: ChatMessage[]
  isLoading: boolean
  error: unknown
  sending: boolean
  /** The message being replied to (quote-reply), or null. */
  reply: ChatMessage | null
  setReply: (m: ChatMessage | null) => void
  /** Send `body` as a text message (durable + idempotent). Resolves once the
   *  message is QUEUED (storage-backed) — it does not wait for the network, so it
   *  no longer throws on a transient failure; the outbox retries. */
  send: (body: string) => Promise<void>
  /** Send an uploaded media attachment (image/document/voice) as a message. */
  sendMedia: (opts: {
    attachmentKey: string
    mime: string
    sha256: string
    mediaType: 'image' | 'document' | 'voice'
    body?: string
  }) => Promise<void>
  refetch: () => void
  /** Not-yet-confirmed outbox messages for this thread (render as pending bubbles). */
  pending: PendingMessage[]
  /** seq → delivery tick for the caller's own messages (sent|delivered|read). */
  deliveryStates: Map<number, DeliveryState>
  /** Per-message delivery tick helper for the caller's own messages. */
  deliveryState: (msg: ChatMessage) => DeliveryState | undefined
  /** Force a drain of the durable outbox (e.g. a "retry now" tap). */
  flush: () => Promise<void>
  /** Re-queue a permanently-failed send (a "tap to retry" on its bubble), then drain. */
  retry: (clientMsgId: string) => Promise<void>
  /** Commit a Nivaan proposal: a human tap that books the capture via the
   *  deterministic fast-path (capture_type+fields). The agent never calls this. */
  sendProposal: (captureType: string, fields: Record<string, unknown>) => Promise<void>
}

// The server caps a /chat/messages page at MAX_LIMIT=200; request that so the
// thread drains in a few pages, not 50-at-a-time.
const PAGE_SIZE = 200

// --- module-level socket singleton (one per app session) --------------------
// Lazily created on the first thread mount; shared across every thread so the
// app holds exactly one multiplexed WS. Per-conversation onFrame routing is done
// via a registry the mounted hooks register into.
type FrameHandler = (frame: Record<string, unknown>) => void
const frameHandlers = new Map<string, Set<FrameHandler>>()
let sharedSocket: ChatSocket | null = null
let socketConnecting = false

function getSharedSocket(): ChatSocket {
  if (sharedSocket) return sharedSocket
  sharedSocket = new ChatSocket({
    getTicket: () => chatApi.wsTicket().then((r) => r.ticket),
    baseWsUrl: CHAT_WS_URL,
    onFrame: (frame) => {
      const conv = typeof frame.conv === 'string' ? frame.conv : null
      if (!conv) return
      for (const h of frameHandlers.get(conv) ?? []) h(frame)
    },
  })
  if (!socketConnecting) {
    socketConnecting = true
    void sharedSocket.connect().catch(() => {
      // The socket's own reconnect loop owns recovery; clear the guard so a
      // later getSharedSocket() (e.g. after app restart of JS) can retry.
      socketConnecting = false
    })
  }
  return sharedSocket
}

/** Test seam: reset the module singleton + handler registry between tests. */
export function __resetChatSocketForTests(): void {
  sharedSocket = null
  socketConnecting = false
  frameHandlers.clear()
}

// --- in-flight drain guard (module-level) -----------------------------------
// Two concurrent triggers (NetInfo regain + a manual flush + a post-send drain)
// must not both read/write the outbox AsyncStorage key — a double-run could
// double-send. A single boolean serializes drains app-wide; a trailing re-run
// flag ensures a trigger that arrived mid-drain isn't lost.
let draining = false
let drainAgain = false

async function guardedDrain(send: (item: ChatOutboxItem) => Promise<SendResult>): Promise<void> {
  if (draining) {
    drainAgain = true
    return
  }
  draining = true
  try {
    await drainChatOutbox(send)
    while (drainAgain) {
      drainAgain = false
      await drainChatOutbox(send)
    }
  } finally {
    draining = false
  }
}

/** Reset the drain guard between tests (module state persists across cases). */
export function __resetChatDrainForTests(): void {
  draining = false
  drainAgain = false
}

function addrToBody(address: ChatAddress): ChatAddressBody {
  return 'conversationId' in address
    ? { conversation_id: address.conversationId }
    : { site_id: address.siteId }
}

/**
 * The drain `send` callback: perform the idempotent POST. For a media item the
 * upload step runs first (presign → PUT → fallback multipart), persisting the
 * resolved key/sha256 back onto the item so a retry re-uses the same object.
 */
export async function performSend(
  item: ChatOutboxItem,
  address: ChatAddress,
): Promise<SendResult> {
  try {
    // Media two-step: resolve a stored key if this item carries a local file.
    let attachmentKey = item.media?.key
    let attachmentSha = item.media?.sha256
    if (item.media && !attachmentKey && item.media.localUri) {
      const kind = item.media.kind ?? 'document'
      const mime = item.media.mime ?? 'application/octet-stream'
      const presign = await chatApi.presignMedia({ ...address, kind })
      const file: UploadFile = {
        uri: item.media.localUri,
        name: `${item.clientMsgId}.${kind === 'image' ? 'jpg' : kind === 'voice' ? 'm4a' : 'bin'}`,
        type: mime,
      }
      if (presign.upload_mode === 'presigned' && presign.put_url) {
        const blob = await (await fetch(file.uri)).blob()
        const putRes = await fetch(presign.put_url, {
          method: 'PUT',
          headers: { 'Content-Type': mime },
          body: blob,
        })
        if (!putRes.ok) return { ok: false, permanent: false }
        attachmentKey = presign.key
        // The presign path returns no sha256; the server dedupes on key here.
        attachmentSha = item.media.sha256
      } else {
        // Fallback: the existing multipart upload to /chat/media.
        const form = new FormData()
        form.append('file', file as unknown as Blob)
        if (item.address.conversation_id)
          form.append('conversation_id', item.address.conversation_id)
        else if (item.address.site_id) form.append('site_id', item.address.site_id)
        form.append('kind', kind)
        const uploaded = await uploadMultipart<{ key: string; sha256: string }>(
          '/api/v1/chat/media',
          form,
        )
        attachmentKey = uploaded.key
        attachmentSha = uploaded.sha256
      }
      // Persist the resolved key back so a later retry skips re-uploading.
      item.media.key = attachmentKey
      item.media.sha256 = attachmentSha
    }

    const msg = await chatApi.send({
      ...item.address,
      client_msg_id: item.clientMsgId,
      ...(item.body ? { body: item.body } : {}),
      ...(item.replyToId ? { reply_to_id: item.replyToId } : {}),
      ...(item.captureType ? { capture_type: item.captureType } : {}),
      ...(item.fields ? { fields: item.fields } : {}),
      ...(attachmentKey
        ? {
            media_type: item.media?.kind ?? 'document',
            attachment_key: attachmentKey,
            attachment_mime: item.media?.mime,
            ...(attachmentSha ? { attachment_sha256: attachmentSha } : {}),
          }
        : { media_type: 'text' }),
    })
    return { ok: true, seq: msg.seq }
  } catch (err) {
    // A 4xx (validation / forbidden) is permanent — parking beats infinite retry.
    const status = (err as { status?: number })?.status
    const permanent = typeof status === 'number' && status >= 400 && status < 500
    return { ok: false, permanent }
  }
}

export function useChatThread(
  address: ChatAddress,
  opts?: { pollMs?: number; myUserId?: string | null },
): UseChatThread {
  const qc = useQueryClient()
  const addrKey = 'conversationId' in address ? address.conversationId : address.siteId
  const [reply, setReply] = useState<ChatMessage | null>(null)
  const [outbox, setOutbox] = useState<ChatOutboxItem[]>([])
  const [cursors, setCursors] = useState<CursorOut[]>([])

  // Stable address ref so callbacks/effects keyed on addrKey don't churn.
  const addressRef = useRef(address)
  addressRef.current = address

  const refreshOutbox = useCallback(async () => {
    setOutbox(await listChatOutbox())
  }, [])

  // Drain the durable outbox (serialized app-wide), then refresh both the local
  // outbox snapshot and the server feed so confirmed sends replace pending ones.
  const flush = useCallback(async () => {
    await guardedDrain((item) => performSend(item, addressRef.current))
    await refreshOutbox()
    void qc.invalidateQueries({ queryKey: ['chat', 'thread', addrKey] })
  }, [qc, addrKey, refreshOutbox])

  const retry = useCallback(
    async (clientMsgId: string) => {
      await retryPermanent(clientMsgId)
      await refreshOutbox()
      await flush()
    },
    [refreshOutbox, flush],
  )

  // The FIRST sync after a thread opens fetches from seq 0 (a full refresh) so
  // every message's attachment_url is re-resolved to a FRESH presigned GET. The
  // server's presign TTL is ~1h and the incremental (after_seq) path never re-
  // fetches already-cached messages — so without this, photos sent >1h ago go
  // blank on reopen (their cached presign expired). Later polls stay incremental.
  const urlsRefreshed = useRef(false)

  // --- cache-first incremental query --------------------------------------
  const q = useQuery({
    queryKey: ['chat', 'thread', addrKey],
    queryFn: () =>
      // Offline-first: on a fetch failure, fall back to the persisted cache so a
      // reopened thread keeps its messages instead of flipping to an error after
      // the retries exhaust (the "shows for 4s then disappears" bug).
      syncOrCache(
        async () => {
          // First run this mount → full refresh (after_seq=0) to renew presigned
          // attachment URLs; subsequent polls → incremental from the newest seq.
          const after = urlsRefreshed.current ? await maxCachedSeq(addrKey as string) : 0
          // Drain ALL pages back-to-back in this one sync (the server caps each
          // page at 200) so a large seeded thread loads in one shot instead of
          // 50-rows-per-8s-poll (the "messages trickle in over 1-2 min" bug).
          // On a steady-state poll `after` is the newest seq, so this is a single
          // page fetch (usually empty) — no extra cost.
          const pages = await drainPages(
            (afterSeq) => chatApi.messages({ ...addressRef.current, afterSeq, limit: PAGE_SIZE }),
            after,
            PAGE_SIZE,
          )
          urlsRefreshed.current = true
          return pages.length
            ? mergeMessages(addrKey as string, pages)
            : loadThreadCache(addrKey as string)
        },
        () => loadThreadCache(addrKey as string),
      ),
    initialData: undefined,
    // Polling stays as a cheap incremental fallback (now after_seq, not 0). The
    // socket is the latency win on top; if it's down, the poll still syncs.
    refetchInterval: opts?.pollMs ?? 8000,
    enabled: !!addrKey,
  })
  const messages = useMemo(() => q.data ?? [], [q.data])

  // Re-refresh presigned attachment URLs whenever the thread regains focus, not
  // only on first mount. The mount-only refresh (urlsRefreshed) misses a thread
  // that stays mounted — a contractor tab the user returns to, or a screen kept
  // alive by Fast Refresh — so its photos' ~1h presigns expire and go blank
  // until a full remount. On every focus after the first, force the next sync to
  // be a full refresh (after_seq=0). The first focus is skipped because the
  // initial mount query already does a full refresh.
  const refetchRef = useRef(q.refetch)
  refetchRef.current = q.refetch
  const firstFocus = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false
        return
      }
      urlsRefreshed.current = false
      void refetchRef.current()
    }, []),
  )

  // Seed the feed from the persisted cache the instant the thread mounts, before
  // the network resolves (offline-first). Done as an effect (not initialData)
  // because the cache read is async.
  useEffect(() => {
    if (!addrKey) return
    let alive = true
    void loadThreadCache(addrKey).then((cached) => {
      if (alive && cached.length && !q.data) {
        qc.setQueryData(['chat', 'thread', addrKey], cached)
      }
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrKey])

  // --- mark-read cursor + inbox-badge refresh -----------------------------
  const newestSeq = messages.length > 0 ? messages[messages.length - 1].seq : 0
  useEffect(() => {
    if (!addrKey || newestSeq <= 0) return
    chatApi
      .read({ ...addressRef.current, lastSeq: newestSeq })
      .then(() => {
        qc.invalidateQueries({ queryKey: ['homeowner', 'conversations'] })
        qc.invalidateQueries({ queryKey: ['owner', 'conversations'] })
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrKey, newestSeq, qc])

  // --- cursor fetch (delivery/read ticks) ---------------------------------
  const fetchCursors = useCallback(async () => {
    if (!addrKey) return
    try {
      setCursors(await chatApi.cursors(addressRef.current))
    } catch {
      /* ticks are best-effort */
    }
  }, [addrKey])

  // --- durable send + drain ------------------------------------------------
  const send = useCallback(
    async (body: string) => {
      const text = body.trim()
      if (!text) return
      const replyToId = reply?.id
      setReply(null)
      await enqueueChatSend({
        clientMsgId: newClientMsgId(),
        address: addrToBody(addressRef.current),
        body: text,
        ...(replyToId ? { replyToId } : {}),
      })
      await refreshOutbox()
      void flush()
    },
    [reply, refreshOutbox, flush],
  )

  const sendProposal = useCallback(
    async (captureType: string, fields: Record<string, unknown>) => {
      await enqueueChatSend({
        clientMsgId: newClientMsgId(),
        address: addrToBody(addressRef.current),
        captureType,
        fields,
      })
      await refreshOutbox()
      void flush()
    },
    [refreshOutbox, flush],
  )

  const sendMedia = useCallback<UseChatThread['sendMedia']>(
    async (mediaOpts) => {
      await enqueueChatSend({
        clientMsgId: newClientMsgId(),
        address: addrToBody(addressRef.current),
        ...(mediaOpts.body ? { body: mediaOpts.body } : {}),
        media: {
          kind: mediaOpts.mediaType,
          mime: mediaOpts.mime,
          key: mediaOpts.attachmentKey,
          sha256: mediaOpts.sha256,
        },
      })
      await refreshOutbox()
      void flush()
    },
    [refreshOutbox, flush],
  )

  // --- drain triggers: mount, NetInfo reconnect, AppState→active ----------
  useEffect(() => {
    void refreshOutbox()
    void fetchCursors()
    void flush() // drain on mount (recovers stuck items from a prior session)

    const netSub = NetInfo.addEventListener((s) => {
      if (s.isConnected) void flush()
    })
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void flush()
        void fetchCursors()
      }
    })
    return () => {
      netSub()
      appSub.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrKey])

  // --- live socket: subscribe this thread; route frames -------------------
  useEffect(() => {
    if (!addrKey) return
    const socket = getSharedSocket()
    let cancelled = false

    const handler: FrameHandler = (frame) => {
      const type = frame.type
      if (type === 'msg') {
        const payload = frame.payload as ChatMessage | undefined
        if (payload && typeof payload.seq === 'number') {
          void mergeMessages(addrKey, [payload]).then(() => {
            qc.invalidateQueries({ queryKey: ['chat', 'thread', addrKey] })
          })
          socket.markDelivered(addrKey, payload.seq)
        } else {
          qc.invalidateQueries({ queryKey: ['chat', 'thread', addrKey] })
        }
      } else if (type === 'event_update') {
        // An extraction upgrade for a message already in the feed — refetch so
        // the merged copy (newer wins) carries the events/raw_status.
        qc.invalidateQueries({ queryKey: ['chat', 'thread', addrKey] })
      } else if (type === 'receipt') {
        void fetchCursors()
      }
    }

    const set = frameHandlers.get(addrKey) ?? new Set<FrameHandler>()
    set.add(handler)
    frameHandlers.set(addrKey, set)

    void maxCachedSeq(addrKey).then((after) => {
      if (!cancelled) socket.subscribe(addrKey, after)
    })

    return () => {
      cancelled = true
      const s = frameHandlers.get(addrKey)
      if (s) {
        s.delete(handler)
        if (s.size === 0) frameHandlers.delete(addrKey)
      }
      socket.unsubscribe(addrKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrKey, qc, fetchCursors])

  // --- derived: pending bubbles + delivery ticks --------------------------
  const myUserId = opts?.myUserId ?? null
  const pending = useMemo(
    () => pendingForThread(addrKey ?? '', outbox, messages),
    [addrKey, outbox, messages],
  )
  const deliveryStates = useMemo(
    () => deliveryStateMap(messages, cursors, myUserId),
    [messages, cursors, myUserId],
  )
  const deliveryState = useCallback(
    (msg: ChatMessage) => deliveryStates.get(msg.seq),
    [deliveryStates],
  )

  // `sending` is true while any outbox item for this thread is still in flight.
  const sending = pending.some((p) => p.state !== 'failed_permanent')

  return {
    messages,
    isLoading: q.isLoading,
    error: q.error,
    sending,
    reply,
    setReply,
    send,
    sendMedia,
    sendProposal,
    refetch: q.refetch,
    pending,
    deliveryStates,
    deliveryState,
    flush,
    retry,
  }
}
