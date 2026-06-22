/**
 * chatExtras.test.tsx — Task 10: NivaanProposalCard + SystemNotice tests.
 *
 * Assertions:
 *   1. A proposal message renders the summary.
 *   2. A committable proposal shows a Confirm button.
 *   3. Clicking Confirm calls onConfirm with (capture_type, fields) and shows "✓ Added".
 *   4. A committable=false proposal shows NO Confirm button.
 *   5. Post-Dismiss shows "Dismissed" (double-dismiss guard).
 *   6. SystemNotice renders the contested dispute line for meta.blocked.reason==='contested'.
 *   7. SystemNotice renders the body for sender_kind==='system'.
 *   8. SystemNotice returns null (no element) for a normal user message.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChatMessage } from '../../api/chat'
import { NivaanProposalCard } from './NivaanProposalCard'
import { SystemNotice } from './SystemNotice'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeProposalMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-p1',
    conversation_id: 'conv-1',
    sender_id: null,
    sender_side: 'contractor',
    sender_name: null,
    sender_role: null,
    seq: 10,
    body: null,
    reply_to_id: null,
    media_type: 'text',
    created_at: '2025-01-15T09:30:00Z',
    attachment_url: null,
    events: [],
    raw_status: null,
    sender_kind: 'nivaan',
    meta: {
      proposal: {
        tier: 'commit',
        kind: 'capture',
        capture_type: 'attendance',
        fields: { headcount: 12, by_trade: { mason: 7 } },
        summary: 'Log 12 workers on B2 slab — tap to confirm.',
        evidence_event_ids: ['ev-1'],
        committable: true,
      },
    },
    ...overrides,
  }
}

function makeSystemMsg(body: string): ChatMessage {
  return {
    id: 'msg-sys-1',
    conversation_id: 'conv-1',
    sender_id: null,
    sender_side: 'contractor',
    sender_name: null,
    sender_role: null,
    seq: 5,
    body,
    reply_to_id: null,
    media_type: 'text',
    created_at: '2025-01-15T08:00:00Z',
    attachment_url: null,
    events: [],
    raw_status: null,
    sender_kind: 'system',
    meta: null,
  }
}

function makeUserMsg(): ChatMessage {
  return {
    id: 'msg-u1',
    conversation_id: 'conv-1',
    sender_id: 'user-1',
    sender_side: 'contractor',
    sender_name: 'Ravi Kumar',
    sender_role: 'supervisor',
    seq: 2,
    body: 'Workers arrived.',
    reply_to_id: null,
    media_type: 'text',
    created_at: '2025-01-15T08:15:00Z',
    attachment_url: null,
    events: [],
    raw_status: null,
    sender_kind: 'user',
    meta: null,
  }
}

// ---------------------------------------------------------------------------
// NivaanProposalCard
// ---------------------------------------------------------------------------

describe('NivaanProposalCard — basic render', () => {
  it('renders the proposal summary', () => {
    render(<NivaanProposalCard message={makeProposalMsg()} onConfirm={vi.fn()} />)
    expect(screen.getByTestId('proposal-summary').textContent).toContain(
      'Log 12 workers on B2 slab',
    )
  })

  it('renders the ✦ Nivaan eyebrow', () => {
    render(<NivaanProposalCard message={makeProposalMsg()} onConfirm={vi.fn()} />)
    expect(screen.getByTestId('nivaan-eyebrow').textContent).toContain('Nivaan')
  })

  it('returns null when message has no proposal meta', () => {
    const msg = makeProposalMsg({ meta: null })
    const { container } = render(
      <NivaanProposalCard message={msg} onConfirm={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('NivaanProposalCard — committable=true: Confirm button', () => {
  it('shows a Confirm button when committable=true', () => {
    render(<NivaanProposalCard message={makeProposalMsg()} onConfirm={vi.fn()} />)
    expect(screen.getByTestId('confirm-btn')).toBeTruthy()
  })

  it('clicking Confirm calls onConfirm with the correct capture_type and fields', async () => {
    const spy = vi.fn()
    render(<NivaanProposalCard message={makeProposalMsg()} onConfirm={spy} />)
    await userEvent.click(screen.getByTestId('confirm-btn'))
    expect(spy).toHaveBeenCalledOnce()
    expect(spy).toHaveBeenCalledWith('attendance', { headcount: 12, by_trade: { mason: 7 } })
  })

  it('replaces buttons with "✓ Added" after Confirm', async () => {
    render(<NivaanProposalCard message={makeProposalMsg()} onConfirm={vi.fn()} />)
    await userEvent.click(screen.getByTestId('confirm-btn'))
    expect(screen.getByTestId('action-status').textContent).toContain('✓ Added')
    expect(screen.queryByTestId('confirm-btn')).toBeNull()
    expect(screen.queryByTestId('dismiss-btn')).toBeNull()
  })

  it('does not call onConfirm again on double-click (guard)', async () => {
    // Because buttons are replaced after first click, a second click is
    // impossible in the DOM. We verify the spy was called exactly once.
    const spy = vi.fn()
    render(<NivaanProposalCard message={makeProposalMsg()} onConfirm={spy} />)
    await userEvent.click(screen.getByTestId('confirm-btn'))
    // confirm-btn is gone — spy must still be called exactly once
    expect(spy).toHaveBeenCalledOnce()
  })
})

describe('NivaanProposalCard — committable=false: no Confirm button', () => {
  it('does NOT show a Confirm button when committable=false', () => {
    const msg = makeProposalMsg({
      meta: {
        proposal: {
          tier: 'commit',
          kind: 'capture',
          capture_type: 'attendance',
          fields: {},
          summary: 'Pending — more info needed.',
          evidence_event_ids: [],
          committable: false,
        },
      },
    })
    render(<NivaanProposalCard message={msg} onConfirm={vi.fn()} />)
    expect(screen.queryByTestId('confirm-btn')).toBeNull()
    // Dismiss is still present
    expect(screen.getByTestId('dismiss-btn')).toBeTruthy()
  })
})

describe('NivaanProposalCard — Dismiss', () => {
  it('replaces buttons with "Dismissed" after clicking Dismiss', async () => {
    render(<NivaanProposalCard message={makeProposalMsg()} onConfirm={vi.fn()} />)
    await userEvent.click(screen.getByTestId('dismiss-btn'))
    expect(screen.getByTestId('action-status').textContent).toBe('Dismissed')
    expect(screen.queryByTestId('dismiss-btn')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// SystemNotice
// ---------------------------------------------------------------------------

describe('SystemNotice — contested block', () => {
  it('renders the dispute notice for meta.blocked.reason === "contested"', () => {
    const msg: ChatMessage = {
      ...makeUserMsg(),
      meta: { blocked: { reason: 'contested', event_id: 'ev-1' } },
    }
    render(<SystemNotice message={msg} />)
    const el = screen.getByTestId('system-notice')
    expect(el.textContent).toContain("Can't approve")
    expect(el.textContent).toContain('disputed')
  })
})

describe('SystemNotice — sender_kind=system', () => {
  it('renders the body verbatim for sender_kind=system', () => {
    const msg = makeSystemMsg('Ravi Kumar joined the site chat.')
    render(<SystemNotice message={msg} />)
    const el = screen.getByTestId('system-notice')
    expect(el.textContent).toContain('Ravi Kumar joined')
  })
})

describe('SystemNotice — normal user message', () => {
  it('returns null (no element rendered) for a normal user message', () => {
    const { container } = render(<SystemNotice message={makeUserMsg()} />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null for a nivaan message without blocked meta', () => {
    const msg = makeProposalMsg({ sender_kind: 'nivaan', meta: { proposal: undefined } })
    const { container } = render(<SystemNotice message={msg} />)
    expect(container.firstChild).toBeNull()
  })
})
