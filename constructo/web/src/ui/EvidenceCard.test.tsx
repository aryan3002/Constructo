import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EvidenceCard, type EvidenceItem } from './EvidenceCard'

const evidence: EvidenceItem[] = [
  { kind: 'photo', label: 'Site photo' },
  { kind: 'challan', label: 'Challan #4471', detail: '50 bags', meta: '₹18,500' },
]

describe('EvidenceCard', () => {
  it('renders the claim and starts collapsed', () => {
    render(<EvidenceCard claim="Slab poured" status="ok" evidence={evidence} />)
    expect(screen.getByRole('heading', { name: 'Slab poured' })).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /show proof/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Site photo')).not.toBeInTheDocument()
  })

  it('expands proof in place on click and collapses again', async () => {
    render(<EvidenceCard claim="Slab poured" status="ok" evidence={evidence} />)
    const toggle = screen.getByRole('button', { name: /show proof/i })

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Site photo')).toBeInTheDocument()
    expect(screen.getByText('Challan #4471')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /hide proof/i }))
    expect(screen.queryByText('Site photo')).not.toBeInTheDocument()
  })

  it('honors defaultOpen', () => {
    render(
      <EvidenceCard claim="x" status="info" evidence={evidence} defaultOpen />,
    )
    expect(screen.getByText('Site photo')).toBeInTheDocument()
  })

  it('disables the toggle when there is no evidence', () => {
    render(<EvidenceCard claim="x" status="warn" evidence={[]} />)
    const btn = screen.getByRole('button', { name: /no proof attached/i })
    expect(btn).toBeDisabled()
  })

  it('reflects the status on the article element', () => {
    render(<EvidenceCard claim="x" status="risk" evidence={evidence} />)
    expect(screen.getByRole('article')).toHaveAttribute('data-status', 'risk')
  })
})
