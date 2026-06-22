/**
 * GroupManageDrawer — unit tests (web Phase C). C5 covers the member-level view:
 * roster render + Leave + the last-admin 409 guard surfaced as a toast.
 * (Admin controls are covered in the C6 additions.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
const mockPatch = groupsApi.patch as ReturnType<typeof vi.fn>
const mockAddable = groupsApi.addableUsers as ReturnType<typeof vi.fn>
const mockAddMembers = groupsApi.addMembers as ReturnType<typeof vi.fn>

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

describe('GroupManageDrawer — admin controls', () => {
  it('hides admin controls from a non-admin member', async () => {
    mockMembers.mockResolvedValue({
      members: [
        { user_id: 'me', name: 'Asha', role: 'member', is_homeowner: false },
        { user_id: 'u2', name: 'Owner', role: 'admin', is_homeowner: false },
      ],
    })
    vi.mocked(useMe).mockReturnValue({ data: { id: 'me' } } as never)
    renderWithProviders(<GroupManageDrawer open onClose={() => {}} groupId="g1" groupTitle="Crew" />)
    expect(await screen.findByText('Owner')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /archive group/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull()
    expect(screen.getByRole('button', { name: /leave group/i })).toBeInTheDocument()
  })

  it('renames the group (admin)', async () => {
    mockMembers.mockResolvedValue({
      members: [{ user_id: 'me', name: 'Owner', role: 'admin', is_homeowner: false }],
    })
    mockAddable.mockResolvedValue([])
    mockPatch.mockResolvedValue({ id: 'g1', name: 'Renamed', site_id: null, archived: false, members: [] })
    vi.mocked(useMe).mockReturnValue({ data: { id: 'me' } } as never)
    renderWithProviders(<GroupManageDrawer open onClose={() => {}} groupId="g1" groupTitle="Crew" />)
    fireEvent.change(await screen.findByLabelText(/group name/i), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith('g1', { name: 'Renamed' }))
  })

  it('adds selected members (admin)', async () => {
    mockMembers.mockResolvedValue({
      members: [{ user_id: 'me', name: 'Owner', role: 'admin', is_homeowner: false }],
    })
    mockAddable.mockResolvedValue([
      { user_id: 'u9', name: 'Vikram', role: 'supervisor', already_member: false },
    ])
    mockAddMembers.mockResolvedValue({ id: 'g1', name: 'Crew', site_id: null, archived: false, members: [] })
    vi.mocked(useMe).mockReturnValue({ data: { id: 'me' } } as never)
    renderWithProviders(<GroupManageDrawer open onClose={() => {}} groupId="g1" groupTitle="Crew" />)
    fireEvent.click(await screen.findByLabelText(/Vikram/))
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    await waitFor(() => expect(mockAddMembers).toHaveBeenCalledWith('g1', ['u9']))
  })
})
