/**
 * CaptureCard — jsdom render tests (Task 9).
 *
 * Assertions:
 *   1. Attendance event renders its key-fields line ("X workers").
 *   2. needs_clarification shows "Check this" pill (not contested → not Disputed).
 *   3. contested shows "Disputed" pill (overrides Check this).
 *   4. Approved pill renders when fields.status === 'approved'.
 *   5. Clicking "Show proof" reveals the proof panel (source text + confidence).
 *   6. "Hide proof" collapses the panel on second click.
 *   7. Invoice event renders INR-formatted amount in the key-field line.
 *   8. Material delivery key-field line includes qty+unit+material+vendor.
 *   9. Payment request key-field line includes INR amount + → recipient.
 *  10. raw_status=processing shows "processing…" cue.
 *  11. raw_status=failed shows "couldn't process" cue.
 *  12. Proof panel shows attachment image when message.attachment_url is set.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChatEvent, ChatMessage } from '../../api/chat'
import { CaptureCard } from './CaptureCard'
import { inr, keyFields } from './CaptureCard'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<ChatEvent> = {}): ChatEvent {
  return {
    id: 'ev-1',
    event_type: 'attendance',
    occurred_on: '2025-01-15T09:00:00Z',
    summary: 'Morning muster: 12 workers on B2 slab.',
    fields: { headcount: 12 },
    confidence: 0.87,
    needs_clarification: false,
    contested: false,
    ...overrides,
  }
}

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    conversation_id: 'conv-1',
    sender_id: 'user-1',
    sender_side: 'contractor',
    sender_name: 'Ravi Kumar',
    sender_role: 'supervisor',
    seq: 1,
    body: '12 workers arrived at 8am for B2 slab pour.',
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

// ---------------------------------------------------------------------------
// 1. Attendance — key-fields line
// ---------------------------------------------------------------------------
describe('CaptureCard — attendance event', () => {
  it('renders the headcount as "N workers" in the key-fields line', () => {
    render(<CaptureCard event={makeEvent()} message={makeMsg()} />)
    const fields = screen.getByTestId('key-fields')
    expect(fields.textContent).toContain('12 workers')
  })

  it('renders by_trade breakdown alongside headcount', () => {
    const ev = makeEvent({
      fields: { headcount: 8, by_trade: { mason: 5, carpenter: 3 } },
    })
    render(<CaptureCard event={ev} message={makeMsg()} />)
    const fields = screen.getByTestId('key-fields')
    expect(fields.textContent).toContain('8 workers')
    expect(fields.textContent).toContain('mason')
    expect(fields.textContent).toContain('carpenter')
  })

  it('shows the event type label "Attendance" in the type pill', () => {
    render(<CaptureCard event={makeEvent()} message={makeMsg()} />)
    expect(screen.getByText('Attendance')).toBeTruthy()
  })

  it('renders the summary text', () => {
    render(<CaptureCard event={makeEvent()} message={makeMsg()} />)
    expect(screen.getByTestId('summary').textContent).toContain('Morning muster')
  })
})

// ---------------------------------------------------------------------------
// 2. needs_clarification → "Check this" pill
// ---------------------------------------------------------------------------
describe('CaptureCard — needs_clarification', () => {
  it('shows "Check this" pill when needs_clarification=true and not contested', () => {
    const ev = makeEvent({ needs_clarification: true, contested: false })
    render(<CaptureCard event={ev} message={makeMsg()} />)
    expect(screen.getByTestId('pill-check-this')).toBeTruthy()
    expect(screen.queryByTestId('pill-disputed')).toBeNull()
  })

  it('does NOT show "Check this" when needs_clarification=false', () => {
    render(<CaptureCard event={makeEvent({ needs_clarification: false })} message={makeMsg()} />)
    expect(screen.queryByTestId('pill-check-this')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. contested → "Disputed" pill (suppresses "Check this")
// ---------------------------------------------------------------------------
describe('CaptureCard — contested', () => {
  it('shows "Disputed" pill when contested=true', () => {
    const ev = makeEvent({ contested: true })
    render(<CaptureCard event={ev} message={makeMsg()} />)
    expect(screen.getByTestId('pill-disputed')).toBeTruthy()
    expect(screen.getByText('Disputed')).toBeTruthy()
  })

  it('does NOT show "Check this" when contested=true even if needs_clarification=true', () => {
    const ev = makeEvent({ contested: true, needs_clarification: true })
    render(<CaptureCard event={ev} message={makeMsg()} />)
    expect(screen.queryByTestId('pill-check-this')).toBeNull()
    expect(screen.getByTestId('pill-disputed')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 4. Approved pill
// ---------------------------------------------------------------------------
describe('CaptureCard — approved status', () => {
  it('shows "Approved" pill when fields.status === "approved"', () => {
    const ev = makeEvent({
      event_type: 'approval',
      fields: { status: 'approved', decision: 'Approved column line revision' },
      summary: 'Column line revision approved.',
    })
    render(<CaptureCard event={ev} message={makeMsg()} />)
    expect(screen.getByTestId('pill-approved')).toBeTruthy()
    expect(screen.getByText('Approved')).toBeTruthy()
  })

  it('does NOT show "Approved" when status is not approved', () => {
    render(<CaptureCard event={makeEvent()} message={makeMsg()} />)
    expect(screen.queryByTestId('pill-approved')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 5 + 6. Show proof toggle
// ---------------------------------------------------------------------------
describe('CaptureCard — proof toggle', () => {
  it('hides the proof panel initially', () => {
    render(<CaptureCard event={makeEvent()} message={makeMsg()} />)
    expect(screen.queryByTestId('proof-panel')).toBeNull()
    expect(screen.getByText(/Show proof/)).toBeTruthy()
  })

  it('reveals the proof panel on first click', async () => {
    render(<CaptureCard event={makeEvent()} message={makeMsg()} />)
    await userEvent.click(screen.getByTestId('proof-toggle'))
    expect(screen.getByTestId('proof-panel')).toBeTruthy()
    expect(screen.getByText(/Hide proof/)).toBeTruthy()
  })

  it('shows source text (message.body) inside the proof panel', async () => {
    const msg = makeMsg({ body: '12 workers arrived at 8am for B2 slab pour.' })
    render(<CaptureCard event={makeEvent()} message={msg} />)
    await userEvent.click(screen.getByTestId('proof-toggle'))
    const source = screen.getByTestId('proof-source')
    expect(source.textContent).toContain('12 workers arrived')
  })

  it('shows the confidence percentage in the proof footer', async () => {
    const ev = makeEvent({ confidence: 0.87 })
    render(<CaptureCard event={ev} message={makeMsg()} />)
    await userEvent.click(screen.getByTestId('proof-toggle'))
    const footer = screen.getByTestId('proof-footer')
    expect(footer.textContent).toContain('87% sure')
  })

  it('collapses the proof panel on second click', async () => {
    render(<CaptureCard event={makeEvent()} message={makeMsg()} />)
    await userEvent.click(screen.getByTestId('proof-toggle'))
    expect(screen.getByTestId('proof-panel')).toBeTruthy()
    await userEvent.click(screen.getByTestId('proof-toggle'))
    expect(screen.queryByTestId('proof-panel')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 7. Invoice — INR-formatted amount
// ---------------------------------------------------------------------------
describe('CaptureCard — invoice_received', () => {
  it('renders an INR-formatted amount in the key-fields line', () => {
    const ev = makeEvent({
      event_type: 'invoice_received',
      fields: { amount: 125000, vendor: 'Shree Cement', invoice_number: 'INV-42' },
      summary: 'Invoice from Shree Cement.',
    })
    render(<CaptureCard event={ev} message={makeMsg()} />)
    const fields = screen.getByTestId('key-fields')
    // 125000 → ₹1,25,000
    expect(fields.textContent).toContain('₹1,25,000')
    expect(fields.textContent).toContain('Shree Cement')
    expect(fields.textContent).toContain('#INV-42')
  })
})

// ---------------------------------------------------------------------------
// 8. Material delivery — key-field line
// ---------------------------------------------------------------------------
describe('CaptureCard — material_delivery', () => {
  it('renders qty, unit, material, vendor in the key-fields line', () => {
    const ev = makeEvent({
      event_type: 'material_delivery',
      fields: { quantity: 50, unit: 'bags', material: 'OPC Cement', vendor: 'J.K. Cements' },
      summary: '50 bags OPC cement delivered.',
    })
    render(<CaptureCard event={ev} message={makeMsg()} />)
    const fields = screen.getByTestId('key-fields')
    expect(fields.textContent).toContain('50')
    expect(fields.textContent).toContain('bags')
    expect(fields.textContent).toContain('OPC Cement')
    expect(fields.textContent).toContain('J.K. Cements')
  })
})

// ---------------------------------------------------------------------------
// 9. Payment request — INR + recipient
// ---------------------------------------------------------------------------
describe('CaptureCard — payment_request', () => {
  it('renders INR amount and → recipient', () => {
    const ev = makeEvent({
      event_type: 'payment_request',
      fields: { amount: 50000, to: 'Ravi Masonry' },
      summary: 'Request ₹50,000 advance for Ravi Masonry.',
    })
    render(<CaptureCard event={ev} message={makeMsg()} />)
    const fields = screen.getByTestId('key-fields')
    expect(fields.textContent).toContain('₹50,000')
    expect(fields.textContent).toContain('Ravi Masonry')
  })
})

// ---------------------------------------------------------------------------
// 10. raw_status = processing
// ---------------------------------------------------------------------------
describe('CaptureCard — raw_status processing', () => {
  it('shows "processing…" cue for raw_status=queued', () => {
    const msg = makeMsg({ raw_status: 'queued' })
    render(<CaptureCard event={makeEvent()} message={msg} />)
    expect(screen.getByTestId('raw-processing').textContent).toContain('processing')
  })

  it('shows "processing…" cue for raw_status=processing', () => {
    const msg = makeMsg({ raw_status: 'processing' })
    render(<CaptureCard event={makeEvent()} message={msg} />)
    expect(screen.getByTestId('raw-processing').textContent).toContain('processing')
  })
})

// ---------------------------------------------------------------------------
// 11. raw_status = failed
// ---------------------------------------------------------------------------
describe('CaptureCard — raw_status failed', () => {
  it('shows "couldn\'t process" cue for raw_status=failed', () => {
    const msg = makeMsg({ raw_status: 'failed' })
    render(<CaptureCard event={makeEvent()} message={msg} />)
    expect(screen.getByTestId('raw-failed').textContent).toContain("couldn't process")
  })
})

// ---------------------------------------------------------------------------
// 12. Proof panel image attachment
// ---------------------------------------------------------------------------
describe('CaptureCard — attachment image in proof panel', () => {
  it('renders an <img> with the attachment_url inside the proof panel', async () => {
    const msg = makeMsg({ attachment_url: 'https://cdn.example.com/challan.jpg' })
    render(<CaptureCard event={makeEvent()} message={msg} />)
    await userEvent.click(screen.getByTestId('proof-toggle'))
    const img = screen.getByAltText('captured attachment') as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.src).toContain('challan.jpg')
  })
})

// ---------------------------------------------------------------------------
// Unit tests for pure helpers
// ---------------------------------------------------------------------------
describe('inr()', () => {
  it('formats small values with no grouping separator', () => {
    expect(inr(500)).toBe('₹500')
  })
  it('formats thousands with Indian grouping', () => {
    expect(inr(125000)).toBe('₹1,25,000')
  })
  it('formats lakhs correctly', () => {
    expect(inr(1250000)).toBe('₹12,50,000')
  })
  it('rounds fractional values', () => {
    expect(inr(999.9)).toBe('₹1,000')
  })
  it('handles negative amounts', () => {
    expect(inr(-50000)).toBe('-₹50,000')
  })
})

describe('keyFields()', () => {
  it('attendance: builds "N workers"', () => {
    expect(keyFields('attendance', { headcount: 7 })).toContain('7 workers')
  })
  it('material_delivery: builds qty unit material', () => {
    const line = keyFields('material_delivery', { quantity: 10, unit: 'bags', material: 'Sand' })
    expect(line).toContain('10 bags Sand')
  })
  it('invoice_received: builds INR amount + vendor', () => {
    const line = keyFields('invoice_received', { amount: 80000, vendor: 'ABC Co' })
    expect(line).toContain('₹80,000')
    expect(line).toContain('ABC Co')
  })
  it('payment_request: builds INR → to', () => {
    const line = keyFields('payment_request', { amount: 25000, to: 'Mason' })
    expect(line).toContain('₹25,000')
    expect(line).toContain('Mason')
  })
  it('unknown type returns empty string', () => {
    expect(keyFields('progress_update', {})).toBe('')
  })
})
