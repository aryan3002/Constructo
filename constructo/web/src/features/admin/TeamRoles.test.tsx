import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'
import type { TeamMember } from '../../api/auth'

const me = vi.fn()
const listTeam = vi.fn()
const updateTeamMember = vi.fn()
vi.mock('../../api/auth', () => ({
  authApi: {
    me: (...a: unknown[]) => me(...a),
    listTeam: (...a: unknown[]) => listTeam(...a),
    updateTeamMember: (...a: unknown[]) => updateTeamMember(...a),
  },
}))

const { TeamRoles } = await import('./TeamRoles')

const OWNER: TeamMember = {
  id: 'u-owner', company_id: 'co', name: 'Demo Owner', phone: '+919800000001', role: 'owner', is_active: true,
}
const PM: TeamMember = {
  id: 'u-pm', company_id: 'co', name: 'Anita Rao', phone: '+919800000002', role: 'pm', is_active: true,
}
const SUP: TeamMember = {
  id: 'u-sup', company_id: 'co', name: 'Suresh Patel', phone: '+919800000004', role: 'supervisor', is_active: false,
}

function renderTeam(role = 'owner') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(['me'], { id: 'u-owner', role })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <TeamRoles />
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

function rowFor(name: string): HTMLElement {
  return screen.getByText(name).closest('li') as HTMLElement
}

describe('TeamRoles', () => {
  beforeEach(() => {
    me.mockReset()
    listTeam.mockReset()
    updateTeamMember.mockReset()
    me.mockResolvedValue({ id: 'u-owner', role: 'owner' })
    listTeam.mockResolvedValue([OWNER, PM, SUP])
    updateTeamMember.mockImplementation((id, patch) =>
      Promise.resolve({ ...[OWNER, PM, SUP].find((m) => m.id === id)!, ...patch }),
    )
  })

  it('lists members with their roles and active state', async () => {
    renderTeam('owner')
    expect(await screen.findByText('Anita Rao')).toBeInTheDocument()
    expect(screen.getByText('Suresh Patel')).toBeInTheDocument()
    // The inactive member is flagged.
    expect(within(rowFor('Suresh Patel')).getByText(/inactive/i)).toBeInTheDocument()
  })

  it('marks the current user as "You" and locks their controls', async () => {
    renderTeam('owner')
    await screen.findByText('Demo Owner')
    const ownerRow = rowFor('Demo Owner')
    expect(within(ownerRow).getByText(/^You$/)).toBeInTheDocument()
    expect(within(ownerRow).getByRole('combobox')).toBeDisabled()
    expect(within(ownerRow).getByRole('button')).toBeDisabled()
  })

  it('changes a member’s role through updateTeamMember', async () => {
    renderTeam('owner')
    await screen.findByText('Anita Rao')
    const select = within(rowFor('Anita Rao')).getByRole('combobox')
    await userEvent.selectOptions(select, 'accountant')
    await waitFor(() =>
      expect(updateTeamMember).toHaveBeenCalledWith('u-pm', { role: 'accountant' }),
    )
  })

  it('deactivates an active member', async () => {
    renderTeam('owner')
    await screen.findByText('Anita Rao')
    await userEvent.click(
      within(rowFor('Anita Rao')).getByRole('button', { name: /deactivate/i }),
    )
    await waitFor(() =>
      expect(updateTeamMember).toHaveBeenCalledWith('u-pm', { is_active: false }),
    )
  })

  it('offers reactivate for an inactive member', async () => {
    renderTeam('owner')
    await screen.findByText('Suresh Patel')
    await userEvent.click(
      within(rowFor('Suresh Patel')).getByRole('button', { name: /reactivate/i }),
    )
    await waitFor(() =>
      expect(updateTeamMember).toHaveBeenCalledWith('u-sup', { is_active: true }),
    )
  })
})
