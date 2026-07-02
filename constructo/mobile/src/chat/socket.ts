/**
 * Reconnecting multiplexed chat socket (spine A9). One socket per app session;
 * conversations subscribe with their after_seq so the caller knows whether to
 * REST-backfill (sub_ok.last_seq > after_seq). Reconnect: exponential backoff
 * with jitter (1s→30s cap), resubscribes everything, then the caller re-syncs.
 * The socket is a NOTIFIER — REST after_seq remains the one sync path.
 */
export interface ChatSocketOpts {
  getTicket: () => Promise<string>
  baseWsUrl: string
  onFrame: (frame: Record<string, unknown>) => void
  makeWebSocket?: (url: string) => WebSocket
  pingIntervalMs?: number
}

const BACKOFF_BASE_MS = 1000
const BACKOFF_CAP_MS = 30_000

export class ChatSocket {
  private ws: WebSocket | null = null
  private subs = new Map<string, number>() // conv id → after_seq
  private attempts = 0
  private closedByUser = false
  private connecting = false
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private pongTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(private opts: ChatSocketOpts) {}

  public get isLive(): boolean {
    return !!this.ws && this.ws.readyState === 1
  }

  async connect(): Promise<void> {
    // In-flight guard: a reconnect timer can fire while a prior connect()'s
    // getTicket() await is still pending — without this, the second call would
    // overwrite this.ws and orphan the first socket. The flag is released when
    // the socket opens or closes/fails (so the next reconnect can proceed).
    if (this.connecting) return
    this.connecting = true
    this.closedByUser = false
    let ws: WebSocket
    try {
      const ticket = await this.opts.getTicket()
      const make = this.opts.makeWebSocket ?? ((url: string) => new WebSocket(url))
      ws = make(`${this.opts.baseWsUrl}?ticket=${encodeURIComponent(ticket)}`)
    } catch (err) {
      this.connecting = false
      throw err // let scheduleReconnect's .catch re-arm the backoff
    }
    this.ws = ws
    ws.onopen = () => {
      this.connecting = false
      this.attempts = 0
      this.sendSubs()
      this.pingTimer = setInterval(() => {
        this.send({ v: 1, type: 'ping' })
        this.pongTimeout = setTimeout(() => {
          // Missed pong after 10s: close socket to force reconnect
          this.ws?.close()
        }, 10_000)
      }, this.opts.pingIntervalMs ?? 30_000)
    }
    ws.onmessage = (e) => {
      try {
        const frame = JSON.parse(String(e.data))
        if (frame.type === 'pong' && this.pongTimeout) {
          clearTimeout(this.pongTimeout)
          this.pongTimeout = null
        }
        this.opts.onFrame(frame)
      } catch {
        /* malformed frame: ignore; REST resync covers it */
      }
    }
    ws.onclose = () => {
      this.connecting = false
      this.scheduleReconnect()
    }
  }

  subscribe(convId: string, afterSeq: number): void {
    this.subs.set(convId, afterSeq)
    if (this.ws && this.ws.readyState === 1) {
      this.send({ v: 1, type: 'sub', convs: [{ id: convId, after_seq: afterSeq }] })
    }
  }

  unsubscribe(convId: string): void {
    this.subs.delete(convId)
    this.send({ v: 1, type: 'unsub', conv: convId })
  }

  markDelivered(convId: string, seq: number): void {
    this.subs.set(convId, Math.max(this.subs.get(convId) ?? 0, seq))
    this.send({ v: 1, type: 'delivered', conv: convId, seq })
  }

  markRead(convId: string, seq: number): void {
    this.send({ v: 1, type: 'read', conv: convId, seq })
  }

  typing(convId: string): void {
    this.send({ v: 1, type: 'typing', conv: convId })
  }

  close(): void {
    this.closedByUser = true
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout)
      this.pongTimeout = null
    }
    this.ws?.close()
  }

  private send(frame: object): void {
    try {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(frame))
    } catch {
      /* socket raced shut; reconnect loop owns recovery */
    }
  }

  private sendSubs(): void {
    const convs = [...this.subs.entries()].map(([id, after_seq]) => ({ id, after_seq }))
    if (convs.length) this.send({ v: 1, type: 'sub', convs })
  }

  private scheduleReconnect(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout)
      this.pongTimeout = null
    }
    if (this.closedByUser) return
    this.attempts += 1
    const delay =
      Math.min(BACKOFF_BASE_MS * 2 ** (this.attempts - 1), BACKOFF_CAP_MS) +
      Math.floor(Math.random() * 250)
    setTimeout(() => {
      void this.connect().catch(() => this.scheduleReconnect())
    }, delay)
  }
}
