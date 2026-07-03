import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactElement } from 'react'
import { LanguageProvider } from '../../i18n'

vi.mock('../../api/sites', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/sites')>()
  return { ...original, sitesApi: { ...original.sitesApi, create: vi.fn() } }
})

import { sitesApi } from '../../api/sites'
import { qk } from '../../api/queryKeys'
import { NewProjectModal } from './NewProjectModal'

const mockCreate = sitesApi.create as ReturnType<typeof vi.fn>

const SITE = {
  id: 's9', company_id: 'co', name: 'Tower B', location: '', type: 'residential',
  status: 'active', created_at: '2026-07-03T00:00:00Z',
}

function renderWithProviders(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">{ui}</LanguageProvider>
    </QueryClientProvider>,
  )
  return { ...utils, invalidateSpy }
}

beforeEach(() => vi.clearAllMocks())

describe('NewProjectModal', () => {
  it('disables submit until a name is entered', () => {
    renderWithProviders(<NewProjectModal open onClose={() => {}} />)
    expect(screen.getByRole('button', { name: /create project/i })).toBeDisabled()
  })

  it('creates, invalidates sites + activity + activitySummary, calls onCreated, and closes', async () => {
    mockCreate.mockResolvedValue(SITE)
    const onClose = vi.fn()
    const onCreated = vi.fn()
    const { invalidateSpy } = renderWithProviders(
      <NewProjectModal open onClose={onClose} onCreated={onCreated} />,
    )

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: 'Tower B' } })
    fireEvent.change(screen.getByLabelText(/project type/i), { target: { value: 'villa' } })
    fireEvent.change(screen.getByLabelText(/location/i), { target: { value: 'Bandra' } })
    fireEvent.click(screen.getByRole('button', { name: /create project/i }))

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({ name: 'Tower B', type: 'villa', location: 'Bandra' }),
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(SITE))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: qk.sites() })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: qk.activity() })
    // Controller decision D3#2: qk.activity() does NOT partial-match
    // qk.activitySummary() in RQv5 (['activity', null] vs ['activity','summary']),
    // so the summary key must be invalidated explicitly too.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: qk.activitySummary() })
    expect(onClose).toHaveBeenCalled()
  })

  it('on error keeps the modal open and preserves the typed name', async () => {
    mockCreate.mockRejectedValue(new Error('boom'))
    const onClose = vi.fn()
    renderWithProviders(<NewProjectModal open onClose={onClose} />)

    const nameInput = screen.getByLabelText(/project name/i) as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Kept Name' } })
    fireEvent.click(screen.getByRole('button', { name: /create project/i }))

    await screen.findByRole('alert')
    expect(onClose).not.toHaveBeenCalled()
    expect(nameInput.value).toBe('Kept Name')
  })

  it('defaults the type select to residential', () => {
    renderWithProviders(<NewProjectModal open onClose={() => {}} />)
    expect((screen.getByLabelText(/project type/i) as HTMLSelectElement).value).toBe('residential')
  })
})
