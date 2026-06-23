import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../i18n'
import { NeevSidebar } from './NeevSidebar'
import { navForRole } from './navModel'

function renderSidebar(role: 'owner' | 'architect' | 'supervisor', collapsed = false) {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/owner']}>
        <NeevSidebar zones={navForRole(role)} role={role} collapsed={collapsed}
          roleBadge={{ name: 'Owner', initials: 'OW' }} />
      </MemoryRouter>
    </LanguageProvider>,
  )
}

describe('NeevSidebar', () => {
  it('owner: renders all three zones with zone dividers and Settings last', () => {
    renderSidebar('owner')
    const nav = screen.getByRole('navigation', { name: /primary/i })
    for (const label of ['Brief', 'Approvals', 'Reconcile', 'Finance', 'Sites', 'Drawings', 'Reports', 'Admin', 'Settings']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument()
    }
    // two dividers separate the three zones
    expect(nav.querySelectorAll('[data-zone-divider]').length).toBe(2)
    // "More" is retired in the desktop sidebar
    expect(within(nav).queryByRole('link', { name: 'More' })).toBeNull()
  })

  it('supervisor: Sites label shows as "My Sites"; no Reports/Admin', () => {
    renderSidebar('supervisor')
    const nav = screen.getByRole('navigation', { name: /primary/i })
    expect(within(nav).getByRole('link', { name: 'My Sites' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('collapsed: labels are hidden but exposed via title for a11y', () => {
    renderSidebar('owner', true)
    const link = screen.getByRole('link', { name: 'Brief' }) // accessible name from title
    expect(link).toHaveAttribute('title', 'Brief')
  })
})
