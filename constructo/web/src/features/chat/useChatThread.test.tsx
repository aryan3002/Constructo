/**
 * useChatThread – focused integration-spine test.
 *
 * Heavy logic (merge / ticks / socket reconnect) is already covered by pure-unit
 * tests. This suite just verifies:
 *  1. initial messages query populates `messages`
 *  2. `send('hi')` adds a pending entry immediately (optimistic) and calls
 *     `chatApi.send` with a valid `client_msg_id`
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ChatMessage } from '../../api/chat'
import type { Me } from '../../api/auth'
import { qk } from '../../api/queryKeys'

// ---------------------------------------------------------------------------
// vi.mock calls are HOISTED — factories must NOT reference non-const variables.
// We configure the spies' return values in beforeEach instead.
// ---------------------------------------------------------------------------

vi.mock('../../api/chat', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/chat')>()
  return {
    ...original,
    chatApi: {
      messages: vi.fn(),
      send: vi.fn(),
      cursors: vi.fn(),
      read: vi.fn(),
      presignMedia: vi.fn(),
      delivered: vi.fn(),
    },
    newClientMsgId: vi.fn(),
  }
})

vi.mock('./socket', () => ({
  getChatSocket: vi.fn().mockReturnValue({
    subscribe: vi.fn().mockReturnValue(vi.fn()), // subscribe returns an unsub fn
    markDelivered: vi.fn(),
    markRead: vi.fn(),
  }),
  _resetChatSocket: vi.fn(),
}))

// ---------------------------------------------------------------------------
// NOW import things that depend on the mocked modules
// ---------------------------------------------------------------------------
import { chatApi, newClientMsgId } from '../../api/chat'
import { getChatSocket } from './socket'
import { useChatThread } from './useChatThread'

// ---------------------------------------------------------------------------
// Typed spy references
// ---------------------------------------------------------------------------
const mockMessages = chatApi.messages as ReturnType<typeof vi.fn>
const mockSend = chatApi.send as ReturnType<typeof vi.fn>
const mockCursors = chatApi.cursors as ReturnType<typeof vi.fn>
const mockRead = chatApi.read as ReturnType<typeof vi.fn>
const mockNewClientMsgId = newClientMsgId as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Fake data
// ---------------------------------------------------------------------------
const FAKE_MSGS: ChatMessage[] = [
  {
    id: 'm1', conversation_id: 'c1', sender_id: 'u1', sender_side: 'contractor',
    seq: 1, body: 'Hello', reply_to_id: null, media_type: 'text',
    created_at: '2026-01-01T00:00:00Z', attachment_url: null, events: [],
  },
  {
    id: 'm2', conversation_id: 'c1', sender_id: 'u1', sender_side: 'contractor',
    seq: 2, body: 'World', reply_to_id: null, media_type: 'text',
    created_at: '2026-01-01T00:00:01Z', attachment_url: null, events: [],
  },
]

const ME: Me = {
  id: 'user-1',
  company_id: 'company-1',
  name: 'Test User',
  phone: '+1234567890',
  role: 'supervisor',
  language: 'en',
}

// ---------------------------------------------------------------------------
// Wrapper factory
// ---------------------------------------------------------------------------
function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  // Seed the me query so useMe() resolves synchronously from the cache
  qc.setQueryData(qk.me(), ME)

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  Wrapper.displayName = 'TestWrapper'
  return { qc, Wrapper }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks()

  // Default happy-path returns
  mockMessages.mockResolvedValue(FAKE_MSGS)
  mockSend.mockResolvedValue({ ...FAKE_MSGS[0], id: 'm3', seq: 3, body: 'hi' })
  mockCursors.mockResolvedValue([])
  mockRead.mockResolvedValue(undefined)
  mockNewClientMsgId.mockReturnValue('test-client-id-1234')

  // Socket mock: subscribe returns a fresh no-op unsub fn each time
  const socket = getChatSocket()
  ;(socket.subscribe as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn())
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('useChatThread', () => {
  it('loads the initial messages (2 rows)', async () => {
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useChatThread({ siteId: 'site-1' }),
      { wrapper: Wrapper },
    )

    // Initially loading
    expect(result.current.isLoading).toBe(true)

    // After load settles
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0].body).toBe('Hello')
    expect(result.current.messages[1].body).toBe('World')
  })

  it('subscribes to the socket on mount and unsubscribes on unmount', async () => {
    const { Wrapper } = makeWrapper()
    const mockUnsub = vi.fn()
    const socket = getChatSocket()
    ;(socket.subscribe as ReturnType<typeof vi.fn>).mockReturnValue(mockUnsub)

    const { unmount } = renderHook(
      () => useChatThread({ siteId: 'site-1' }),
      { wrapper: Wrapper },
    )

    await waitFor(() => expect(socket.subscribe).toHaveBeenCalled())
    expect(socket.subscribe).toHaveBeenCalledWith(
      'site-1',
      expect.any(Number),
      expect.any(Function),
    )

    unmount()
    expect(mockUnsub).toHaveBeenCalled()
  })

  it('send("hi") adds an optimistic pending entry and calls chatApi.send with client_msg_id', async () => {
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useChatThread({ siteId: 'site-1' }),
      { wrapper: Wrapper },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Fire send inside act so React flushes the synchronous state update
    act(() => {
      result.current.send('hi')
    })

    // Optimistic pending should appear synchronously after act
    expect(result.current.pending).toHaveLength(1)
    expect(result.current.pending[0].body).toBe('hi')
    expect(result.current.pending[0].state).toBe('sending')
    expect(result.current.pending[0].clientMsgId).toBe('test-client-id-1234')

    // chatApi.send called with client_msg_id
    await waitFor(() => expect(mockSend).toHaveBeenCalled())
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        client_msg_id: 'test-client-id-1234',
        body: 'hi',
      }),
    )

    // After chatApi.send resolves, pending should be cleared (optimistic entry removed)
    await waitFor(() => expect(result.current.pending).toHaveLength(0))
  })

  it('marks a failed send with state="failed" when chatApi.send rejects', async () => {
    mockSend.mockRejectedValueOnce(new Error('network error'))

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useChatThread({ siteId: 'site-1' }),
      { wrapper: Wrapper },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.send('failing message')
    })

    await waitFor(() => {
      return result.current.pending.some((p) => p.state === 'failed')
    })

    const failed = result.current.pending.find((p) => p.state === 'failed')
    expect(failed?.body).toBe('failing message')
  })

  it('reply and setReply round-trip correctly', async () => {
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useChatThread({ siteId: 'site-1' }),
      { wrapper: Wrapper },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.reply).toBeNull()

    const msg = result.current.messages[0]
    act(() => { result.current.setReply(msg) })
    expect(result.current.reply?.id).toBe('m1')

    act(() => { result.current.setReply(null) })
    expect(result.current.reply).toBeNull()
  })

  it('deliveryState uses computeDeliveryState with empty cursors → "sent"', async () => {
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useChatThread({ siteId: 'site-1' }),
      { wrapper: Wrapper },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // With no cursors for others, computeDeliveryState returns 'sent'
    expect(result.current.deliveryState(1)).toBe('sent')
  })
})

// ---------------------------------------------------------------------------
// Wave B — WhatsApp-smoothness contracts
// ---------------------------------------------------------------------------
describe('useChatThread — Wave B', () => {
  // B1 — thread opens on the NEWEST page, not the oldest
  it('initial load requests the newest page (order desc, limit 50)', async () => {
    const { Wrapper } = makeWrapper()
    renderHook(() => useChatThread({ siteId: 'site-1' }), { wrapper: Wrapper })

    await waitFor(() => expect(mockMessages).toHaveBeenCalled())
    expect(mockMessages).toHaveBeenCalledWith(
      { siteId: 'site-1' },
      expect.objectContaining({ order: 'desc', limit: 50 }),
    )
  })

  // B1 — a full initial page arms upward paging from the start
  it('arms hasOlder when the initial page is full (>= 50)', async () => {
    const full = Array.from({ length: 50 }, (_, i) => ({
      ...FAKE_MSGS[0], id: `f${i}`, seq: i + 1,
    }))
    mockMessages.mockResolvedValueOnce(full)

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useChatThread({ siteId: 'site-1' }), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.messages).toHaveLength(50))
    expect(result.current.hasOlder).toBe(true)
  })

  it('does not arm hasOlder for a short initial page', async () => {
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useChatThread({ siteId: 'site-1' }), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.hasOlder).toBe(false)
  })

  // B3 + B7 — loadOlder pages upward, is awaitable, and preserves history order
  it('loadOlder requests older rows (beforeSeq/desc/limit) and prepends them', async () => {
    const initial = [
      { ...FAKE_MSGS[0], id: 's51', seq: 51 },
      { ...FAKE_MSGS[1], id: 's52', seq: 52 },
    ]
    mockMessages.mockResolvedValueOnce(initial)

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useChatThread({ siteId: 'site-1' }), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.messages).toHaveLength(2))

    mockMessages.mockResolvedValueOnce([{ ...FAKE_MSGS[0], id: 's50', seq: 50 }])
    await act(async () => {
      await result.current.loadOlder()
    })

    expect(mockMessages).toHaveBeenLastCalledWith(
      { siteId: 'site-1' },
      expect.objectContaining({ beforeSeq: 51, order: 'desc', limit: 50 }),
    )
    expect(result.current.messages.map((m) => m.seq)).toEqual([50, 51, 52])
  })

  // B5 — optimistic media bubble appears at upload start and is reused on send
  it('startMedia adds an optimistic pending bubble with a preview', async () => {
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useChatThread({ siteId: 'site-1' }), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.startMedia({ clientMsgId: 'cid-media', previewUrl: 'blob:preview', mediaType: 'image' })
    })

    expect(result.current.pending).toHaveLength(1)
    expect(result.current.pending[0].clientMsgId).toBe('cid-media')
    expect(result.current.pending[0].previewUrl).toBe('blob:preview')
    expect(result.current.pending[0].state).toBe('sending')
  })

  it('sendMedia reuses the optimistic bubble (no duplicate) and clears it on success', async () => {
    mockSend.mockResolvedValueOnce({ ...FAKE_MSGS[0], id: 'm-img', seq: 3, media_type: 'image' })

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useChatThread({ siteId: 'site-1' }), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.startMedia({ clientMsgId: 'cid-media', previewUrl: 'blob:preview', mediaType: 'image' })
    })
    expect(result.current.pending).toHaveLength(1)

    act(() => {
      result.current.sendMedia({
        attachmentKey: 'k', mime: 'image/jpeg', sha256: 'h', mediaType: 'image', clientMsgId: 'cid-media',
      })
    })
    // Reused — not a second bubble
    expect(result.current.pending).toHaveLength(1)

    await waitFor(() => expect(result.current.pending).toHaveLength(0))
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ client_msg_id: 'cid-media', attachment_key: 'k' }),
    )
  })

  it('failMedia flips the media bubble to failed', async () => {
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useChatThread({ siteId: 'site-1' }), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => { result.current.startMedia({ clientMsgId: 'cid-x', mediaType: 'image' }) })
    act(() => { result.current.failMedia('cid-x') })

    expect(result.current.pending[0].state).toBe('failed')
  })

  // B6 — read receipts respect tab visibility/focus
  it('advances the read cursor immediately when the tab is focused', async () => {
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true)

    const { Wrapper } = makeWrapper()
    renderHook(() => useChatThread({ siteId: 'site-1' }), { wrapper: Wrapper })

    await waitFor(() =>
      expect(mockRead).toHaveBeenCalledWith(expect.objectContaining({ lastSeq: 2 })),
    )
    hasFocus.mockRestore()
  })

  it('defers read receipts while the tab is hidden, then flushes on focus', async () => {
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false)

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useChatThread({ siteId: 'site-1' }), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.messages).toHaveLength(2))

    // Hidden → no read cursor advance yet
    expect(mockRead).not.toHaveBeenCalled()

    // Return to the tab → deferred read flushes
    hasFocus.mockReturnValue(true)
    act(() => { window.dispatchEvent(new Event('focus')) })

    await waitFor(() =>
      expect(mockRead).toHaveBeenCalledWith(expect.objectContaining({ lastSeq: 2 })),
    )
    hasFocus.mockRestore()
  })
})
