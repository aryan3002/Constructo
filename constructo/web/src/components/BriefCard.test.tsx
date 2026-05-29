import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BriefCard } from './BriefCard'
import type { BriefSite } from '../api/types'

const site: BriefSite = {
  site_id: 'site-1',
  name: 'Green Valley Towers',
  counts: { attendance: 42, deliveries: 3, issues: 2 },
  // Intentionally out of order: low, high, med — component must sort high first.
  top_risks: [
    {
      site_id: 'site-1',
      kind: 'attendance',
      severity: 'low',
      message: 'Crew 1 short',
      evidence_event_ids: [],
    },
    {
      site_id: 'site-1',
      kind: 'schedule_delay',
      severity: 'high',
      message: 'Slab pour delayed',
      evidence_event_ids: ['ev-1'],
    },
    {
      site_id: 'site-1',
      kind: 'safety',
      severity: 'med',
      message: 'Helmet violation',
      evidence_event_ids: ['ev-3'],
    },
  ],
}

function renderCard() {
  return render(
    <MemoryRouter>
      <BriefCard site={site} />
    </MemoryRouter>,
  )
}

describe('BriefCard', () => {
  it('renders risks in severity order: high, med, low', () => {
    renderCard()
    const items = screen.getAllByTestId('risk-item')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveAttribute('data-severity', 'high')
    expect(items[1]).toHaveAttribute('data-severity', 'med')
    expect(items[2]).toHaveAttribute('data-severity', 'low')
  })

  it('applies correct color classes per severity', () => {
    renderCard()
    const items = screen.getAllByTestId('risk-item')
    expect(items[0].className).toContain('bg-red-100') // high
    expect(items[1].className).toContain('bg-amber-100') // med
    expect(items[2].className).toContain('bg-gray-100') // low
  })

  it('renders the three counts', () => {
    renderCard()
    const counts = screen.getByLabelText('Counts')
    expect(within(counts).getByText('42')).toBeInTheDocument()
    expect(within(counts).getByText('3')).toBeInTheDocument()
    expect(within(counts).getByText('2')).toBeInTheDocument()
  })
})
