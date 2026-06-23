/**
 * BriefPin — unit tests (Phase D T4). Pinned ranked-risk card; hidden when calm.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BriefPin } from './BriefPin'

describe('BriefPin', () => {
  it('renders nothing when brief is undefined', () => {
    const { container } = render(<BriefPin brief={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when there are no risks (calm)', () => {
    const { container } = render(
      <BriefPin brief={{ site_id: 's1', risk_count: 0, headline: 'All caught up', risks: [] }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the headline and each risk message', () => {
    render(
      <BriefPin
        brief={{
          site_id: 's1',
          risk_count: 2,
          headline: '2 things need you',
          risks: [
            { kind: 'labor_shortfall', severity: 'high', message: 'Only 9 of 24 workers present', evidence_event_ids: [] },
            { kind: 'unverified_invoice', severity: 'medium', message: 'Steel invoice has no delivery', evidence_event_ids: [] },
          ],
        }}
      />,
    )
    expect(screen.getByText('2 things need you')).toBeInTheDocument()
    expect(screen.getByText(/9 of 24 workers/)).toBeInTheDocument()
    expect(screen.getByText(/Steel invoice/)).toBeInTheDocument()
  })
})
