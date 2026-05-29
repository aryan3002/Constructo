import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppShell, ROLE_TABS } from './AppShell'

function renderShell(props: Partial<React.ComponentProps<typeof AppShell>> = {}) {
  return render(
    <MemoryRouter>
      <AppShell role="owner" {...props}>
        <p>page content</p>
      </AppShell>
    </MemoryRouter>,
  )
}

describe('AppShell', () => {
  it('renders the routed children', () => {
    renderShell()
    expect(screen.getByText('page content')).toBeInTheDocument()
  })

  it('renders the owner role tab bar', () => {
    renderShell()
    const nav = screen.getByRole('navigation', { name: /primary/i })
    for (const tab of ROLE_TABS.owner) {
      expect(within(nav).getByRole('link', { name: tab.label })).toBeInTheDocument()
    }
  })

  it('renders a different tab set per role', () => {
    renderShell({ role: 'contractor' })
    const nav = screen.getByRole('navigation', { name: /primary/i })
    expect(within(nav).getByRole('link', { name: 'Today' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Approvals' })).not.toBeInTheDocument()
  })

  it('renders the SiteSwitcher header when sites + handler are provided', () => {
    renderShell({
      sites: [{ id: 's1', name: 'Green Valley', status: 'risk' }],
      selectedSiteId: 's1',
      onSelectSite: () => {},
    })
    expect(screen.getByRole('button', { name: /Green Valley/ })).toBeInTheDocument()
  })

  it('omits the header when no site context is given', () => {
    renderShell()
    expect(screen.queryByRole('button', { name: /All Sites/ })).not.toBeInTheDocument()
  })
})
