import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusDot, StatusPill, severityToStatus, siteStatusToStatus, type Status } from './StatusPill'

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

describe('StatusDot / StatusPill are crash-proof on an unknown status', () => {
  // Regression: a raw backend site status ("active") is not a canonical Status.
  // The site switcher rendered <StatusDot status={site.status}/> and blanked the
  // whole page (STATUS_META["active"] was undefined → undefined.label threw).
  it('StatusDot renders a fallback dot for an unknown status instead of throwing', () => {
    render(<StatusDot status={'active' as unknown as Status} />)
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('StatusPill renders a fallback for an unknown status instead of throwing', () => {
    render(<StatusPill status={'active' as unknown as Status} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

describe('siteStatusToStatus', () => {
  it('maps backend site lifecycle statuses onto the canonical spine', () => {
    expect(siteStatusToStatus('active')).toBe('ok')
    expect(siteStatusToStatus('building')).toBe('ok')
    expect(siteStatusToStatus('completed')).toBe('done')
    expect(siteStatusToStatus('on_hold')).toBe('warn')
    expect(siteStatusToStatus('planning')).toBe('info')
    expect(siteStatusToStatus(null)).toBe('info')
    expect(siteStatusToStatus(undefined)).toBe('info')
  })

  it('passes an already-canonical status through unchanged', () => {
    expect(siteStatusToStatus('warn')).toBe('warn')
    expect(siteStatusToStatus('done')).toBe('done')
  })
})
