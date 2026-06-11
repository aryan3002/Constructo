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
