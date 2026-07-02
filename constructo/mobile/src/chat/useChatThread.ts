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
import { effectiveMediaKind, signedMediaContentType } from './media'
import { drainPages } from './paging'
import {
  appendChatOutbox,
  drainChatOutbox,
  listChatOutbox,
  newOutboxItem,
  resetBackoff,
  retryPermanent,
  type ChatAddressBody,
  type ChatOutboxItem,
  type SendResult,
} from './outbox'
import { ChatSocket } from './socket'
import {
  deliveryStateMap,
  outboxConvKey,
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

function bodyToAddr(body: ChatAddressBody): ChatAddress {
  return body.conversation_id
    ? { conversationId: body.conversation_id }
    : { siteId: body.site_id ?? '' }
}

/**
 * The drain `send` callback: perform the idempotent POST. For a media item the
 * upload step runs first (presign → PUT → fallback multipart), persisting the
 * resolved key/sha256 back onto the item so a retry re-uses the same object.
 *
 * Addressing comes from the ITEM (its own conversation), never from whichever
 * thread happens to be mounted — a queued send for thread A drained while
 * thread B is open must presign/post against A. This also lets the app-launch
 * drain run with no thread mounted at all.
 *
 * On success the result carries the created server row (`msg`) so the caller
 * can merge it into the thread cache BEFORE the pending bubble is dropped —
 * the pending→confirmed swap happens in one commit, no blink.
 */
export async function performSend(item: ChatOutboxItem): Promise<SendResult> {
  const address = bodyToAddr(item.address)
  try {
    // Media two-step: resolve a stored key if this item carries a local file.
    let attachmentKey = item.media?.key
    let attachmentSha = item.media?.sha256
    if (item.media && !attachmentKey && item.media.localUri) {
      // Recover the real kind — older builds queued photos as 'document', which
      // the backend signs + stores as application/pdf: the PUT (sending an image
      // content-type) 403s and the send sticks on "Send…" forever. Then send the
      // EXACT content-type the backend signs for that kind (NOT the raw file mime,
      // which may be image/heic etc.) so the R2 signature matches. See ./media.
      // exactKind items (challan-as-document) skip the coercion — their kind is
      // extraction-semantic — and upload multipart only (nothing to mismatch).
      const kind = item.media.exactKind
        ? (item.media.kind ?? 'document')
        : effectiveMediaKind(item.media.kind, item.media.mime)
      item.media.kind = kind
      const contentType = item.media.exactKind
        ? (item.media.mime ?? signedMediaContentType(kind))
        : signedMediaContentType(kind)
      const file: UploadFile = {
        uri: item.media.localUri,
        name: `${item.clientMsgId}.${kind === 'voice' ? 'm4a' : (item.media.mime ?? '').startsWith('image/') || kind === 'image' ? 'jpg' : 'bin'}`,
        type: contentType,
      }
      let putOk = false
      if (!item.media.exactKind) {
        const presign = await chatApi.presignMedia({ ...address, kind })
        if (presign.upload_mode === 'presigned' && presign.put_url) {
          try {
            const blob = await (await fetch(file.uri)).blob()
            const putRes = await fetch(presign.put_url, {
              method: 'PUT',
              headers: { 'Content-Type': contentType },
              body: blob,
            })
            if (putRes.ok) {
              attachmentKey = presign.key
              // The presign path returns no sha256; the server dedupes on key here.
              attachmentSha = item.media.sha256
              putOk = true
            }
          } catch {
            // network / blob-read failure → fall through to the multipart upload.
          }
        }
      }
      if (!putOk) {
        // Multipart upload to /chat/media — robust fallback when the presigned
        // PUT is unavailable OR failed. The backend sets the stored content-type
        // server-side, so there is no signature to mismatch: this self-heals a
        // send that would otherwise be stuck on "Send…".
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
    // Stamp the local file uri onto the confirmed row (client-only field, kept
    // by the cache across merges) so the just-sent photo keeps rendering from
    // local bytes instead of flashing to a placeholder while it re-downloads.
    const withLocal: ChatMessage = item.media?.localUri
      ? { ...msg, attachment_local_uri: item.media.localUri }
      : msg
    return { ok: true, seq: msg.seq, msg: withLocal }
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

  // A single armed timer for the earliest still-queued retry, so a transiently
  // failed send actually re-attempts on schedule instead of waiting for the next
  // incidental trigger (mount/reconnect/foreground).
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Drain the durable outbox (serialized app-wide). Each confirmed item is
  // merged into its OWN thread's cache + query data BEFORE the pending bubble
  // is dropped — the pending→confirmed swap lands in one commit (no blink, no
  // refetch round-trip). Failures re-arm the retry timer for their backoff.
  const flush = useCallback(async () => {
    await guardedDrain(async (item) => {
      const result = await performSend(item)
      if (result.ok && result.msg) {
        const convKey = outboxConvKey(item.address)
        const merged = await mergeMessages(convKey, [result.msg])
        qc.setQueryData(['chat', 'thread', convKey], merged)
        // Same commit: the confirmed row is in the feed, the pending bubble goes.
        setOutbox((prev) => prev.filter((i) => i.clientMsgId !== item.clientMsgId))
      }
      return result
    })
    await refreshOutbox()
    // Re-arm the retry timer for the earliest queued backoff, if any remain.
    const queued = (await listChatOutbox()).filter((i) => i.state === 'queued')
    if (retryTimer.current) {
      clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
    if (queued.length) {
      const dueIn = Math.max(250, Math.min(...queued.map((i) => i.nextAttemptAt)) - Date.now())
      retryTimer.current = setTimeout(() => void flushRef.current(), dueIn)
    }
  }, [qc, refreshOutbox])
  const flushRef = useRef(flush)
  flushRef.current = flush

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
      const next = await chatApi.cursors(addressRef.current)
      // Identity-preserve when nothing moved: an unchanged cursor set otherwise
      // cascades (new array → new deliveryStates Map → new deliveryState
      // callback → every visible bubble re-renders) on every receipt frame.
      setCursors((prev) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      )
    } catch {
      /* ticks are best-effort */
    }
  }, [addrKey])

  // --- durable send + drain ------------------------------------------------
  // The pending bubble goes up on the TAP FRAME (synchronous setOutbox with the
  // locally-built item), then the item is persisted and the drain kicked. The
  // storage write still happens before any network, so durability is unchanged —
  // only the render no longer waits on two AsyncStorage round-trips.
  const enqueueOptimistic = useCallback(
    async (item: ChatOutboxItem) => {
      setOutbox((prev) => [...prev, item])
      await appendChatOutbox(item)
      void flushRef.current()
    },
    [],
  )

  const send = useCallback(
    async (body: string) => {
      const text = body.trim()
      if (!text) return
      const replyToId = reply?.id
      setReply(null)
      await enqueueOptimistic(
        newOutboxItem({
          clientMsgId: newClientMsgId(),
          address: addrToBody(addressRef.current),
          body: text,
          ...(replyToId ? { replyToId } : {}),
        }),
      )
    },
    [reply, enqueueOptimistic],
  )

  const sendProposal = useCallback(
    async (captureType: string, fields: Record<string, unknown>) => {
      await enqueueOptimistic(
        newOutboxItem({
          clientMsgId: newClientMsgId(),
          address: addrToBody(addressRef.current),
          captureType,
          fields,
        }),
      )
    },
    [enqueueOptimistic],
  )

  const sendMedia = useCallback<UseChatThread['sendMedia']>(
    async (mediaOpts) => {
      await enqueueOptimistic(
        newOutboxItem({
          clientMsgId: newClientMsgId(),
          address: addrToBody(addressRef.current),
          ...(mediaOpts.body ? { body: mediaOpts.body } : {}),
          media: {
            kind: mediaOpts.mediaType,
            mime: mediaOpts.mime,
            key: mediaOpts.attachmentKey,
            sha256: mediaOpts.sha256,
          },
        }),
      )
    },
    [enqueueOptimistic],
  )

  // --- drain triggers: mount, NetInfo reconnect, AppState→active ----------
  useEffect(() => {
    void refreshOutbox()
    void fetchCursors()
    void flush() // drain on mount (recovers stuck items from a prior session)

    const netSub = NetInfo.addEventListener((s) => {
      if (s.isConnected) {
        // Connectivity is back: retry NOW — don't make the user wait out the
        // remainder of an up-to-5-minute backoff earned while offline.
        void resetBackoff().then(() => flushRef.current())
      }
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
      if (retryTimer.current) {
        clearTimeout(retryTimer.current)
        retryTimer.current = null
      }
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
          // The frame carries the full row — put it straight into the feed.
          // (Invalidate-then-refetch would add a whole network round-trip to
          // every socket-delivered message; the poll still covers seq gaps.)
          void mergeMessages(addrKey, [payload]).then((merged) => {
            qc.setQueryData(['chat', 'thread', addrKey], merged)
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
  // NOTE: never used to disable the composer — WhatsApp parity means you can
  // queue the next message while the previous one is still on the wire.
  const sending = pending.some((p) => p.state !== 'failed_permanent')

  // Stable object identity when nothing changed, so screens can safely list
  // `thread` pieces in hook deps without re-rendering the feed per keystroke.
  const isLoading = q.isLoading
  const error = q.error
  const refetch = q.refetch
  return useMemo(
    () => ({
      messages,
      isLoading,
      error,
      sending,
      reply,
      setReply,
      send,
      sendMedia,
      sendProposal,
      refetch,
      pending,
      deliveryStates,
      deliveryState,
      flush,
      retry,
    }),
    [
      messages,
      isLoading,
      error,
      sending,
      reply,
      send,
      sendMedia,
      sendProposal,
      refetch,
      pending,
      deliveryStates,
      deliveryState,
      flush,
      retry,
    ],
  )
}

/**
 * App-launch drain (root layout): recover + send messages queued in a prior
 * session WITHOUT waiting for a chat screen to mount. Confirmed rows are merged
 * into each conversation's persisted cache so any thread opened later seeds
 * with them already present. Serialized through the same guard as hook flushes.
 */
export async function drainChatOutboxOnLaunch(): Promise<void> {
  await guardedDrain(async (item) => {
    const result = await performSend(item)
    if (result.ok && result.msg) {
      await mergeMessages(outboxConvKey(item.address), [result.msg])
    }
    return result
  })
}
