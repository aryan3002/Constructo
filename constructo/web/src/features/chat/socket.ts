/**
 * Shared WebSocket singleton for the Constructo web chat (Phase A).
 *
 * Mirrors the mobile `constructo/mobile/src/chat/socket.ts` design:
 * - One socket per app session (module-level singleton)
 * - Multiplexed: many conversation subscriptions over a single WS
 * - Reconnect: exponential backoff + jitter (1s → 30s cap)
 * - Resubscribes all active convs on reconnect
 * - Ping every 30s to keep the connection alive
 * - Injectable WebSocket factory for testability
 *
 * Frame protocol (v:1):
 *   Client→server: sub | unsub | delivered | read | ping
 *   Server→client: hello | sub_ok | msg | receipt | event_update | pong | error
 *
 * Connection:
 *   POST /api/v1/chat/ws-ticket → { ticket }
 *   then: new WebSocket(wssBase + '/api/v1/chat/ws?ticket=' + ticket)
 */
import { chatApi } from '../../api/chat'
import { API_BASE } from '../../api/config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChatFrame = Record<string, unknown>

/** Called for every frame whose `conv` matches the subscribed addrKey,
 *  or for global frames (hello, pong) which have no `conv` field. */
export type FrameHandler = (frame: ChatFrame) => void

/** A WebSocket factory — default is `globalThis.WebSocket`; tests inject a mock. */
export type WsFactory = (url: string) => WebSocket

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BACKOFF_BASE_MS = 1_000
const BACKOFF_CAP_MS = 30_000
const PING_INTERVAL_MS = 30_000

/** Frame types that are NOT per-conversation — delivered to all registered handlers. */
const GLOBAL_FRAME_TYPES = new Set(['hello', 'pong', 'error'])

// ---------------------------------------------------------------------------
// ChatSocket class
// ---------------------------------------------------------------------------

export class ChatSocket {
  private ws: WebSocket | null = null
  private connecting = false
  private closedByUser = false
  private attempts = 0
  private pingTimer: ReturnType<typeof setInterval> | null = null

  /**
   * Per-conv subscription registry.
   * addrKey → Set of frame handlers
   */
  private handlers = new Map<string, Set<FrameHandler>>()

  /**
   * Tracks the latest after_seq per subscribed conv (needed to re-send on
   * reconnect). Mirrors `subs` in the mobile implementation.
   */
  private subs = new Map<string, number>() // addrKey → after_seq

  constructor(private readonly makeWs: WsFactory = (url) => new globalThis.WebSocket(url)) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Subscribe to frames for a conversation.
   *
   * - Sends a `sub` frame immediately if the socket is open, otherwise the
   *   subscription is queued and flushed when the socket opens (or reconnects).
   * - Returns an unsubscribe function. Calling it sends `unsub` and removes
   *   this handler; when the last handler for a conv is removed the conv is
   *   removed from the reconnect registry.
   *
   * @param addrKey   The conversation id (maps to WS frame `conv` field).
   * @param afterSeq  The last seq the caller already has; the server will only
   *                  push frames with seq > afterSeq.
   * @param onFrame   Called for every frame whose `conv === addrKey`, plus global
   *                  frames (hello, pong).
   * @returns         Unsubscribe function.
   */
  subscribe(addrKey: string, afterSeq: number, onFrame: FrameHandler): () => void {
    // Register the handler
    if (!this.handlers.has(addrKey)) {
      this.handlers.set(addrKey, new Set())
    }
    this.handlers.get(addrKey)!.add(onFrame)

    // Track the seq for resubscription — take the minimum so we never miss msgs
    const existing = this.subs.get(addrKey)
    this.subs.set(addrKey, existing === undefined ? afterSeq : Math.min(existing, afterSeq))

    // Send sub frame if we're open right now
    if (this.ws && this.ws.readyState === 1 /* OPEN */) {
      this._send({ v: 1, type: 'sub', convs: [{ id: addrKey, after_seq: afterSeq }] })
    }

    // Ensure the socket exists (lazy first connect)
    this._ensureConnected()

    // Return unsubscribe
    return () => {
      const set = this.handlers.get(addrKey)
      if (set) {
        set.delete(onFrame)
        if (set.size === 0) {
          this.handlers.delete(addrKey)
          this.subs.delete(addrKey)
          this._send({ v: 1, type: 'unsub', conv: addrKey })
        }
      }
    }
  }

  /**
   * Send a `delivered` frame and advance the stored after_seq for this conv.
   */
  markDelivered(addrKey: string, seq: number): void {
    if (this.subs.has(addrKey)) {
      this.subs.set(addrKey, Math.max(this.subs.get(addrKey)!, seq))
    }
    this._send({ v: 1, type: 'delivered', conv: addrKey, seq })
  }

  /**
   * Send a `read` frame (advances the server-side read cursor).
   */
  markRead(addrKey: string, seq: number): void {
    this._send({ v: 1, type: 'read', conv: addrKey, seq })
  }

  /** Permanently close the socket (prevents reconnects). */
  close(): void {
    this.closedByUser = true
    this._clearPing()
    this.ws?.close()
  }

  // -------------------------------------------------------------------------
  // Connection management (private)
  // -------------------------------------------------------------------------

  private _ensureConnected(): void {
    if (this.ws || this.connecting) return
    void this._connect().catch(() => this._scheduleReconnect())
  }

  private async _connect(): Promise<void> {
    if (this.connecting) return
    this.connecting = true
    this.closedByUser = false

    let ws: WebSocket
    try {
      const { ticket } = await chatApi.wsTicket()
      const wssBase = API_BASE.replace(/^http/, 'ws')
      const url = `${wssBase}/api/v1/chat/ws?ticket=${encodeURIComponent(ticket)}`
      ws = this.makeWs(url)
    } catch {
      this.connecting = false
      throw new Error('Failed to acquire WS ticket')
    }

    this.ws = ws

    ws.onopen = () => {
      this.connecting = false
      this.attempts = 0
      this._flushSubs()
      this.pingTimer = setInterval(() => {
        this._send({ v: 1, type: 'ping' })
      }, PING_INTERVAL_MS)
    }

    ws.onmessage = (e) => {
      try {
        const frame = JSON.parse(String(e.data)) as ChatFrame
        this._dispatch(frame)
      } catch {
        /* malformed frame — ignore; REST resync covers it */
      }
    }

    ws.onclose = () => {
      this.connecting = false
      this._clearPing()
      this._scheduleReconnect()
    }

    ws.onerror = () => {
      // onclose will fire after onerror; let it drive the reconnect
    }
  }

  /** Send all current subscriptions — called on open and after reconnect. */
  private _flushSubs(): void {
    if (this.subs.size === 0) return
    const convs = [...this.subs.entries()].map(([id, after_seq]) => ({ id, after_seq }))
    this._send({ v: 1, type: 'sub', convs })
  }

  private _scheduleReconnect(): void {
    if (this.closedByUser) return
    this.attempts += 1
    const delay =
      Math.min(BACKOFF_BASE_MS * 2 ** (this.attempts - 1), BACKOFF_CAP_MS) +
      Math.floor(Math.random() * 250)
    setTimeout(() => {
      void this._connect().catch(() => this._scheduleReconnect())
    }, delay)
  }

  private _clearPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  // -------------------------------------------------------------------------
  // Frame dispatch (private)
  // -------------------------------------------------------------------------

  private _dispatch(frame: ChatFrame): void {
    const conv = frame.conv as string | undefined
    const type = frame.type as string | undefined

    if (conv) {
      // Route to the specific conv's handlers
      const set = this.handlers.get(conv)
      if (set) {
        for (const h of set) h(frame)
      }
    } else if (type && GLOBAL_FRAME_TYPES.has(type)) {
      // Global frames go to ALL handlers
      for (const set of this.handlers.values()) {
        for (const h of set) h(frame)
      }
    }
    // Unknown frames with no conv: silently drop
  }

  // -------------------------------------------------------------------------
  // Send helper (private)
  // -------------------------------------------------------------------------

  private _send(frame: object): void {
    try {
      if (this.ws && this.ws.readyState === 1 /* OPEN */) {
        this.ws.send(JSON.stringify(frame))
      }
    } catch {
      /* socket raced shut; reconnect loop owns recovery */
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let _instance: ChatSocket | null = null

/**
 * Returns the module-level ChatSocket singleton. Creates it lazily on first
 * call; subsequent calls always return the same instance.
 *
 * Pass a `wsFactory` only in tests (production code uses the default).
 *
 * @example
 *   // Production
 *   const socket = getChatSocket()
 *
 *   // Test
 *   const socket = getChatSocket(mockFactory)
 */
export function getChatSocket(wsFactory?: WsFactory): ChatSocket {
  if (!_instance) {
    _instance = new ChatSocket(wsFactory)
  }
  return _instance
}

/**
 * Reset the module-level singleton. ONLY for tests — allows each test to get
 * a fresh socket with its own mock factory.
 *
 * @internal
 */
export function _resetChatSocket(): void {
  _instance?.close()
  _instance = null
}
