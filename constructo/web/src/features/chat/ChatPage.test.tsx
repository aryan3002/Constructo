/**
 * ChatPage — render-level tests (Task 13).
 *
 * Mocks:
 *   - ChatInbox  — shallow; captures the `onSelect` prop so tests can fire it.
 *   - ChatThread — shallow; renders a sentinel div so the thread pane is detectable.
 *   - useMe / useMeRole — returns a minimal Me object (role = 'owner').
 *
 * Coverage:
 *   1. ChatInbox renders in the inbox pane on mount.
 *   2. Empty state ("Select a conversation") shows when nothing is selected.
 *   3. Selecting a conversation (calling onSelect) renders ChatThread with the
 *      correct address + title + hasHomeowner props.
 *   4. Selecting a site conversation builds address { siteId }.
 *   5. Selecting a non-site conversation builds address { conversationId }.
 *   6. hasHomeowner is false on homeowner-kind threads (no double-banner).
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ConversationSummary } from '../../api/chat'

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before any import of the mocked module
// ---------------------------------------------------------------------------

// --- ChatInbox ---
vi.mock('./ChatInbox', () => ({
  ChatInbox: vi.fn(
    ({ selectedId, onSelect }: { selectedId: string | null; onSelect: (c: ConversationSummary) => void }) => (
      <div data-testid="mock-chat-inbox" data-selected={selectedId ?? ''}>
        {/* Expose a button per fixture conversation so tests can trigger onSelect */}
        <button
          type="button"
          data-testid="select-site-conv"
          onClick={() =>
            onSelect({
              id: 'conv-site-1',
              kind: 'site',
              site_id: 'site-abc',
              title: 'Crew Chat',
              site_name: 'Green Valley',
              last_message_at: null,
              unread_count: 0,
              has_homeowner: true,
            })
          }
        >
          Open site conv
        </button>
        <button
          type="button"
          data-testid="select-homeowner-conv"
          onClick={() =>
            onSelect({
              id: 'conv-hw-1',
              kind: 'homeowner',
              site_id: 'site-abc',
              title: null,
              site_name: 'Green Valley',
              last_message_at: null,
              unread_count: 0,
              has_homeowner: true,
            })
          }
        >
          Open homeowner conv
        </button>
        <button
          type="button"
          data-testid="select-group-conv"
          onClick={() =>
            onSelect({
              id: 'conv-grp-1',
              kind: 'group',
              site_id: null,
              title: 'All Hands',
              site_name: null,
              last_message_at: null,
              unread_count: 0,
              has_homeowner: false,
            })
          }
        >
          Open group conv
        </button>
      </div>
    ),
  ),
}))

// --- ChatThread ---
vi.mock('./ChatThread', () => ({
  ChatThread: vi.fn(
    ({
      address,
      title,
      hasHomeowner,
      onManageGroup,
      siteId,
    }: {
      address: unknown
      title?: string
      hasHomeowner?: boolean
      onManageGroup?: () => void
      siteId?: string
    }) => (
      <div
        data-testid="mock-chat-thread"
        data-address={JSON.stringify(address)}
        data-title={title ?? ''}
        data-has-homeowner={String(hasHomeowner ?? false)}
        data-has-manage={String(!!onManageGroup)}
        data-site={siteId ?? ''}
      >
        {onManageGroup ? (
          <button type="button" data-testid="thread-manage-btn" onClick={onManageGroup}>
            Members
          </button>
        ) : null}
      </div>
    ),
  ),
}))

// --- GroupManageDrawer (shallow; the real one needs ToastProvider) ---
vi.mock('./groups/GroupManageDrawer', () => ({
  GroupManageDrawer: vi.fn(({ open, groupId }: { open: boolean; groupId: string }) =>
    open ? <div data-testid="mock-manage-drawer" data-group={groupId} /> : null,
  ),
}))

// --- useMe / useMeRole ---
vi.mock('../../auth/useCan', () => ({
  useMe: vi.fn(() => ({
    data: { id: 'u1', name: 'Rajan Verma', role: 'owner' },
    isLoading: false,
  })),
  useMeRole: vi.fn(() => 'owner'),
}))

// ---------------------------------------------------------------------------
// Now import the component under test (after mocks are set up)
// ---------------------------------------------------------------------------

import { ChatPage } from './ChatPage'

// ---------------------------------------------------------------------------
// Wrapper
// ---------------------------------------------------------------------------

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
  Wrapper.displayName = 'TestWrapper'
  return Wrapper
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ChatPage', () => {
  it('renders ChatInbox in the inbox pane on mount', () => {
    render(<ChatPage />, { wrapper: makeWrapper() })
    expect(screen.getByTestId('mock-chat-inbox')).toBeInTheDocument()
  })

  it('shows the empty state when no conversation is selected', () => {
    render(<ChatPage />, { wrapper: makeWrapper() })
    expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument()
    expect(screen.getByText('Select a conversation')).toBeInTheDocument()
  })

  it('does NOT render ChatThread before a conversation is selected', () => {
    render(<ChatPage />, { wrapper: makeWrapper() })
    expect(screen.queryByTestId('mock-chat-thread')).not.toBeInTheDocument()
  })

  it('renders ChatThread after selecting a site conversation', () => {
    render(<ChatPage />, { wrapper: makeWrapper() })

    fireEvent.click(screen.getByTestId('select-site-conv'))

    const thread = screen.getByTestId('mock-chat-thread')
    expect(thread).toBeInTheDocument()
    // Address should be { siteId: 'site-abc' }
    expect(JSON.parse(thread.getAttribute('data-address') ?? '{}')).toEqual({
      siteId: 'site-abc',
    })
    // Title: non-homeowner site → use title or site_name
    expect(thread.getAttribute('data-title')).toBe('Crew Chat')
    // has_homeowner=true but kind !== homeowner → hasHomeowner should be true
    expect(thread.getAttribute('data-has-homeowner')).toBe('true')
  })

  it('renders ChatThread with { conversationId } for a group conversation', () => {
    render(<ChatPage />, { wrapper: makeWrapper() })

    fireEvent.click(screen.getByTestId('select-group-conv'))

    const thread = screen.getByTestId('mock-chat-thread')
    expect(JSON.parse(thread.getAttribute('data-address') ?? '{}')).toEqual({
      conversationId: 'conv-grp-1',
    })
    expect(thread.getAttribute('data-title')).toBe('All Hands')
    expect(thread.getAttribute('data-has-homeowner')).toBe('false')
  })

  it('builds "Homeowner · {site_name}" title and hasHomeowner=false for homeowner threads', () => {
    render(<ChatPage />, { wrapper: makeWrapper() })

    fireEvent.click(screen.getByTestId('select-homeowner-conv'))

    const thread = screen.getByTestId('mock-chat-thread')
    // kind === 'homeowner' (not 'site') → address uses conversationId, not siteId
    expect(JSON.parse(thread.getAttribute('data-address') ?? '{}')).toEqual({
      conversationId: 'conv-hw-1',
    })
    expect(thread.getAttribute('data-title')).toBe('Homeowner · Green Valley')
    // has_homeowner=true BUT kind === 'homeowner' → hasHomeowner must be false (no double banner)
    expect(thread.getAttribute('data-has-homeowner')).toBe('false')
  })

  it('hides empty state once a conversation is selected', () => {
    render(<ChatPage />, { wrapper: makeWrapper() })
    expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('select-site-conv'))

    expect(screen.queryByTestId('chat-empty-state')).not.toBeInTheDocument()
  })

  it('offers group management for a group thread and opens the drawer', () => {
    render(<ChatPage />, { wrapper: makeWrapper() })

    fireEvent.click(screen.getByTestId('select-group-conv'))
    const thread = screen.getByTestId('mock-chat-thread')
    expect(thread.getAttribute('data-has-manage')).toBe('true')

    fireEvent.click(screen.getByTestId('thread-manage-btn'))
    const drawer = screen.getByTestId('mock-manage-drawer')
    expect(drawer).toBeInTheDocument()
    expect(drawer.getAttribute('data-group')).toBe('conv-grp-1')
  })

  it('does not offer group management for a site thread', () => {
    render(<ChatPage />, { wrapper: makeWrapper() })

    fireEvent.click(screen.getByTestId('select-site-conv'))
    expect(screen.getByTestId('mock-chat-thread').getAttribute('data-has-manage')).toBe('false')
    expect(screen.queryByTestId('mock-manage-drawer')).not.toBeInTheDocument()
  })

  it('passes siteId for a site thread but not for a company-wide group (Phase D)', () => {
    render(<ChatPage />, { wrapper: makeWrapper() })
    fireEvent.click(screen.getByTestId('select-site-conv'))
    expect(screen.getByTestId('mock-chat-thread').getAttribute('data-site')).toBe('site-abc')
  })

  it('omits siteId for a company-wide group (Phase D)', () => {
    render(<ChatPage />, { wrapper: makeWrapper() })
    fireEvent.click(screen.getByTestId('select-group-conv'))
    expect(screen.getByTestId('mock-chat-thread').getAttribute('data-site')).toBe('')
  })
})
