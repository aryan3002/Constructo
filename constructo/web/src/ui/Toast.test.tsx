/**
 * Toast tests — show, auto-dismiss, manual dismiss, aria-live.
 *
 * Fake timers: vi.useFakeTimers() + userEvent.setup({ delay: null }) so that
 * userEvent doesn't wait for real clock ticks while fake timers are active.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from './Toast'

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

interface TriggerProps {
  status?: 'ok' | 'warn' | 'risk' | 'info'
  message?: string
  ttlMs?: number
}

function ToastTrigger({ status = 'ok', message = 'Test toast', ttlMs }: TriggerProps) {
  const { show } = useToast()
  return (
    <button
      type="button"
      onClick={() => show({ status, message, ...(ttlMs !== undefined ? { ttlMs } : {}) })}
    >
      Show toast
    </button>
  )
}

function renderWithProvider(props: TriggerProps = {}) {
  return render(
    <ToastProvider>
      <ToastTrigger {...props} />
    </ToastProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fix 3 — persistent live-region (must exist BEFORE any toast is shown)
// ---------------------------------------------------------------------------

describe('Toast — persistent live-region', () => {
  it('renders the aria-live="polite" container even when no toasts are visible', () => {
    // Nothing has been shown yet — the provider just mounted.
    renderWithProvider()

    // The live region must already be in the DOM so assistive technologies
    // have registered it before content is inserted.
    const liveRegion = document.querySelector('[aria-live="polite"]')
    expect(liveRegion).toBeInTheDocument()
    // No toasts yet — the region should be empty.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('the persistent live-region contains toast cards after show() is called', async () => {
    const user = userEvent.setup()
    renderWithProvider({ message: 'Live region test', ttlMs: 60_000 })

    const liveRegion = document.querySelector('[aria-live="polite"]')!
    expect(liveRegion).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show toast' }))

    // The toast card should now be inside the persistent live region.
    expect(liveRegion.contains(screen.getByRole('status'))).toBe(true)
  })
})

describe('Toast — appearance', () => {
  it('shows the toast message after calling show()', async () => {
    const user = userEvent.setup()
    renderWithProvider({ status: 'ok', message: 'Saved successfully' })

    await user.click(screen.getByRole('button', { name: 'Show toast' }))

    expect(screen.getByText('Saved successfully')).toBeInTheDocument()
    // role="status" is present on the toast card.
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders with the correct role="status" and aria-live for screen readers', async () => {
    const user = userEvent.setup()
    renderWithProvider({ message: 'Upload complete', ttlMs: 60_000 })

    await user.click(screen.getByRole('button', { name: 'Show toast' }))

    const toast = screen.getByRole('status')
    expect(toast).toHaveAttribute('aria-live', 'polite')
    expect(toast).toHaveAttribute('aria-atomic', 'true')
  })
})

describe('Toast — auto-dismiss', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('removes the toast after ttlMs elapses', () => {
    // Use fireEvent (synchronous) so fake timers don't conflict with userEvent.
    renderWithProvider({ message: 'Auto-gone', ttlMs: 3000 })

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Show toast' }))
    })
    expect(screen.getByText('Auto-gone')).toBeInTheDocument()

    // Advance timers past the ttl.
    act(() => vi.advanceTimersByTime(3100))

    expect(screen.queryByText('Auto-gone')).not.toBeInTheDocument()
  })

  it('keeps the toast visible before ttlMs elapses', () => {
    renderWithProvider({ message: 'Still here', ttlMs: 5000 })

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Show toast' }))
    })
    act(() => vi.advanceTimersByTime(2000))

    expect(screen.getByText('Still here')).toBeInTheDocument()
  })
})

describe('Toast — manual dismiss', () => {
  it('removes the toast when the dismiss button is clicked', async () => {
    // Use real timers here — we only test the click, not the timer.
    const user = userEvent.setup()
    renderWithProvider({ message: 'Click to go', ttlMs: 60_000 })

    await user.click(screen.getByRole('button', { name: 'Show toast' }))
    expect(screen.getByText('Click to go')).toBeInTheDocument()

    // Click the × dismiss button inside the toast.
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))

    expect(screen.queryByText('Click to go')).not.toBeInTheDocument()
  })
})

describe('Toast — multiple toasts', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('stacks multiple toasts and caps at 4', () => {
    // Use fireEvent (synchronous) so fake timers don't conflict with userEvent.
    let count = 0
    function MultiTrigger() {
      const { show } = useToast()
      return (
        <button
          type="button"
          onClick={() => show({ status: 'info', message: `Toast ${++count}`, ttlMs: 60_000 })}
        >
          Add
        </button>
      )
    }

    render(
      <ToastProvider>
        <MultiTrigger />
      </ToastProvider>,
    )

    const btn = screen.getByRole('button', { name: 'Add' })

    // Click 5 times — max is 4.
    for (let i = 0; i < 5; i++) {
      act(() => fireEvent.click(btn))
    }

    const allToasts = screen.getAllByRole('status')
    expect(allToasts.length).toBeLessThanOrEqual(4)
  })
})

describe('Toast — context guard', () => {
  it('throws when useToast is called outside <ToastProvider>', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => {
      function Bad() {
        useToast()
        return null
      }
      render(<Bad />)
    }).toThrow('useToast must be used inside <ToastProvider>')
    consoleSpy.mockRestore()
  })
})
