import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the internal request helper by mocking client.ts — the names `request`
// and `uploadMultipart` come from reading client.ts (it exports `request` via
// re-export pattern used by dashboard.ts/drawings.ts etc). chat.ts uses the
// private `request` function from its own local helper that mirrors client.ts,
// so we mock fetch directly.
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock localStorage (jsdom provides it, but we stub getToken to return null)
vi.mock('./auth', () => ({
  getToken: vi.fn().mockReturnValue(null),
}))

vi.mock('./config', () => ({
  API_BASE: 'http://localhost:8000',
  USE_MOCKS: false,
}))

import { addrParams, chatApi } from './chat'

describe('addrParams', () => {
  it('site address → site_id', () => {
    expect(addrParams({ siteId: 's1' })).toEqual({ site_id: 's1' })
  })

  it('conversation address → conversation_id', () => {
    expect(addrParams({ conversationId: 'c1' })).toEqual({ conversation_id: 'c1' })
  })
})

describe('chatApi.messages', () => {
  beforeEach(() => {
    mockFetch.mockClear()
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    })
  })

  it('calls the right path with site_id and after_seq', async () => {
    await chatApi.messages({ siteId: 'site-42' }, {})
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url] = mockFetch.mock.calls[0]
    const u = new URL(url as string)
    expect(u.pathname).toBe('/api/v1/chat/messages')
    expect(u.searchParams.get('site_id')).toBe('site-42')
    expect(u.searchParams.get('after_seq')).toBe('0')
  })

  it('calls with conversation_id when given a conversation address', async () => {
    await chatApi.messages({ conversationId: 'conv-99' }, { afterSeq: 5 })
    const [url] = mockFetch.mock.calls[0]
    const u = new URL(url as string)
    expect(u.searchParams.get('conversation_id')).toBe('conv-99')
    expect(u.searchParams.get('after_seq')).toBe('5')
  })
})

describe('chatApi.send', () => {
  beforeEach(() => {
    mockFetch.mockClear()
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'msg-1' }),
    })
  })

  it('POSTs to /api/v1/chat/messages with the body', async () => {
    await chatApi.send({
      site_id: 'site-42',
      client_msg_id: 'uuid-1',
      body: 'hello',
    })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('http://localhost:8000/api/v1/chat/messages')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      site_id: 'site-42',
      client_msg_id: 'uuid-1',
      body: 'hello',
    })
  })
})

describe('chatApi.openHomeownerChannel', () => {
  beforeEach(() => {
    mockFetch.mockClear()
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'conv-homeowner-1',
        kind: 'homeowner',
        site_id: 'site-42',
        title: null,
        site_name: 'Green Valley',
        last_message_at: null,
        unread_count: 0,
        has_homeowner: true,
      }),
    })
  })

  it('POSTs to /api/v1/chat/homeowner-channel with the site id', async () => {
    await chatApi.openHomeownerChannel('site-42')

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('http://localhost:8000/api/v1/chat/homeowner-channel')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      site_id: 'site-42',
    })
  })
})
