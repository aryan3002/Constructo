/**
 * NewGroupModal — unit tests (web Phase C). Mocks groupsApi; wraps in Query +
 * Toast providers. Verifies the create payload shape + the name gate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactElement } from 'react'
import { ToastProvider } from '../../../ui/Toast'

vi.mock('../../../api/groups', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/groups')>()
  return {
    ...original,
    groupsApi: { ...original.groupsApi, addableUsers: vi.fn(), create: vi.fn() },
  }
})

import { groupsApi } from '../../../api/groups'
import { NewGroupModal } from './NewGroupModal'

const mockAddable = groupsApi.addableUsers as ReturnType<typeof vi.fn>
const mockCreate = groupsApi.create as ReturnType<typeof vi.fn>

function renderWithProviders(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAddable.mockResolvedValue([])
})

describe('NewGroupModal', () => {
  it('submits the create payload and calls onCreated', async () => {
    mockAddable.mockResolvedValue([
      { user_id: 'u1', name: 'Asha', role: 'supervisor', already_member: false },
    ])
    const created = { id: 'g9', name: 'Phase 2 crew', site_id: null, archived: false, members: [] }
    mockCreate.mockResolvedValue(created)
    const onCreated = vi.fn()

    renderWithProviders(
      <NewGroupModal
        open
        onClose={() => {}}
        onCreated={onCreated}
        sites={[{ id: 's1', name: 'Bandra Villa' }]}
      />,
    )

    fireEvent.change(await screen.findByLabelText(/group name/i), {
      target: { value: 'Phase 2 crew' },
    })
    fireEvent.click(await screen.findByLabelText(/Asha/))
    fireEvent.click(screen.getByRole('button', { name: /create group/i }))

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        name: 'Phase 2 crew',
        site_id: null,
        member_user_ids: ['u1'],
      }),
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
  })

  it('disables create until a name is entered', () => {
    renderWithProviders(<NewGroupModal open onClose={() => {}} onCreated={() => {}} sites={[]} />)
    expect(screen.getByRole('button', { name: /create group/i })).toBeDisabled()
  })
})
