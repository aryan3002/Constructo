/**
 * ChatInbox — render-level tests.
 *
 * Mocks `chatApi.conversations` to return known fixture data (no live network,
 * no socket). Verifies:
 *  1. Homeowner row renders with "Homeowner · {site}" title.
 *  2. Company-wide cue (◈ Company-wide) renders for a group with no site_id.
 *  3. Unread badge shows the count for a site row with unread_count > 0.
 *  4. Empty state renders a calm single line when the list is empty.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ConversationSummary } from '../../api/chat'

// ---------------------------------------------------------------------------
// vi.mock — hoisted; configure return values in beforeEach
// ---------------------------------------------------------------------------

vi.mock('../../api/chat', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/chat')>()
  return {
    ...original,
    chatApi: {
      ...original.chatApi,
      conversations: vi.fn(),
    },
  }
})

import { chatApi } from '../../api/chat'
import { ChatInbox } from './ChatInbox'

const mockConversations = chatApi.conversations as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const HOMEOWNER_ROW: ConversationSummary = {
  id: 'conv-hw-1',
  kind: 'homeowner',
  site_id: 'site-1',
  title: null,
  site_name: 'Tripathi Residence',
  last_message_at: new Date(Date.now() - 5 * 60_000).toISOString(), // 5 min ago
  unread_count: 0,
  has_homeowner: true,
}

const GROUP_ROW: ConversationSummary = {
  id: 'conv-grp-1',
  kind: 'group',
  site_id: null, // company-wide — no site
  title: 'All Hands',
  site_name: null,
  last_message_at: new Date(Date.now() - 3 * 3600_000).toISOString(), // 3 h ago
  unread_count: 0,
  has_homeowner: false,
}

const SITE_ROW_UNREAD: ConversationSummary = {
  id: 'conv-site-1',
  kind: 'site',
  site_id: 'site-1',
  title: 'Tripathi Site Crew',
  site_name: 'Tripathi Residence',
  last_message_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), // 2 d ago
  unread_count: 5,
  has_homeowner: false,
}

// ---------------------------------------------------------------------------
// Wrapper
// ---------------------------------------------------------------------------

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  Wrapper.displayName = 'TestWrapper'
  return Wrapper
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatInbox', () => {
  it('renders a homeowner row with "Homeowner · {site_name}" title', async () => {
    mockConversations.mockResolvedValue([HOMEOWNER_ROW])

    render(
      <ChatInbox selectedId={null} onSelect={() => {}} />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByText('Homeowner · Tripathi Residence')).toBeInTheDocument()
    })
  })

  it('renders ◈ Company-wide cue for a group row with no site_id', async () => {
    mockConversations.mockResolvedValue([GROUP_ROW])

    render(
      <ChatInbox selectedId={null} onSelect={() => {}} />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => {
      // The text node "Company-wide" is rendered as the cue label
      expect(screen.getByText('Company-wide')).toBeInTheDocument()
    })
  })

  it('renders an unread badge with the correct count for a site row', async () => {
    mockConversations.mockResolvedValue([SITE_ROW_UNREAD])

    render(
      <ChatInbox selectedId={null} onSelect={() => {}} />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => {
      // The badge is an element with aria-label containing the count
      expect(screen.getByLabelText('5 unread')).toBeInTheDocument()
      // The badge text itself
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  it('caps the unread badge at 99+', async () => {
    const bigUnread: ConversationSummary = {
      ...SITE_ROW_UNREAD,
      id: 'conv-site-big',
      unread_count: 150,
    }
    mockConversations.mockResolvedValue([bigUnread])

    render(
      <ChatInbox selectedId={null} onSelect={() => {}} />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByText('99+')).toBeInTheDocument()
    })
  })

  it('renders all three rows from the fixture', async () => {
    mockConversations.mockResolvedValue([HOMEOWNER_ROW, GROUP_ROW, SITE_ROW_UNREAD])

    render(
      <ChatInbox selectedId={null} onSelect={() => {}} />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByText('Homeowner · Tripathi Residence')).toBeInTheDocument()
      expect(screen.getByText('All Hands')).toBeInTheDocument()
      expect(screen.getByText('Tripathi Site Crew')).toBeInTheDocument()
    })
  })

  it('renders a calm empty-state line when the list is empty', async () => {
    mockConversations.mockResolvedValue([])

    render(
      <ChatInbox selectedId={null} onSelect={() => {}} />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => {
      expect(screen.getByText('No conversations yet.')).toBeInTheDocument()
    })
  })

  it('renders a spinner while loading', () => {
    // Never resolves — stays in loading state
    mockConversations.mockReturnValue(new Promise(() => {}))

    render(
      <ChatInbox selectedId={null} onSelect={() => {}} />,
      { wrapper: makeWrapper() },
    )

    // Spinner renders a role="status" element
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('highlights the selected conversation row', async () => {
    mockConversations.mockResolvedValue([HOMEOWNER_ROW, SITE_ROW_UNREAD])

    render(
      <ChatInbox selectedId={SITE_ROW_UNREAD.id} onSelect={() => {}} />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => {
      const selectedBtn = screen.getByRole('button', { name: 'Tripathi Site Crew' })
      expect(selectedBtn).toHaveAttribute('aria-pressed', 'true')
    })
  })
})
