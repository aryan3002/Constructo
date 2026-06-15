/**
 * TabBar — WAI-ARIA tablist primitive tests.
 *
 * Covers:
 *   1. Renders all tabs with correct roles
 *   2. Click changes the active tab (onChange called + aria-selected updated)
 *   3. ArrowRight moves focus + activates the next tab
 *   4. ArrowLeft moves focus + activates the previous tab
 *   5. Home / End jump to first / last tab
 *   6. Roving tabIndex: only active tab has tabIndex=0, others -1
 *   7. aria-selected correct on initial render and after change
 *   8. aria-controls points to correct panel id
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TabBar } from './TabBar'

const TABS = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'beta', label: 'Beta' },
  { id: 'gamma', label: 'Gamma' },
]

function renderBar(active = 'alpha', onChange = vi.fn()) {
  return render(
    <TabBar
      tabs={TABS}
      active={active}
      onChange={onChange}
      ariaLabel="Test tabs"
    />,
  )
}

describe('TabBar', () => {
  it('renders all tabs with role="tab"', () => {
    renderBar()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toHaveTextContent('Alpha')
    expect(tabs[1]).toHaveTextContent('Beta')
    expect(tabs[2]).toHaveTextContent('Gamma')
  })

  it('renders a tablist with the provided aria-label', () => {
    renderBar()
    expect(screen.getByRole('tablist', { name: 'Test tabs' })).toBeInTheDocument()
  })

  it('sets aria-selected=true on the active tab and false on others', () => {
    renderBar('beta')
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false')
  })

  it('sets roving tabIndex: active tab is 0, others are -1', () => {
    renderBar('alpha')
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveAttribute('tabIndex', '0')
    expect(tabs[1]).toHaveAttribute('tabIndex', '-1')
    expect(tabs[2]).toHaveAttribute('tabIndex', '-1')
  })

  it('calls onChange with the tab id when clicking a tab', async () => {
    const onChange = vi.fn()
    renderBar('alpha', onChange)
    await userEvent.click(screen.getByRole('tab', { name: 'Beta' }))
    expect(onChange).toHaveBeenCalledWith('beta')
  })

  it('sets aria-controls to the panel id for each tab', () => {
    renderBar()
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveAttribute('aria-controls', 'panel-alpha')
    expect(tabs[1]).toHaveAttribute('aria-controls', 'panel-beta')
    expect(tabs[2]).toHaveAttribute('aria-controls', 'panel-gamma')
  })

  it('ArrowRight moves focus and activates the next tab', async () => {
    const onChange = vi.fn()
    renderBar('alpha', onChange)

    const alphaTab = screen.getByRole('tab', { name: 'Alpha' })
    alphaTab.focus()

    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('beta')
  })

  it('ArrowLeft moves focus and activates the previous tab', async () => {
    const onChange = vi.fn()
    renderBar('beta', onChange)

    const betaTab = screen.getByRole('tab', { name: 'Beta' })
    betaTab.focus()

    await userEvent.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenCalledWith('alpha')
  })

  it('ArrowRight wraps around from the last tab to the first', async () => {
    const onChange = vi.fn()
    renderBar('gamma', onChange)

    const gammaTab = screen.getByRole('tab', { name: 'Gamma' })
    gammaTab.focus()

    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('alpha')
  })

  it('ArrowLeft wraps around from the first tab to the last', async () => {
    const onChange = vi.fn()
    renderBar('alpha', onChange)

    const alphaTab = screen.getByRole('tab', { name: 'Alpha' })
    alphaTab.focus()

    await userEvent.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenCalledWith('gamma')
  })

  it('Home jumps to the first tab', async () => {
    const onChange = vi.fn()
    renderBar('gamma', onChange)

    const gammaTab = screen.getByRole('tab', { name: 'Gamma' })
    gammaTab.focus()

    await userEvent.keyboard('{Home}')
    expect(onChange).toHaveBeenCalledWith('alpha')
  })

  it('End jumps to the last tab', async () => {
    const onChange = vi.fn()
    renderBar('alpha', onChange)

    const alphaTab = screen.getByRole('tab', { name: 'Alpha' })
    alphaTab.focus()

    await userEvent.keyboard('{End}')
    expect(onChange).toHaveBeenCalledWith('gamma')
  })
})
