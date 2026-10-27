// /reconcile keeps the visitor's own nav: an owner opening it sees the owner
// tabs (not the accountant's), and the tabs point at real routes so the active
// one highlights.
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../i18n'

vi.mock('../../api/hooks', () => ({
  useSites: () => ({ data: { items: [] }, isLoading: false, isError: false }),
}))
vi.mock('../../api/reconcile', async () => {
  const actual = await vi.importActual<typeof import('../../api/reconcile')>('../../api/reconcile')
  return {
    ...actual,
    reconcileApi: new Proxy({}, { get: () => () => new Promise(() => {}) }),
  }
})

const { ReconcilePage } = await import('./ReconcilePage')
const { ROLE_TABS } = await import('../../ui/AppShell')

function renderAs(role: string, path = '/reconcile') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['me'], { id: 'u1', role })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <MemoryRouter initialEntries={[path]}>
          <ReconcilePage />
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

describe('/reconcile nav', () => {
  it("an owner keeps the owner's tabs", () => {
    renderAs('owner')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: /latest/i })).toHaveAttribute('href', '/owner')
    expect(within(nav).queryByRole('link', { name: /bills/i })).toBeNull()
  })

  it('an accountant sees Reconcile highlighted', () => {
    renderAs('accountant')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: /reconcile/i })).toHaveAttribute('aria-current', 'page')
  })
})

describe('tab targets', () => {
  it('every tab links a real route (no redirect-only paths that never highlight)', () => {
    const all = Object.values(ROLE_TABS).flat().map((t) => t.to)
    expect(all).not.toContain('/')
    expect(all).not.toContain('/spec-desk')
  })
})
