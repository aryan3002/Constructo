import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach } from 'vitest'
import { AppShell } from './AppShell'
import { ThemeModeProvider } from './ThemeModeProvider'

function renderShell(skin: 'blueprint' | 'neev') {
  if (skin === 'neev') localStorage.setItem('cstk.skin', 'neev')
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ThemeModeProvider>
        <MemoryRouter>
          <AppShell
            role="owner"
            sites={[{ id: 's1', name: 'Sharma Residence', status: 'ok' }]}
            selectedSiteId={null}
            onSelectSite={() => {}}
            roleBadge={{ name: 'Owner', initials: 'RK' }}
          >
            <div>content</div>
          </AppShell>
        </MemoryRouter>
      </ThemeModeProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('AppShell — Neev (owner) chrome', () => {
  it('renders the Neev Command Center sidebar + topbar for the neev skin', () => {
    renderShell('neev')
    // Sidebar brand block
    expect(screen.getByText('Command Center')).toBeInTheDocument()
    // Topbar scope button
    expect(screen.getByText('Viewing')).toBeInTheDocument()
    // Same owner nav routes, restyled
    const links = screen.getAllByRole('link')
    expect(links.some((a) => a.getAttribute('href') === '/approvals')).toBe(true)
    // Profile card uses the role badge
    expect(screen.getByText('Profile & settings')).toBeInTheDocument()
  })

  it('renders the Blueprint shell (no Neev chrome) by default', () => {
    renderShell('blueprint')
    expect(screen.queryByText('Command Center')).not.toBeInTheDocument()
    expect(screen.queryByText('Viewing')).not.toBeInTheDocument()
  })
})
