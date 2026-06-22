/**
 * NewGroupButton — unit tests (web Phase C). Owner-only entry that opens the
 * create modal. Mocks auth role + the two api modules the button/modal touch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactElement } from 'react'
import { ToastProvider } from '../../../ui/Toast'

vi.mock('../../../auth/useCan', () => ({ useMeRole: vi.fn(), useMe: vi.fn() }))
vi.mock('../../../api/chat', async (io) => {
  const o = await io<typeof import('../../../api/chat')>()
  return { ...o, chatApi: { ...o.chatApi, conversations: vi.fn().mockResolvedValue([]) } }
})
vi.mock('../../../api/groups', async (io) => {
  const o = await io<typeof import('../../../api/groups')>()
  return {
    ...o,
    groupsApi: { ...o.groupsApi, addableUsers: vi.fn().mockResolvedValue([]), create: vi.fn() },
  }
})

import { useMeRole } from '../../../auth/useCan'
import { NewGroupButton } from './NewGroupButton'

function renderWithProviders(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('NewGroupButton', () => {
  it('renders nothing for a non-owner', () => {
    vi.mocked(useMeRole).mockReturnValue('supervisor')
    renderWithProviders(<NewGroupButton />)
    expect(screen.queryByRole('button', { name: /new group/i })).toBeNull()
  })

  it('opens the create modal for an owner', () => {
    vi.mocked(useMeRole).mockReturnValue('owner')
    renderWithProviders(<NewGroupButton />)
    fireEvent.click(screen.getByRole('button', { name: /new group/i }))
    expect(screen.getByRole('dialog', { name: /new group/i })).toBeInTheDocument()
  })
})
