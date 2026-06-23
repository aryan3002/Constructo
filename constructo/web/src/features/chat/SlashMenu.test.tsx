/**
 * SlashMenu — unit tests (web Phase B). Presentational listbox; the composer
 * owns the keyboard/active state, so these tests cover rendering + mouse + a11y.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SlashMenu } from './SlashMenu'
import { SLASH_MENU } from './slash'

describe('SlashMenu', () => {
  it('renders one option per item with listbox a11y', () => {
    render(<SlashMenu items={SLASH_MENU} activeIndex={0} onHoverIndex={() => {}} onSelect={() => {}} />)
    expect(screen.getByRole('listbox', { name: /slash commands/i })).toBeInTheDocument()
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(4)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(options[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('renders nothing when there are no items', () => {
    const { container } = render(
      <SlashMenu items={[]} activeIndex={0} onHoverIndex={() => {}} onSelect={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('calls onSelect with the clicked item', () => {
    const onSelect = vi.fn()
    render(<SlashMenu items={SLASH_MENU} activeIndex={0} onHoverIndex={() => {}} onSelect={onSelect} />)
    fireEvent.click(screen.getAllByRole('option')[1])
    expect(onSelect).toHaveBeenCalledWith(SLASH_MENU[1])
  })

  it('reports hover so the composer can move the active index', () => {
    const onHoverIndex = vi.fn()
    render(<SlashMenu items={SLASH_MENU} activeIndex={0} onHoverIndex={onHoverIndex} onSelect={() => {}} />)
    fireEvent.mouseEnter(screen.getAllByRole('option')[2])
    expect(onHoverIndex).toHaveBeenCalledWith(2)
  })
})
