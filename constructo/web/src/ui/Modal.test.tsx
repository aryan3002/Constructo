/**
 * Modal + ConfirmDialog tests.
 *
 * Modal shares the useDialog hook with Drawer so most a11y surface tests are
 * the same. ConfirmDialog tests focus on the action wiring and variant styling.
 */

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
