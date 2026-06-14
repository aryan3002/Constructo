/**
 * Modal + ConfirmDialog tests.
 *
 * Modal shares the useDialog hook with Drawer so most a11y surface tests are
 * the same. ConfirmDialog tests focus on the action wiring and variant styling.
 */

import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal, ConfirmDialog } from './Modal'

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

describe('Modal — rendering', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="T">
        <p>body</p>
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders dialog, title, body when open', () => {
    render(
      <Modal open onClose={vi.fn()} title="Add Material">
        <p>modal body</p>
      </Modal>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add Material' })).toBeInTheDocument()
    expect(screen.getByText('modal body')).toBeInTheDocument()
  })

  it('has role="dialog", aria-modal="true", aria-labelledby pointing at title', () => {
    render(<Modal open onClose={vi.fn()} title="Confirm Delete"><p>x</p></Modal>)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const titleId = dialog.getAttribute('aria-labelledby')!
    expect(document.getElementById(titleId)).toHaveTextContent('Confirm Delete')
  })

  it('renders footer when provided', () => {
    render(
      <Modal open onClose={vi.fn()} title="T" footer={<button type="button">Save</button>}>
        <p>x</p>
      </Modal>,
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })
})

describe('Modal — close triggers', () => {
  it('calls onClose when Esc is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="T"><p>x</p></Modal>)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="T"><p>x</p></Modal>)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when overlay is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="T"><p>x</p></Modal>)
    const scrim = document.body.querySelector<HTMLElement>(
      'div[aria-hidden="true"].fixed.inset-0',
    )!
    expect(scrim).toBeInTheDocument()
    await user.click(scrim)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// ConfirmDialog
// ---------------------------------------------------------------------------

describe('ConfirmDialog', () => {
  it('renders title and message', () => {
    render(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete project?"
        message="This action cannot be undone."
      />,
    )
    expect(screen.getByRole('heading', { name: 'Delete project?' })).toBeInTheDocument()
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument()
  })

  it('calls onConfirm when Confirm button is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        onConfirm={onConfirm}
        title="T"
        message="m"
        confirmLabel="Yes, delete"
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={vi.fn()}
        title="T"
        message="m"
        cancelLabel="Go back"
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Go back' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Esc is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ConfirmDialog open onClose={onClose} onConfirm={vi.fn()} title="T" message="m" />,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('variant="danger" renders the confirm button with danger styling', () => {
    render(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="T"
        message="m"
        variant="danger"
        confirmLabel="Delete"
      />,
    )
    const confirmBtn = screen.getByRole('button', { name: 'Delete' })
    // The danger variant Button gets `bg-risk` (from Button.tsx variant map).
    expect(confirmBtn).toHaveClass('bg-risk')
    // data-variant attribute is also a reliable assertion.
    expect(confirmBtn).toHaveAttribute('data-variant', 'danger')
  })

  it('variant="primary" renders the confirm button with primary styling', () => {
    render(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="T"
        message="m"
        variant="primary"
        confirmLabel="Submit"
      />,
    )
    const confirmBtn = screen.getByRole('button', { name: 'Submit' })
    expect(confirmBtn).toHaveClass('bg-primary')
  })

  it('busy=true disables the confirm button', () => {
    render(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="T"
        message="m"
        busy
        confirmLabel="Submit"
      />,
    )
    const confirmBtn = screen.getByRole('button', { name: 'Submit' })
    expect(confirmBtn).toBeDisabled()
    expect(confirmBtn).toHaveAttribute('aria-busy', 'true')
  })
})

// ---------------------------------------------------------------------------
// Fix 6b — return-focus
// ---------------------------------------------------------------------------

describe('Modal — return-focus on close', () => {
  it('returns focus to the original opener button when the modal is closed', async () => {
    const user = userEvent.setup()

    function Wrapper() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" id="opener" onClick={() => setOpen(true)}>
            Open modal
          </button>
          <Modal open={open} onClose={() => setOpen(false)} title="Return focus test">
            <p>Modal body</p>
          </Modal>
        </>
      )
    }

    render(<Wrapper />)

    const opener = screen.getByRole('button', { name: 'Open modal' })
    await user.click(opener)

    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Close via Esc.
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Wait for the setTimeout(0) inside useDialog to resolve.
    await new Promise((r) => setTimeout(r, 10))
    expect(document.activeElement).toBe(opener)
  })
})

// ---------------------------------------------------------------------------
// Fix 1 — stacked-dialog Esc closes only the topmost
// ---------------------------------------------------------------------------

describe('useDialog — stacked-dialog Esc', () => {
  it('pressing Esc once closes only the topmost dialog; the lower one stays open', async () => {
    const user = userEvent.setup()

    const onCloseBottom = vi.fn()
    const onCloseTop = vi.fn()

    /**
     * Renders two stacked dialogs: a "drawer" (bottom) and a "confirm" (top).
     * Both are simultaneously open so two useDialog instances are active.
     */
    function StackedDialogs() {
      const [drawerOpen, setDrawerOpen] = useState(true)
      const [confirmOpen, setConfirmOpen] = useState(true)

      return (
        <>
          <Modal
            open={drawerOpen}
            onClose={() => { onCloseBottom(); setDrawerOpen(false) }}
            title="Bottom dialog"
          >
            <p>Lower layer</p>
          </Modal>
          <Modal
            open={confirmOpen}
            onClose={() => { onCloseTop(); setConfirmOpen(false) }}
            title="Top dialog"
          >
            <p>Upper layer</p>
          </Modal>
        </>
      )
    }

    render(<StackedDialogs />)

    // Both dialogs should be in the DOM.
    expect(screen.getByRole('heading', { name: 'Bottom dialog' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Top dialog' })).toBeInTheDocument()

    // One Esc — only the top dialog's onClose should fire.
    await user.keyboard('{Escape}')

    expect(onCloseTop).toHaveBeenCalledTimes(1)
    expect(onCloseBottom).toHaveBeenCalledTimes(0)
  })
})

// ---------------------------------------------------------------------------
// Fix 2 — stale onClose / return-focus stability
// ---------------------------------------------------------------------------

describe('useDialog — stale onClose return-focus', () => {
  it('returns focus to the original opener even if onClose identity changed while open', async () => {
    const user = userEvent.setup()

    /**
     * The parent re-renders with a new inline onClose every time `count`
     * changes, while the modal is still open.
     */
    function Wrapper() {
      const [open, setOpen] = useState(false)
      const [count, setCount] = useState(0)

      // A fresh arrow function on every render — the typical "stale" scenario.
      const handleClose = () => setOpen(false)

      return (
        <>
          <button type="button" id="opener" onClick={() => setOpen(true)}>
            Open
          </button>
          {/* Trigger a parent re-render while the modal is open */}
          <button
            type="button"
            id="bump"
            onClick={() => setCount((c) => c + 1)}
          >
            Bump ({count})
          </button>
          <Modal open={open} onClose={handleClose} title="Stale test">
            <p>content</p>
          </Modal>
        </>
      )
    }

    render(<Wrapper />)

    const opener = screen.getByRole('button', { name: 'Open' })
    await user.click(opener)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Force a re-render with a new inline onClose while the modal is open.
    await user.click(screen.getByRole('button', { name: /Bump/ }))
    await user.click(screen.getByRole('button', { name: /Bump/ }))

    // Close via Esc — this should call the *current* onClose correctly.
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Focus must return to the original opener, not an element inside the panel.
    await new Promise((r) => setTimeout(r, 10))
    expect(document.activeElement).toBe(opener)
  })
})
