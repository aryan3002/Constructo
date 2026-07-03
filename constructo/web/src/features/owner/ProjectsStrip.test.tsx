import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { type ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'
import { ProjectsStrip } from './ProjectsStrip'
import type { Site } from '../../api/types'

const SITES: Site[] = [
  { id: 's1', company_id: 'c', name: 'Tower B', location: 'Bandra', type: 'residential', status: 'active', created_at: '2026-07-01T00:00:00Z' },
  { id: 's2', company_id: 'c', name: 'Villa 12', location: 'Alibaug', type: 'villa', status: 'paused', created_at: '2026-06-01T00:00:00Z' },
]

function renderWithProviders(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <LanguageProvider defaultLanguage="en">{ui}</LanguageProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('ProjectsStrip', () => {
  it('renders a card per site with name + location, each linking to its detail', () => {
    renderWithProviders(<ProjectsStrip sites={SITES} />)
    expect(screen.getByText('Tower B')).toBeInTheDocument()
    expect(screen.getByText('Villa 12')).toBeInTheDocument()
    expect(screen.getByText('Bandra')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Tower B/ })).toHaveAttribute('href', '/sites/s1')
  })

  it('shows a status dot per project (accessible label)', () => {
    renderWithProviders(<ProjectsStrip sites={SITES} />)
    // StatusDot renders role="img" with an aria-label from STATUS_META
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(2)
  })

  it('renders people count only when present on the row', () => {
    // Site has no people_count field yet; widen defensively the same way
    // ProjectsStrip's internal ProjectRow does, so this stays honest under
    // tsc's excess-property check on the sites: Site[] prop.
    const wide: (Site & { people_count?: number })[] = [{ ...SITES[0], people_count: 4 }]
    renderWithProviders(<ProjectsStrip sites={wide} />)
    expect(screen.getByText('4 people')).toBeInTheDocument()
  })

  it('the "+ New project" tile opens NewProjectModal', () => {
    renderWithProviders(<ProjectsStrip sites={SITES} />)
    fireEvent.click(screen.getByRole('button', { name: /new project/i }))
    // Modal title = "New project"; the dialog is now in the tree
    expect(screen.getByRole('dialog', { name: /new project/i })).toBeInTheDocument()
  })

  it('zero sites shows just the "+ New project" tile as the invitation', () => {
    renderWithProviders(<ProjectsStrip sites={[]} />)
    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
