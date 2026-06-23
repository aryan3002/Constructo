import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageProvider } from '../i18n'
import { ThemeModeProvider } from './ThemeModeProvider'
import { ThemeControl } from './ThemeControl'

function setup() {
  return render(
    <LanguageProvider>
      <ThemeModeProvider>
        <ThemeControl />
      </ThemeModeProvider>
    </LanguageProvider>,
  )
}

describe('ThemeControl', () => {
  it('opens a Light/Dark/System menu and applies a choice', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /appearance/i }))
    const menu = screen.getByRole('menu')
    for (const label of ['Light', 'Dark', 'System']) {
      expect(screen.getByRole('menuitemradio', { name: label })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toMatch(/dark/)
    void menu
  })
})
