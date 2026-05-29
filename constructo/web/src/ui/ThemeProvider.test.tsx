import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, ThemeSurface, useTheme } from './ThemeProvider'

function Probe() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button onClick={toggleTheme} data-testid="probe">
      {theme}
    </button>
  )
}

describe('ThemeProvider', () => {
  it('defaults to the site theme and exposes it via context', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('probe')).toHaveTextContent('site')
  })

  it('applies the data-theme attribute and cstk-root class on its wrapper', () => {
    const { container } = render(
      <ThemeProvider defaultTheme="daylight">
        <span>hi</span>
      </ThemeProvider>,
    )
    const root = container.querySelector('[data-theme]')
    expect(root).toHaveAttribute('data-theme', 'daylight')
    expect(root).toHaveClass('cstk-root')
  })

  it('toggles between site and daylight', async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    const btn = screen.getByTestId('probe')
    expect(btn).toHaveTextContent('site')
    await userEvent.click(btn)
    expect(btn).toHaveTextContent('daylight')
  })

  it('ThemeSurface fixes a theme without owning state', () => {
    const { container } = render(
      <ThemeSurface theme="daylight">
        <span>x</span>
      </ThemeSurface>,
    )
    expect(container.querySelector('[data-theme]')).toHaveAttribute(
      'data-theme',
      'daylight',
    )
  })
})
