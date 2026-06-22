/**
 * MessageBubble — render-level tests (jsdom).
 *
 * Assertions:
 *   1. Own message is aligned right (has ml-auto class on wrapper).
 *   2. Read tick renders as ✓✓ with text-brand color class.
 *   3. Sender name is shown for "other" messages when showSenderName=true.
 *   4. Sender name is NOT shown on own messages even with showSenderName=true.
 *   5. Ticks do NOT render on a non-own message.
 *   6. Image attachment renders an <img> with the attachment_url src.
 *   7. Document chip renders with the attachment_url href.
 *   8. Quoted-parent strip renders when reply_to_id resolves.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChatMessage } from '../../api/chat'
import { MessageBubble } from './MessageBubble'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    conversation_id: 'conv-1',
    sender_id: 'user-1',
    sender_side: 'contractor',
    sender_name: 'Priya Sharma',
    sender_role: 'supervisor',
    seq: 1,
    body: 'Concrete pour done on B2 slab.',
    reply_to_id: null,
    media_type: 'text',
    created_at: '2025-01-15T09:30:00Z',
    attachment_url: null,
    events: [],
    raw_status: null,
    sender_kind: 'user',
    meta: null,
    ...overrides,
  }
}

const BASE_MINE = makeMsg({ id: 'msg-mine' })
const BASE_OTHER = makeMsg({ id: 'msg-other' })

// ---------------------------------------------------------------------------
// 1. Own message aligns right
// ---------------------------------------------------------------------------
describe('MessageBubble — own message', () => {
  it('has ml-auto class (right-aligned)', () => {
    const { container } = render(
      <MessageBubble
        message={BASE_MINE}
        mine={true}
        showSenderName={false}
      />,
    )
    const bubble = container.querySelector('[data-testid="bubble-mine"]')
    expect(bubble).not.toBeNull()
    expect(bubble!.className).toContain('ml-auto')
  })

  it('renders a read tick (✓✓ + text-brand) when deliveryState=read', () => {
    render(
      <MessageBubble
        message={BASE_MINE}
        mine={true}
        showSenderName={false}
        deliveryState="read"
      />,
    )
    const tick = screen.getByLabelText('Read')
    expect(tick.textContent).toBe('✓✓')
    expect(tick.className).toContain('text-brand')
  })

  it('renders a muted tick (✓) for deliveryState=sent', () => {
    render(
      <MessageBubble
        message={BASE_MINE}
        mine={true}
        showSenderName={false}
        deliveryState="sent"
      />,
    )
    const tick = screen.getByLabelText('Sent')
    expect(tick.textContent).toBe('✓')
    expect(tick.className).toContain('text-text-muted')
  })

  it('renders muted double-tick for deliveryState=delivered', () => {
    render(
      <MessageBubble
        message={BASE_MINE}
        mine={true}
        showSenderName={false}
        deliveryState="delivered"
      />,
    )
    const tick = screen.getByLabelText('Delivered')
    expect(tick.textContent).toBe('✓✓')
    expect(tick.className).toContain('text-text-muted')
  })

  it('does NOT render a tick when deliveryState is undefined', () => {
    render(
      <MessageBubble
        message={BASE_MINE}
        mine={true}
        showSenderName={false}
      />,
    )
    expect(screen.queryByLabelText('Read')).toBeNull()
    expect(screen.queryByLabelText('Sent')).toBeNull()
    expect(screen.queryByLabelText('Delivered')).toBeNull()
  })

  it('does NOT render sender name even when showSenderName=true', () => {
    render(
      <MessageBubble
        message={BASE_MINE}
        mine={true}
        showSenderName={true}
      />,
    )
    // Should not find the sender name text
    expect(screen.queryByText(/Priya Sharma/)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. Other message
// ---------------------------------------------------------------------------
describe('MessageBubble — other message', () => {
  it('is NOT ml-auto (left-aligned / mr-auto)', () => {
    const { container } = render(
      <MessageBubble
        message={BASE_OTHER}
        mine={false}
        showSenderName={false}
      />,
    )
    const bubble = container.querySelector('[data-testid="bubble-other"]')
    expect(bubble).not.toBeNull()
    expect(bubble!.className).not.toContain('ml-auto')
  })

  it('shows sender name when showSenderName=true and sender_name is set', () => {
    render(
      <MessageBubble
        message={BASE_OTHER}
        mine={false}
        showSenderName={true}
      />,
    )
    expect(screen.getByText(/Priya Sharma/)).toBeTruthy()
  })

  it('does NOT show sender name when showSenderName=false', () => {
    render(
      <MessageBubble
        message={BASE_OTHER}
        mine={false}
        showSenderName={false}
      />,
    )
    expect(screen.queryByText(/Priya Sharma/)).toBeNull()
  })

  it('does NOT render any tick glyph', () => {
    render(
      <MessageBubble
        message={BASE_OTHER}
        mine={false}
        showSenderName={false}
        deliveryState="read"   // even if passed, ticks must not render for others
      />,
    )
    expect(screen.queryByLabelText('Read')).toBeNull()
    expect(screen.queryByText('✓✓')).toBeNull()
    expect(screen.queryByText('✓')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. Image attachment
// ---------------------------------------------------------------------------
describe('MessageBubble — image attachment', () => {
  it('renders an <img> with the attachment_url', () => {
    const imgMsg = makeMsg({
      attachment_url: 'https://cdn.example.com/photo.jpg',
      media_type: 'image',
    })
    render(
      <MessageBubble message={imgMsg} mine={false} showSenderName={false} />,
    )
    const img = screen.getByRole('img', { name: /attachment/i })
    expect(img).toBeTruthy()
    expect((img as HTMLImageElement).src).toContain('photo.jpg')
  })

  it('does NOT render an img when media_type is not image', () => {
    const textMsg = makeMsg({ attachment_url: null, media_type: 'text' })
    render(
      <MessageBubble message={textMsg} mine={false} showSenderName={false} />,
    )
    expect(screen.queryByRole('img', { name: /attachment/i })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 4. Document / voice chip
// ---------------------------------------------------------------------------
describe('MessageBubble — document/voice chip', () => {
  it('renders a chip linking to the attachment_url for document media_type', () => {
    const docMsg = makeMsg({
      attachment_url: 'https://cdn.example.com/invoice.pdf',
      media_type: 'document',
    })
    render(
      <MessageBubble message={docMsg} mine={false} showSenderName={false} />,
    )
    const chip = screen.getByRole('link')
    expect((chip as HTMLAnchorElement).href).toContain('invoice.pdf')
    expect(chip.textContent).toContain('document')
  })
})

// ---------------------------------------------------------------------------
// 5. Quoted parent strip
// ---------------------------------------------------------------------------
describe('MessageBubble — quoted parent', () => {
  it('renders the quoted parent strip when reply_to_id resolves', () => {
    const parent: ChatMessage = makeMsg({
      id: 'parent-1',
      body: 'Original message text',
    })
    const replyMsg = makeMsg({ reply_to_id: 'parent-1' })
    const resolveParent = vi.fn().mockReturnValue(parent)

    render(
      <MessageBubble
        message={replyMsg}
        mine={false}
        showSenderName={false}
        resolveParent={resolveParent}
      />,
    )
    expect(screen.getByLabelText('Quoted message')).toBeTruthy()
    expect(screen.getByText(/Original message text/)).toBeTruthy()
  })

  it('does NOT render quoted strip when reply_to_id is null', () => {
    render(
      <MessageBubble message={BASE_OTHER} mine={false} showSenderName={false} />,
    )
    expect(screen.queryByLabelText('Quoted message')).toBeNull()
  })

  it('does NOT render quoted strip when resolveParent returns undefined', () => {
    const msg = makeMsg({ reply_to_id: 'ghost-id' })
    const resolveParent = vi.fn().mockReturnValue(undefined)

    render(
      <MessageBubble
        message={msg}
        mine={false}
        showSenderName={false}
        resolveParent={resolveParent}
      />,
    )
    expect(screen.queryByLabelText('Quoted message')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 6. onReply affordance
// ---------------------------------------------------------------------------
describe('MessageBubble — onReply', () => {
  it('calls onReply when the Reply button is clicked', async () => {
    const onReply = vi.fn()
    render(
      <MessageBubble
        message={BASE_OTHER}
        mine={false}
        showSenderName={false}
        onReply={onReply}
      />,
    )
    const btn = screen.getByRole('button', { name: /reply/i })
    await userEvent.click(btn)
    expect(onReply).toHaveBeenCalledWith(BASE_OTHER)
  })
})
