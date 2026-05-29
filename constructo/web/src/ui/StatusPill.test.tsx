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
})

describe('severityToStatus', () => {
  it('maps backend severities onto the status spine', () => {
    expect(severityToStatus('high')).toBe('risk')
    expect(severityToStatus('med')).toBe('warn')
    expect(severityToStatus('low')).toBe('info')
    expect(severityToStatus('???')).toBe('info')
  })
})
