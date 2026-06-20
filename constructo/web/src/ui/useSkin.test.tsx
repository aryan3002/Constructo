import { render, screen } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { ThemeModeProvider, useSkin } from './ThemeModeProvider'

function ShowSkin() {
  return <span data-testid="skin">{useSkin()}</span>
}

afterEach(() => {
  localStorage.clear()
})

describe('useSkin', () => {
  it('returns "blueprint" when rendered with no provider', () => {
    render(<ShowSkin />)
    expect(screen.getByTestId('skin').textContent).toBe('blueprint')
  })

  it('returns the provider skin (neev) when one is active', () => {
    localStorage.setItem('cstk.skin', 'neev')
    render(
      <ThemeModeProvider>
        <ShowSkin />
      </ThemeModeProvider>,
    )
    expect(screen.getByTestId('skin').textContent).toBe('neev')
  })
})
