import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { ConversationSummary } from '../../api/chat'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  openHomeownerChannel: vi.fn(),
}))

vi.mock('../../api/chat', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/chat')>()
  return {
    ...original,
    chatApi: {
      ...original.chatApi,
      openHomeownerChannel: mocks.openHomeownerChannel,
    },
  }
})

vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...original,
    useNavigate: () => mocks.navigate,
  }
})

const { useOpenHomeownerChannel } = await import('./useOpenHomeownerChannel')

function harness() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
  return { invalidateSpy, wrapper }
}

describe('useOpenHomeownerChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the channel, invalidates the inbox, and navigates with state', async () => {
    const conversation: ConversationSummary = {
      id: 'c9',
      kind: 'homeowner',
      site_id: 's1',
      title: null,
      site_name: 'Villa A',
      last_message_at: null,
      unread_count: 0,
      has_homeowner: true,
    }
    mocks.openHomeownerChannel.mockResolvedValue(conversation)

    const { invalidateSpy, wrapper } = harness()
    const { result } = renderHook(() => useOpenHomeownerChannel(), { wrapper })

    act(() => {
      result.current.mutate('s1')
    })

    await waitFor(() => expect(mocks.openHomeownerChannel).toHaveBeenCalledWith('s1'))
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith('/chat?conversation=c9', {
        state: { conversation },
      }),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['chat', 'conversations'],
    })
  })
})
