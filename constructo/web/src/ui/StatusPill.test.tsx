import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusDot, StatusPill, severityToStatus } from './StatusPill'

describe('StatusPill', () => {
  it('renders the default label and an icon (color is never alone)', () => {
    render(<StatusPill status="risk" />)
    const pill = screen.getByRole('status')
    expect(pill).toHaveAttribute('data-status', 'risk')
    expect(pill).toHaveTextContent('At risk')
    // The paired icon shape carries a <title> for non-color identification.
    expect(pill.querySelector('svg title')?.textContent).toBe('At risk')
  })

  it('accepts a custom label', () => {
    render(<StatusPill status="ok" label="Delivered" />)
    expect(screen.getByRole('status')).toHaveTextContent('Delivered')
  })

  it('StatusDot exposes an accessible label', () => {
    render(<StatusDot status="warn" />)
    const dot = screen.getByRole('img', { name: 'Needs attention' })
    expect(dot).toHaveAttribute('data-status', 'warn')
  })

  // Fix 2 — distinct 5th tone
  it('Fix 2: "done" tone exists and renders with data-status="done"', () => {
    render(<StatusPill status="done" label="Released" />)
    const pill = screen.getByRole('status')
    expect(pill).toHaveAttribute('data-status', 'done')
    expect(pill).toHaveTextContent('Released')
  })

  it('Fix 2: "done" pill has a different chip class than "ok" pill', () => {
    const { rerender } = render(<StatusPill status="ok" label="Approved" />)
    const okPill = screen.getByRole('status')
    const okClass = okPill.className

    rerender(<StatusPill status="done" label="Released" />)
    const donePill = screen.getByRole('status')
    // Different chip appearance — classes must differ
    expect(donePill.className).not.toBe(okClass)
  })
})

describe('severityToStatus', () => {
  it('maps backend severities onto the status spine', () => {
    expect(severityToStatus('high')).toBe('risk')
    expect(severityToStatus('med')).toBe('warn')
    expect(severityToStatus('low')).toBe('info')
    expect(severityToStatus('???')).toBe('info')
  })
})
