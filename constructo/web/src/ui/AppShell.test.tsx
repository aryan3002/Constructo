import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell, ROLE_TABS } from './AppShell'

// AppShell now sources the live unread bell via React Query, so a client is
// required even when the header (and its poll) is disabled.
function renderShell(props: Partial<React.ComponentProps<typeof AppShell>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AppShell role="owner" {...props}>
          <p>page content</p>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
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

  it('defines a tab set for every backend role with a sensible primary lane', () => {
    const primaryHome: Record<string, string> = {
      owner: '/',
      pm: '/',
      supervisor: '/supervisor/capture',
      accountant: '/reconcile',
      procurement: '/reconcile',
      labor_contractor: '/mukadam/attendance',
    }
    for (const [role, home] of Object.entries(primaryHome)) {
      const tabs = ROLE_TABS[role as keyof typeof ROLE_TABS]
      expect(tabs.length).toBeGreaterThanOrEqual(2)
      // The index (end) tab is the role's home.
      const indexTab = tabs.find((t) => t.end)
      expect(indexTab?.to).toBe(home)
      // Every role can always reach the "More" hub.
      expect(tabs.some((t) => t.to === '/more')).toBe(true)
    }
  })
})
