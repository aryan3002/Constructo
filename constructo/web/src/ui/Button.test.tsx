import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

describe('Button', () => {
  it('renders a button with the amber primary variant by default', () => {
    render(<Button>Approve</Button>)
    const btn = screen.getByRole('button', { name: 'Approve' })
    expect(btn).toHaveClass('bg-primary')
    // >=48px tap target floor
    expect(btn).toHaveClass('min-h-tap')
  })

  it('applies secondary and ghost variant classes', () => {
    const { rerender } = render(<Button variant="secondary">x</Button>)
    expect(screen.getByRole('button')).toHaveClass('border-line')
    rerender(<Button variant="ghost">x</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-transparent')
  })

  it('fires onClick when enabled', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Go</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('defaults to type="button" (not a form submitter)', () => {
    render(<Button>x</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('block stretches full width', () => {
    render(<Button block>x</Button>)
    expect(screen.getByRole('button')).toHaveClass('w-full')
  })
})
