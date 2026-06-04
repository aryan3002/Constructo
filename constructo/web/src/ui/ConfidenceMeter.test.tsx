import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfidenceMeter, bandFor } from './ConfidenceMeter'

const LABELS = { high: 'High', review: 'Review', confirm: 'Confirm' }

describe('ConfidenceMeter', () => {
  it('bands at the 95 / 88 thresholds', () => {
    expect(bandFor(96)).toBe('high')
    expect(bandFor(95)).toBe('high')
    expect(bandFor(94)).toBe('review')
    expect(bandFor(88)).toBe('review')
    expect(bandFor(87)).toBe('confirm')
  })

  it('shows the band label + value, no confirm CTA above the low band', () => {
    render(<ConfidenceMeter confidence={91} labels={LABELS} onConfirm={vi.fn()} confirmLabel="Confirm it" />)
    expect(screen.getByText('Review')).toBeInTheDocument()
    expect(screen.getByText('91%')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('demands a tap-to-confirm in the low band', async () => {
    const onConfirm = vi.fn()
    render(<ConfidenceMeter confidence={70} labels={LABELS} onConfirm={onConfirm} confirmLabel="Confirm it" />)
    const btn = screen.getByRole('button', { name: 'Confirm it' })
    await userEvent.click(btn)
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
