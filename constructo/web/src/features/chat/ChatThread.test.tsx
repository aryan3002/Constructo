/**
 * ChatThread.test.tsx — message-to-primitive routing + day separator.
 *
 * Mocks useChatThread and useMe so all children are trivially renderable
 * without a real React Query / WebSocket environment.  The children
 * (MessageBubble, CaptureCard, SystemNotice) are already unit-tested
 * individually; here we only test that ChatThread routes each message shape
 * to the right primitive and inserts day separators correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactElement } from 'react'
import { ToastProvider } from '../../ui/Toast'
import { ChatThread } from './ChatThread'
import { actionItemsApi } from '../../api/actionItems'
import type { ChatMessage } from '../../api/chat'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DAY1 = '2024-06-10T09:00:00.000Z'
const DAY2 = '2024-06-11T08:00:00.000Z' // different calendar day

const plainMsg: ChatMessage = {
  id: 'msg-1',
  conversation_id: 'c1',
  sender_id: 'user-42',
  sender_side: 'contractor',
  sender_name: 'Aryan',
  sender_role: 'supervisor',
  seq: 1,
  body: 'Hello from the site',
  reply_to_id: null,
  media_type: 'text',
  created_at: DAY1,
  attachment_url: null,
  events: [],
  sender_kind: 'user',
}

const eventMsg: ChatMessage = {
  id: 'msg-2',
  conversation_id: 'c1',
  sender_id: 'user-42',
  sender_side: 'contractor',
  sender_name: 'Aryan',
  sender_role: 'supervisor',
  seq: 2,
  body: '18 workers today',
  reply_to_id: null,
  media_type: 'text',
  created_at: DAY1,
  attachment_url: null,
  events: [
    {
      id: 'ev-1',
      event_type: 'attendance',
      occurred_on: DAY1,
      summary: '18 workers on-site',
      fields: { headcount: 18 },
      confidence: 0.95,
      needs_clarification: false,
      contested: false,
    },
  ],
  sender_kind: 'user',
}

const systemMsg: ChatMessage = {
  id: 'msg-3',
  conversation_id: 'c1',
  sender_id: null,
  sender_side: 'contractor',
  sender_name: null,
  seq: 3,
  body: 'Aryan joined the thread',
  reply_to_id: null,
  media_type: 'text',
  created_at: DAY2, // different day → triggers separator before this msg
  attachment_url: null,
  events: [],
  sender_kind: 'system',
}

const proposalMsg: ChatMessage = {
  id: 'msg-4',
  conversation_id: 'c1',
  sender_id: 'ai-nivaan',
  sender_side: 'contractor',
  sender_name: 'Nivaan',
  sender_role: 'supervisor',
  seq: 4,
  body: '',
  reply_to_id: null,
  media_type: 'text',
  created_at: DAY2,
  attachment_url: null,
  events: [],
  sender_kind: 'user',
  meta: {
    proposal: {
      tier: 'commit',
      kind: 'capture',
      capture_type: 'attendance',
      fields: { headcount: 12 },
      summary: 'Log 12 workers?',
      evidence_event_ids: [],
      committable: true,
    },
  },
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock useChatThread to return our fixture messages (including proposal).
vi.mock('./useChatThread', () => ({
  useChatThread: () => ({
    messages: [plainMsg, eventMsg, systemMsg, proposalMsg],
    isLoading: false,
    error: null,
    sending: false,
    reply: null,
    setReply: vi.fn(),
    send: vi.fn(),
    sendMedia: vi.fn(),
    sendProposal: vi.fn(),
    loadOlder: vi.fn(),
    hasOlder: false,
    deliveryState: (_seq: number) => undefined,
    retry: vi.fn(),
    pending: [],
  }),
}))

// Mock useMe so MessageBubble can compare sender_id.
vi.mock('../../auth/useCan', () => ({
  useMe: () => ({ data: { id: 'user-other', role: 'supervisor' } }),
  useMeRole: () => 'supervisor',
  useCan: () => true,
}))

// Mock ChatComposer so we don't need to replicate its API-heavy internals.
vi.mock('./ChatComposer', () => ({
  ChatComposer: () => <div data-testid="chat-composer" />,
}))

// Phase D — shallow-mock the command surfaces (tested separately); capture
// open-state so the command-bar wiring is assertable.
vi.mock('./insights/BriefPin', () => ({ BriefPin: () => null }))
vi.mock('./insights/RadarDrawer', () => ({ RadarDrawer: ({ open }: { open: boolean }) => (open ? <div data-testid="radar-drawer" /> : null) }))
vi.mock('./insights/RecapDrawer', () => ({ RecapDrawer: ({ open }: { open: boolean }) => (open ? <div data-testid="recap-drawer" /> : null) }))
vi.mock('./actionitems/ActionItemsDrawer', () => ({ ActionItemsDrawer: ({ open }: { open: boolean }) => (open ? <div data-testid="todos-drawer" /> : null) }))
vi.mock('./disputes/DisputeModal', () => ({ DisputeModal: ({ open }: { open: boolean }) => (open ? <div data-testid="dispute-modal" /> : null) }))
vi.mock('../../api/actionItems', () => ({ actionItemsApi: { create: vi.fn().mockResolvedValue({ id: 'a1' }) } }))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function renderThread(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>)
}

const mockCreateTodo = actionItemsApi.create as ReturnType<typeof vi.fn>

describe('ChatThread', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const address = { siteId: 'site-1' }

  it('renders a MessageBubble for a plain text message', () => {
    renderThread(<ChatThread address={address} title="Site Chat" />)
    // MessageBubble renders data-testid="bubble-other" (not mine, since me.id ≠ sender_id)
    expect(screen.getByTestId('bubble-other')).toBeInTheDocument()
  })

  it('renders a CaptureCard for a message with a known event type', () => {
    renderThread(<ChatThread address={address} />)
    // CaptureCard renders data-testid="capture-card"
    expect(screen.getByTestId('capture-card')).toBeInTheDocument()
  })

  it('renders a SystemNotice for a system-kind message', () => {
    renderThread(<ChatThread address={address} />)
    // SystemNotice renders data-testid="system-notice"
    expect(screen.getByTestId('system-notice')).toBeInTheDocument()
    expect(screen.getByTestId('system-notice')).toHaveTextContent('Aryan joined the thread')
  })

  it('inserts a day separator between messages on different calendar days', () => {
    renderThread(<ChatThread address={address} />)
    // The separator appears before msg-3 (DAY2 vs DAY1)
    const separators = screen.getAllByTestId('day-separator')
    expect(separators.length).toBeGreaterThanOrEqual(1)
  })

  it('does NOT insert a day separator between messages on the same day', () => {
    renderThread(<ChatThread address={address} />)
    // msg-1 and msg-2 share DAY1 — only one separator total (before msg-3)
    const separators = screen.getAllByTestId('day-separator')
    expect(separators.length).toBe(1)
  })

  it('renders the title in the header', () => {
    renderThread(<ChatThread address={address} title="Test Thread Title" />)
    expect(screen.getByText('Test Thread Title')).toBeInTheDocument()
  })

  it('shows the client banner when hasHomeowner is true', () => {
    renderThread(<ChatThread address={address} hasHomeowner={true} />)
    expect(screen.getByTestId('client-banner')).toBeInTheDocument()
    expect(screen.getByTestId('client-banner')).toHaveTextContent('Client is in this thread')
  })

  it('hides the client banner when hasHomeowner is false', () => {
    renderThread(<ChatThread address={address} hasHomeowner={false} />)
    expect(screen.queryByTestId('client-banner')).not.toBeInTheDocument()
  })

  it('renders the ChatComposer', () => {
    renderThread(<ChatThread address={address} />)
    expect(screen.getByTestId('chat-composer')).toBeInTheDocument()
  })

  it('renders a NivaanProposalCard for a message with meta.proposal', () => {
    renderThread(<ChatThread address={address} />)
    // NivaanProposalCard renders data-testid="nivaan-proposal-card"
    expect(screen.getByTestId('nivaan-proposal-card')).toBeInTheDocument()
    // Also verify the proposal summary is visible
    expect(screen.getByTestId('proposal-summary')).toHaveTextContent('Log 12 workers?')
  })

  it('shows a Members button when onManageGroup is provided and calls it on click', () => {
    const onManageGroup = vi.fn()
    renderThread(<ChatThread address={address} title="All Hands" onManageGroup={onManageGroup} />)
    fireEvent.click(screen.getByRole('button', { name: /members/i }))
    expect(onManageGroup).toHaveBeenCalledOnce()
  })

  it('hides the Members button when onManageGroup is absent', () => {
    renderThread(<ChatThread address={address} title="Site" />)
    expect(screen.queryByRole('button', { name: /members/i })).not.toBeInTheDocument()
  })

  it('shows the command bar and opens Radar on a site thread (Phase D)', () => {
    renderThread(<ChatThread address={{ siteId: 's1' }} title="Site" siteId="s1" />)
    expect(screen.getByRole('button', { name: /^radar$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^recap$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^to-dos$/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^radar$/i }))
    expect(screen.getByTestId('radar-drawer')).toBeInTheDocument()
  })

  it('hides the command bar when there is no siteId (Phase D)', () => {
    renderThread(<ChatThread address={{ conversationId: 'g1' }} title="Group" />)
    expect(screen.queryByRole('button', { name: /^radar$/i })).toBeNull()
  })

  it('creates a to-do from a capture card (Phase D)', async () => {
    renderThread(<ChatThread address={{ siteId: 's1' }} title="Site" siteId="s1" />)
    fireEvent.click(screen.getByRole('button', { name: /make a to-do/i }))
    await waitFor(() =>
      expect(mockCreateTodo).toHaveBeenCalledWith(
        expect.objectContaining({ site_id: 's1', source_message_id: 'msg-2' }),
      ),
    )
  })
})
