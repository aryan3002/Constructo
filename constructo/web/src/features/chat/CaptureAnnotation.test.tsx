/**
 * CaptureAnnotation.test.tsx — the compact, secondary extraction annotation.
 * Only real captures reach it (ChatThread filters junk); here we test that it
 * surfaces the structured data, falls back to the summary, flags "Check this",
 * and fires its actions.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CaptureAnnotation } from './CaptureAnnotation'
import type { ChatEvent, ChatMessage } from '../../api/chat'

const DAY = '2024-06-10T09:00:00.000Z'

const msg: ChatMessage = {
  id: 'm1',
  conversation_id: 'c1',
  sender_id: 'u1',
  sender_side: 'contractor',
  sender_name: 'Aryan',
  sender_role: 'supervisor',
  seq: 1,
  body: null,
  reply_to_id: null,
  media_type: 'image',
  created_at: DAY,
  attachment_url: 'https://x/img.jpg',
  events: [],
  sender_kind: 'user',
}

const ev = (over: Partial<ChatEvent>): ChatEvent => ({
  id: 'e1',
  event_type: 'material_delivery',
  occurred_on: DAY,
  summary: '',
  fields: {},
  confidence: 0.9,
  needs_clarification: false,
  contested: false,
  ...over,
})

describe('CaptureAnnotation', () => {
  it('shows the structured field line for a delivery', () => {
    render(
      <CaptureAnnotation
        event={ev({ fields: { quantity: 50, unit: 'bags', material: 'cement', vendor: 'ACME' } })}
        message={msg}
        mine={false}
      />,
    )
    const ann = screen.getByTestId('capture-annotation')
    expect(ann).toHaveTextContent('50 bags cement')
    expect(ann).toHaveTextContent('ACME')
  })

  it('falls back to the summary when there are no structured fields', () => {
    render(
      <CaptureAnnotation
        event={ev({ event_type: 'issue', fields: {}, summary: 'Crack in slab' })}
        message={msg}
        mine={false}
      />,
    )
    expect(screen.getByTestId('capture-annotation')).toHaveTextContent('Crack in slab')
  })

  it('shows the "Check this" pill when needs_clarification', () => {
    render(<CaptureAnnotation event={ev({ needs_clarification: true })} message={msg} mine={false} />)
    expect(screen.getByTestId('ann-check')).toBeInTheDocument()
  })

  it('fires onDispute / onMakeTodo', () => {
    const onDispute = vi.fn()
    const onMakeTodo = vi.fn()
    render(
      <CaptureAnnotation
        event={ev({ fields: { quantity: 5, unit: 'bags', material: 'sand' } })}
        message={msg}
        mine={false}
        onDispute={onDispute}
        onMakeTodo={onMakeTodo}
      />,
    )
    fireEvent.click(screen.getByText('Dispute'))
    fireEvent.click(screen.getByText('Make a to-do'))
    expect(onDispute).toHaveBeenCalledTimes(1)
    expect(onMakeTodo).toHaveBeenCalledTimes(1)
  })
})
