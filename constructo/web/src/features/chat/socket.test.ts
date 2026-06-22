/**
 * socket.test.ts — TDD step 1: write failing tests before implementation.
 *
 * Asserts:
 *  1. subscribe() sends a `sub` frame with after_seq
 *  2. an incoming `msg` frame for that conv invokes onFrame
 *  3. markDelivered() sends a `delivered` frame
 *  4. unsubscribe() sends `unsub` and stops delivering frames
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/** Drain the microtask queue + any queued promise callbacks. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0))

// ---------------------------------------------------------------------------
// MockWebSocket — minimal stand-in that records sent frames and lets the test
// push incoming frames. Mirrors the shape of the browser WebSocket API.
// ---------------------------------------------------------------------------

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState: number = MockWebSocket.CONNECTING
  sent: string[] = []

  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((e: unknown) => void) | null = null

  constructor(public url: string) {
    // Simulate async open so subscribe() can be called synchronously in tests
    // while the socket is still in CONNECTING state; then we open it manually.
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }

  /** Test helper — simulate the server opening the connection. */
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  /** Test helper — push a server-side frame to the client. */
  simulateMessage(frame: object) {
    this.onmessage?.({ data: JSON.stringify(frame) })
  }
}

// ---------------------------------------------------------------------------
// Mock chatApi.wsTicket so getChatSocket() can acquire a ticket without HTTP
// ---------------------------------------------------------------------------

vi.mock('../../api/chat', () => ({
  chatApi: {
    wsTicket: vi.fn().mockResolvedValue({ ticket: 'test-ticket' }),
  },
}))

// ---------------------------------------------------------------------------
// Import subject AFTER mocks are registered (Vitest hoists vi.mock)
// ---------------------------------------------------------------------------

import { getChatSocket, _resetChatSocket } from './socket'

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

/** Assert mockWs is defined before accessing it in a test. */
function ws(): MockWebSocket {
  if (!mockWs) throw new Error('mockWs not yet assigned — did you call connectSocket()?')
  return mockWs
}

let mockWs: MockWebSocket | undefined = undefined

function makeFactory() {
  return (url: string) => {
    mockWs = new MockWebSocket(url)
    return mockWs as unknown as WebSocket
  }
}

beforeEach(() => {
  // Reset singleton between tests so each test gets a fresh socket
  _resetChatSocket()
  mockWs = undefined
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a socket, trigger a subscription (which fires lazy connect), await
 * the async ticket fetch, then simulate the WS open. Returns the socket.
 * The test can do additional subscribe() calls after this.
 */
async function connectSocket() {
  const socket = getChatSocket(makeFactory())
  // Trigger lazy connect by subscribing to a dummy conv
  socket.subscribe('__init__', 0, () => {})
  // The ticket fetch is a resolved promise — drain the microtask + task queue
  await flush()
  // Now the WS factory has been called and mockWs is assigned — open it
  ws().simulateOpen()
  // Clear any frames emitted during setup (the __init__ sub frame)
  ws().sent.length = 0
  return socket
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatSocket', () => {
  it('subscribe() sends a sub frame with the correct conv and after_seq', async () => {
    const socket = await connectSocket()

    const onFrame = vi.fn()
    socket.subscribe('conv-abc', 5, onFrame)

    expect(ws().sent).toHaveLength(1)
    const frame = JSON.parse(ws().sent[0])
    expect(frame).toMatchObject({
      v: 1,
      type: 'sub',
      convs: [{ id: 'conv-abc', after_seq: 5 }],
    })
  })

  it('routes an incoming msg frame for the subscribed conv to onFrame', async () => {
    const socket = await connectSocket()
    const onFrame = vi.fn()
    socket.subscribe('conv-abc', 0, onFrame)

    const payload = { id: 'msg-1', body: 'hello', seq: 1 }
    ws().simulateMessage({ v: 1, type: 'msg', conv: 'conv-abc', payload })

    expect(onFrame).toHaveBeenCalledOnce()
    expect(onFrame).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'msg', conv: 'conv-abc', payload }),
    )
  })

  it('does NOT route msg frames for a different conv to the handler', async () => {
    const socket = await connectSocket()
    const onFrameAbc = vi.fn()
    socket.subscribe('conv-abc', 0, onFrameAbc)

    ws().simulateMessage({ v: 1, type: 'msg', conv: 'conv-xyz', payload: {} })

    expect(onFrameAbc).not.toHaveBeenCalled()
  })

  it('markDelivered() sends a delivered frame', async () => {
    const socket = await connectSocket()
    socket.subscribe('conv-abc', 0, vi.fn())
    ws().sent.length = 0 // clear the sub frame

    socket.markDelivered('conv-abc', 3)

    expect(ws().sent).toHaveLength(1)
    const frame = JSON.parse(ws().sent[0])
    expect(frame).toMatchObject({ v: 1, type: 'delivered', conv: 'conv-abc', seq: 3 })
  })

  it('markRead() sends a read frame', async () => {
    const socket = await connectSocket()
    socket.subscribe('conv-abc', 0, vi.fn())
    ws().sent.length = 0

    socket.markRead('conv-abc', 7)

    expect(ws().sent).toHaveLength(1)
    const frame = JSON.parse(ws().sent[0])
    expect(frame).toMatchObject({ v: 1, type: 'read', conv: 'conv-abc', seq: 7 })
  })

  it('unsubscribe() sends unsub and stops routing frames to the handler', async () => {
    const socket = await connectSocket()
    const onFrame = vi.fn()
    const unsub = socket.subscribe('conv-abc', 0, onFrame)
    ws().sent.length = 0 // clear the sub frame

    unsub()

    // Must have sent an unsub frame
    expect(ws().sent).toHaveLength(1)
    const frame = JSON.parse(ws().sent[0])
    expect(frame).toMatchObject({ v: 1, type: 'unsub', conv: 'conv-abc' })

    // Further frames for that conv must NOT reach the handler
    ws().simulateMessage({ v: 1, type: 'msg', conv: 'conv-abc', payload: {} })
    expect(onFrame).not.toHaveBeenCalled()
  })

  it('queues a sub frame and flushes it on socket open', async () => {
    const socket = getChatSocket(makeFactory())
    // Subscribe BEFORE the socket is open
    const onFrame = vi.fn()
    socket.subscribe('conv-abc', 2, onFrame)

    // The socket isn't open yet — nothing sent (ticket fetch is still pending)
    expect(mockWs).toBeUndefined()

    // Resolve async ticket + open the socket
    await flush()
    ws().simulateOpen()

    // Now the queued sub should have been flushed
    const frames = ws().sent.map((s: string) => JSON.parse(s))
    const subFrame = frames.find((f: Record<string, unknown>) => f.type === 'sub')
    expect(subFrame).toMatchObject({
      v: 1,
      type: 'sub',
      convs: [{ id: 'conv-abc', after_seq: 2 }],
    })
  })

  it('routes non-conv frames (hello, pong) to ALL handlers', async () => {
    const socket = await connectSocket()
    const onA = vi.fn()
    const onB = vi.fn()
    socket.subscribe('conv-1', 0, onA)
    socket.subscribe('conv-2', 0, onB)

    ws().simulateMessage({ v: 1, type: 'hello', user_id: 'u1' })

    expect(onA).toHaveBeenCalledWith(expect.objectContaining({ type: 'hello' }))
    expect(onB).toHaveBeenCalledWith(expect.objectContaining({ type: 'hello' }))
  })
})
