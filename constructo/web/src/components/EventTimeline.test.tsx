import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { EventTimeline } from './EventTimeline'
import type { SiteEvent } from '../api/types'

const events: SiteEvent[] = [
  {
    id: 'ev-1',
    site_id: 'site-1',
    event_type: 'material_delivery',
    occurred_on: '2026-05-28',
    summary: '12 tonnes of TMT bars delivered.',
    fields: {},
    confidence: 0.97,
    needs_clarification: false,
    source_message_ids: ['wa-110'],
    created_at: '2026-05-28T11:20:00Z',
  },
  {
    id: 'ev-2',
    site_id: 'site-1',
    event_type: 'issue',
    occurred_on: '2026-05-28',
    summary: 'RMC booking missed.',
    fields: {},
    confidence: 0.74,
    needs_clarification: true,
    source_message_ids: [],
    created_at: '2026-05-28T10:02:00Z',
  },
]

describe('EventTimeline', () => {
  it('renders one item per event with a type badge', () => {
    render(<EventTimeline events={events} />)
    const items = screen.getAllByTestId('event-item')
    expect(items).toHaveLength(2)

    const badges = screen.getAllByTestId('event-badge')
    expect(badges[0]).toHaveTextContent('Material')
    expect(badges[1]).toHaveTextContent('Issue')
  })

  it('shows confidence as a percentage', () => {
    render(<EventTimeline events={events} />)
    const confidences = screen.getAllByTestId('event-confidence')
    expect(confidences[0]).toHaveTextContent('97%')
    expect(confidences[1]).toHaveTextContent('74%')
  })

  it('flags events that need clarification', () => {
    render(<EventTimeline events={events} />)
    const items = screen.getAllByTestId('event-item')
    expect(within(items[1]).getByTestId('needs-clarification')).toBeInTheDocument()
    expect(within(items[0]).queryByTestId('needs-clarification')).toBeNull()
  })
})
