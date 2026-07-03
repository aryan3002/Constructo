import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { type ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../i18n'

vi.mock('../api/hooks', () => ({
  useSites: () => ({ data: { items: [], next_cursor: null }, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}))
vi.mock('../auth/useCan', () => ({ useMeRole: () => 'owner' }))

import { Sites } from './Sites'

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

describe('Sites header — New project', () => {
  it('renders a New project button that opens the modal', async () => {
    renderWithProviders(<Sites />)
    fireEvent.click(screen.getByRole('button', { name: /new project/i }))
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /new project/i })).toBeInTheDocument(),
    )
  })
})
