/** ChatSocket: ticket auth, sub on open, frame dispatch, reconnect with backoff,
 * resubscribe after reconnect. Driven with a fake WebSocket. */
import { ChatSocket } from '../socket'

class FakeWS {
  static instances: FakeWS[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  sent: string[] = []
  readyState = 0
  constructor(public url: string) {
    FakeWS.instances.push(this)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.onclose?.()
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  push(frame: object) {
    this.onmessage?.({ data: JSON.stringify(frame) })
  }
}

beforeEach(() => {
  FakeWS.instances = []
  jest.useFakeTimers()
})
afterEach(() => jest.useRealTimers())

function makeSocket() {
  const received: object[] = []
  const socket = new ChatSocket({
    getTicket: async () => 'ticket-1',
    baseWsUrl: 'wss://api.test/api/v1/chat/ws',
    makeWebSocket: (url) => new FakeWS(url) as unknown as WebSocket,
    onFrame: (f) => received.push(f),
  })
  return { socket, received }
}

test('connects with ticket and subscribes on open', async () => {
  const { socket } = makeSocket()
  await socket.connect()
  socket.subscribe('conv-1', 4)
  const ws = FakeWS.instances[0]
  ws.open()
  await Promise.resolve()
  expect(ws.url).toContain('ticket=ticket-1')
  const subs = ws.sent.map((s) => JSON.parse(s)).filter((f) => f.type === 'sub')
  expect(subs[0].convs).toEqual([{ id: 'conv-1', after_seq: 4 }])
})

test('dispatches msg frames to onFrame', async () => {
  const { socket, received } = makeSocket()
  await socket.connect()
  const ws = FakeWS.instances[0]
  ws.open()
  ws.push({ v: 1, type: 'msg', conv: 'conv-1', payload: { seq: 9 } })
  expect(received).toContainEqual({ v: 1, type: 'msg', conv: 'conv-1', payload: { seq: 9 } })
})

test('concurrent connect() calls do not create duplicate sockets', async () => {
  // A reconnect timer firing while a prior connect()'s getTicket() is still
  // pending must NOT spin up a second socket and orphan the first.
  let resolveTicket!: (t: string) => void
  const ticketPromise = new Promise<string>((r) => {
    resolveTicket = r
  })
  const socket = new ChatSocket({
    getTicket: () => ticketPromise,
    baseWsUrl: 'wss://api.test/api/v1/chat/ws',
    makeWebSocket: (url) => new FakeWS(url) as unknown as WebSocket,
    onFrame: () => undefined,
  })
  const p1 = socket.connect()
  const p2 = socket.connect() // blocked by the in-flight guard
  resolveTicket('ticket-1')
  await Promise.all([p1, p2])
  expect(FakeWS.instances.length).toBe(1)
})

test('refcounts subscribers: 2nd sub sends no frame, unsub waits for the last', async () => {
  // The P0 bug: the inbox subscribes every conversation to light its unread
  // badges, then unsubscribes them on blur. If a thread you just opened shares
  // that conversation id, the inbox's blur must NOT kill its live subscription.
  const { socket } = makeSocket()
  await socket.connect()
  const ws = FakeWS.instances[0]
  ws.open()
  await Promise.resolve()
  const subFrames = () => ws.sent.map((s) => JSON.parse(s)).filter((f) => f.type === 'sub')
  const unsubFrames = () => ws.sent.map((s) => JSON.parse(s)).filter((f) => f.type === 'unsub')
  // Thread subscribes at its watermark; the inbox then subscribes the same conv @0.
  socket.subscribe('conv-1', 42)
  socket.subscribe('conv-1', 0)
  // Only the 0→1 transition emits a sub frame — at the HIGHEST watermark (42, not 0).
  expect(subFrames()).toEqual([{ v: 1, type: 'sub', convs: [{ id: 'conv-1', after_seq: 42 }] }])
  // Inbox blurs → one unsubscribe. The thread still holds a ref → NO unsub frame.
  socket.unsubscribe('conv-1')
  expect(unsubFrames()).toEqual([])
  // Thread closes → last ref released → the real unsub frame finally goes out.
  socket.unsubscribe('conv-1')
  expect(unsubFrames()).toEqual([{ v: 1, type: 'unsub', conv: 'conv-1' }])
})

test('reconnects with backoff and resubscribes', async () => {
  const { socket } = makeSocket()
  await socket.connect()
  socket.subscribe('conv-1', 4)
  const first = FakeWS.instances[0]
  first.open()
  first.close() // dead socket
  await jest.advanceTimersByTimeAsync(3000) // past first backoff step
  expect(FakeWS.instances.length).toBeGreaterThanOrEqual(2)
  const second = FakeWS.instances[FakeWS.instances.length - 1]
  second.open()
  await Promise.resolve()
  const subs = second.sent.map((s) => JSON.parse(s)).filter((f) => f.type === 'sub')
  expect(subs.length).toBe(1) // resubscribed after reconnect
})
