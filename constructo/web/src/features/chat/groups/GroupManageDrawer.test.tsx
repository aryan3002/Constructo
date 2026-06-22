/**
 * GroupManageDrawer — unit tests (web Phase C). C5 covers the member-level view:
 * roster render + Leave + the last-admin 409 guard surfaced as a toast.
 * (Admin controls are covered in the C6 additions.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactElement } from 'react'
import { ToastProvider } from '../../../ui/Toast'
import { ApiError } from '../../../api/client'

vi.mock('../../../auth/useCan', () => ({ useMe: vi.fn(), useMeRole: vi.fn() }))
vi.mock('../../../api/groups', async (io) => {
  const o = await io<typeof import('../../../api/groups')>()
  return {
    ...o,
    groupsApi: {
      ...o.groupsApi,
      members: vi.fn(),
      removeMember: vi.fn(),
      addMembers: vi.fn(),
      addableUsers: vi.fn().mockResolvedValue([]),
      patch: vi.fn(),
    },
  }
})

import { useMe } from '../../../auth/useCan'
import { groupsApi } from '../../../api/groups'
import { GroupManageDrawer } from './GroupManageDrawer'

const mockMembers = groupsApi.members as ReturnType<typeof vi.fn>
const mockRemove = groupsApi.removeMember as ReturnType<typeof vi.fn>

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
})

describe('GroupManageDrawer — member view', () => {
  it('shows the roster and a Leave action', async () => {
    mockMembers.mockResolvedValue({
      members: [
        { user_id: 'me', name: 'Owner', role: 'admin', is_homeowner: false },
        { user_id: 'u2', name: 'Asha', role: 'member', is_homeowner: false },
      ],
    })
    vi.mocked(useMe).mockReturnValue({ data: { id: 'me' } } as never)
    renderWithProviders(<GroupManageDrawer open onClose={() => {}} groupId="g1" groupTitle="Crew" />)
    expect(await screen.findByText('Asha')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /leave group/i })).toBeInTheDocument()
  })

  it('toasts the last-admin guard on a 409 leave', async () => {
    mockMembers.mockResolvedValue({
      members: [{ user_id: 'me', name: 'Owner', role: 'admin', is_homeowner: false }],
    })
    mockRemove.mockRejectedValue(new ApiError(409, 'last_admin'))
    vi.mocked(useMe).mockReturnValue({ data: { id: 'me' } } as never)
    renderWithProviders(<GroupManageDrawer open onClose={() => {}} groupId="g1" groupTitle="Crew" />)
    fireEvent.click(await screen.findByRole('button', { name: /leave group/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^leave$/i })) // confirm
    expect(await screen.findByText(/at least one admin/i)).toBeInTheDocument()
  })
})
