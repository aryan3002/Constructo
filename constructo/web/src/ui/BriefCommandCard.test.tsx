import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BriefCommandCard, type BriefRisk } from './BriefCommandCard'

const risks: BriefRisk[] = [
  { id: 'r1', claim: 'Slab delayed', status: 'risk' },
  { id: 'r2', claim: 'Helmet compliance', status: 'warn' },
  { id: 'r3', claim: 'Payment request', status: 'info' },
  { id: 'r4', claim: 'Overflow', status: 'warn' },
]

describe('BriefCommandCard', () => {
  it('renders the site name and only the top 3 risks', () => {
    render(<BriefCommandCard siteName="Green Valley" siteStatus="risk" risks={risks} />)
    expect(screen.getByRole('heading', { name: 'Green Valley' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Slab delayed' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Overflow' })).not.toBeInTheDocument()
  })

  it('shows an overflow footer for risks beyond the top 3', () => {
    render(<BriefCommandCard siteName="x" siteStatus="risk" risks={risks} />)
    expect(screen.getByText('+1 more at this site')).toBeInTheDocument()
  })

  it('fires onAction with the risk id and chosen action', async () => {
    const onAction = vi.fn()
    render(
      <BriefCommandCard
        siteName="x"
        siteStatus="risk"
        risks={risks.slice(0, 1)}
        onAction={onAction}
      />,
    )
    const row = screen.getByRole('article')
    await userEvent.click(within(row).getByRole('button', { name: 'Approve' }))
    expect(onAction).toHaveBeenCalledWith('r1', 'approve')
    await userEvent.click(within(row).getByRole('button', { name: 'Hold' }))
    expect(onAction).toHaveBeenCalledWith('r1', 'hold')
    await userEvent.click(within(row).getByRole('button', { name: 'Assign' }))
    expect(onAction).toHaveBeenCalledWith('r1', 'assign')
  })

  it('shows an on-track message when there are no risks', () => {
    render(<BriefCommandCard siteName="x" siteStatus="ok" risks={[]} />)
    expect(screen.getByText(/on track/i)).toBeInTheDocument()
  })
})
