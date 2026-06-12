import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'
import type { TeamMember } from '../../api/auth'
import { ApiError } from '../../api/client'

const me = vi.fn()
const listTeam = vi.fn()
const updateTeamMember = vi.fn()
const stepUpVerify = vi.fn()
vi.mock('../../api/auth', async (orig) => {
  const actual = await orig<typeof import('../../api/auth')>()
  return {
    ...actual, // keep the real StepUpRequiredError class
    authApi: {
      me: (...a: unknown[]) => me(...a),
      listTeam: (...a: unknown[]) => listTeam(...a),
      updateTeamMember: (...a: unknown[]) => updateTeamMember(...a),
      stepUpVerify: (...a: unknown[]) => stepUpVerify(...a),
    },
  }
})

const { TeamRoles } = await import('./TeamRoles')
const { StepUpRequiredError } = await import('../../api/auth')

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
    stepUpVerify.mockReset()
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

  it("changes a member's role through updateTeamMember (non-sensitive — no OTP prompt)", async () => {
    renderTeam('owner')
    await screen.findByText('Anita Rao')
    const select = within(rowFor('Anita Rao')).getByRole('combobox')
    await userEvent.selectOptions(select, 'supervisor') // non-privileged role
    await waitFor(() =>
      expect(updateTeamMember).toHaveBeenCalledWith('u-pm', { role: 'supervisor' }, undefined),
    )
    // OTP prompt must NOT appear.
    expect(screen.queryByLabelText(/verification code/i)).not.toBeInTheDocument()
  })

  it('deactivates an active member (sensitive — triggers OTP prompt + retries with token)', async () => {
    // First call 403s; after step-up it succeeds.
    updateTeamMember
      .mockRejectedValueOnce(new StepUpRequiredError())
      .mockResolvedValueOnce({ ...PM, is_active: false })
    stepUpVerify.mockResolvedValue({ token: 'su-tok', expiresIn: 300 })

    renderTeam('owner')
    await screen.findByText('Anita Rao')
    await userEvent.click(
      within(rowFor('Anita Rao')).getByRole('button', { name: /deactivate/i }),
    )

    // OTP prompt appears.
    const otpInput = await screen.findByLabelText(/verification code/i)
    await userEvent.type(otpInput, '000000')
    await userEvent.click(screen.getByRole('button', { name: /verify & save/i }))

    await waitFor(() => expect(stepUpVerify).toHaveBeenCalledWith('000000'))
    await waitFor(() =>
      expect(updateTeamMember).toHaveBeenLastCalledWith('u-pm', { is_active: false }, 'su-tok'),
    )
    // OTP prompt dismisses on success.
    await waitFor(() =>
      expect(screen.queryByLabelText(/verification code/i)).not.toBeInTheDocument(),
    )
    expect(await screen.findByText(/team updated/i)).toBeInTheDocument()
  })

  it('assigning a privileged role triggers the OTP prompt', async () => {
    updateTeamMember
      .mockRejectedValueOnce(new StepUpRequiredError())
      .mockResolvedValueOnce({ ...PM, role: 'accountant' })
    stepUpVerify.mockResolvedValue({ token: 'su-tok-2', expiresIn: 300 })

    renderTeam('owner')
    await screen.findByText('Anita Rao')
    const select = within(rowFor('Anita Rao')).getByRole('combobox')
    await userEvent.selectOptions(select, 'accountant')

    // OTP prompt appears.
    const otpInput = await screen.findByLabelText(/verification code/i)
    await userEvent.type(otpInput, '000000')
    await userEvent.click(screen.getByRole('button', { name: /verify & save/i }))

    await waitFor(() =>
      expect(updateTeamMember).toHaveBeenLastCalledWith('u-pm', { role: 'accountant' }, 'su-tok-2'),
    )
  })

  it('reactivating an inactive member does NOT trigger the OTP prompt', async () => {
    renderTeam('owner')
    await screen.findByText('Suresh Patel')
    await userEvent.click(
      within(rowFor('Suresh Patel')).getByRole('button', { name: /reactivate/i }),
    )
    await waitFor(() =>
      expect(updateTeamMember).toHaveBeenCalledWith('u-sup', { is_active: true }, undefined),
    )
    // No OTP prompt.
    expect(screen.queryByLabelText(/verification code/i)).not.toBeInTheDocument()
  })

  it('surfaces a bad-OTP message and lets the user retry without losing the pending change', async () => {
    updateTeamMember.mockRejectedValueOnce(new StepUpRequiredError())
    stepUpVerify.mockRejectedValue(new ApiError(401, 'invalid_otp'))

    renderTeam('owner')
    await screen.findByText('Anita Rao')
    await userEvent.click(
      within(rowFor('Anita Rao')).getByRole('button', { name: /deactivate/i }),
    )

    await userEvent.type(await screen.findByLabelText(/verification code/i), '999999')
    await userEvent.click(screen.getByRole('button', { name: /verify & save/i }))

    expect(await screen.findByText(/that code.*work/i)).toBeInTheDocument()
    // OTP prompt is still visible for another attempt.
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument()
  })

  it('cancel button dismisses the OTP prompt without saving', async () => {
    updateTeamMember.mockRejectedValueOnce(new StepUpRequiredError())

    renderTeam('owner')
    await screen.findByText('Anita Rao')
    await userEvent.click(
      within(rowFor('Anita Rao')).getByRole('button', { name: /deactivate/i }),
    )

    await screen.findByLabelText(/verification code/i)
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() =>
      expect(screen.queryByLabelText(/verification code/i)).not.toBeInTheDocument(),
    )
    // stepUpVerify was never called.
    expect(stepUpVerify).not.toHaveBeenCalled()
  })

  it('offers reactivate for an inactive member', async () => {
    renderTeam('owner')
    await screen.findByText('Suresh Patel')
    await userEvent.click(
      within(rowFor('Suresh Patel')).getByRole('button', { name: /reactivate/i }),
    )
    await waitFor(() =>
      expect(updateTeamMember).toHaveBeenCalledWith('u-sup', { is_active: true }, undefined),
    )
  })
})
