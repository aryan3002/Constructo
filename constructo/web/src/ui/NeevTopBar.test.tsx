import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../i18n'
import { ThemeModeProvider } from './ThemeModeProvider'
import { NeevTopBar } from './NeevTopBar'
import { useUiStore } from '../store/ui'

function setup() {
  return render(
    <LanguageProvider>
      <ThemeModeProvider>
        <MemoryRouter>
          <NeevTopBar sites={[]} selectedSiteId={null} onSelectSite={() => {}}
            roleBadge={{ name: 'Owner', initials: 'OW' }} />
        </MemoryRouter>
      </ThemeModeProvider>
    </LanguageProvider>,
  )
}

describe('NeevTopBar command-center controls', () => {
  beforeEach(() => useUiStore.setState({ sidebarCollapsed: false }))

  it('collapse toggle flips the sidebar store flag', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }))
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
  })

  it('renders the theme control and the avatar menu trigger', () => {
    setup()
    expect(screen.getByRole('button', { name: /appearance/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /owner/i })).toBeInTheDocument()
  })
})
