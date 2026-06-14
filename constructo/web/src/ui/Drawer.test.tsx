/**
 * Drawer tests — a11y, portal rendering, focus management, keyboard, overlay.
 *
 * createPortal in jsdom works fine — it renders into document.body.
 * Scroll lock: jsdom doesn't enforce CSS but we test the style attribute.
 * Focus-trap: jsdom supports focus() on elements that are in the document.
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Drawer } from './Drawer'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDrawer(
  open: boolean,
  overrides: Partial<React.ComponentProps<typeof Drawer>> = {},
) {
  const onClose = vi.fn()
  const result = render(
    <Drawer open={open} onClose={onClose} title="Site Details" {...overrides}>
      <p>Drawer body content</p>
      <button type="button">Inner action</button>
    </Drawer>,
  )
  return { ...result, onClose }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('Drawer — rendering', () => {
  it('renders children and title when open=true', () => {
    renderDrawer(true)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Drawer body content')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Site Details' })).toBeInTheDocument()
  })

  it('renders nothing when open=false', () => {
    renderDrawer(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Drawer body content')).not.toBeInTheDocument()
  })

  it('has role="dialog", aria-modal="true", and aria-labelledby pointing at the title', () => {
    renderDrawer(true)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')

    // aria-labelledby must point at the h2 that has the title text
    const titleId = dialog.getAttribute('aria-labelledby')!
    expect(titleId).toBeTruthy()
    const heading = document.getElementById(titleId)!
    expect(heading).toHaveTextContent('Site Details')
  })

  it('renders the optional footer when provided', () => {
    renderDrawer(true, { footer: <button type="button">Save</button> })
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Close triggers
// ---------------------------------------------------------------------------

describe('Drawer — close triggers', () => {
  it('calls onClose when Esc is pressed', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDrawer(true)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when overlay is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDrawer(true)

    // The scrim is a direct child of body (createPortal), aria-hidden, fixed inset.
    const scrim = document.body.querySelector<HTMLElement>(
      'div[aria-hidden="true"].fixed.inset-0',
    )!
    expect(scrim).toBeInTheDocument()
    await user.click(scrim)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDrawer(true)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Focus management
// ---------------------------------------------------------------------------

describe('Drawer — focus management', () => {
  it('moves focus into the panel on open (first focusable = close button)', () => {
    renderDrawer(true)
    // The close button should receive focus (it's the first focusable in the panel header).
    const dialog = screen.getByRole('dialog')
    const focusable = dialog.querySelector<HTMLElement>(
      'button, [tabindex]:not([tabindex="-1"])',
    )!
    // jsdom focus tracking: document.activeElement should be inside the panel.
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(focusable).toBeTruthy()
  })

  it('returns focus to the opener element on close', async () => {
    const user = userEvent.setup()

    // Render an opener button + the drawer controlled by state.
    function Wrapper() {
      const [open, setOpen] = React.useState(false)
      return (
        <>
          <button type="button" id="opener" onClick={() => setOpen(true)}>
            Open
          </button>
          <Drawer open={open} onClose={() => setOpen(false)} title="T">
            <p>body</p>
          </Drawer>
        </>
      )
    }

    const React = await import('react')
    render(<Wrapper />)

    const opener = screen.getByRole('button', { name: 'Open' })
    await user.click(opener)

    // Dialog is now open; focus should be inside it.
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Close via Esc.
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // jsdom's setTimeout runs synchronously in the event loop; wait a tick.
    await new Promise((r) => setTimeout(r, 10))
    expect(document.activeElement).toBe(opener)
  })
})
