import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '../../i18n'

const exportTally = vi.fn()
const stepUpVerify = vi.fn()
vi.mock('../../api/reconcile', async (orig) => {
  const actual = await orig<typeof import('../../api/reconcile')>()
  return {
    ...actual, // keep the real StepUpRequiredError class
    reconcileApi: { exportTally: (...a: unknown[]) => exportTally(...a) },
  }
})
vi.mock('../../api/auth', () => ({
  authApi: { stepUpVerify: (...a: unknown[]) => stepUpVerify(...a) },
}))

const { TallyExportButton } = await import('./TallyExportButton')
const { StepUpRequiredError } = await import('../../api/reconcile')
import { ApiError } from '../../api/client'

function renderBtn() {
  return render(
    <LanguageProvider defaultLanguage="en">
      <TallyExportButton siteId="site-1" />
    </LanguageProvider>,
  )
}

describe('TallyExportButton (OTP step-up)', () => {
  beforeEach(() => {
    exportTally.mockReset()
    stepUpVerify.mockReset()
    // jsdom lacks object URLs / anchor downloads — stub them.
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:x'),
      revokeObjectURL: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  it('prompts for OTP on step_up_required, then verifies and exports', async () => {
    // First export 403s; after verify it succeeds.
    exportTally
      .mockRejectedValueOnce(new StepUpRequiredError())
      .mockResolvedValueOnce('key,status\na,matched\nb,mismatch\n')
    stepUpVerify.mockResolvedValue({ token: 'su-tok', expiresIn: 300 })

    renderBtn()
    await userEvent.click(screen.getByRole('button', { name: /export to tally/i }))

    // The gate flips the control into an OTP prompt.
    const otp = await screen.findByLabelText(/verification code/i)
    await userEvent.type(otp, '000000')
    await userEvent.click(screen.getByRole('button', { name: /verify & export/i }))

    await waitFor(() => expect(stepUpVerify).toHaveBeenCalledWith('000000'))
    // The retry carries the step-up token, and the rows are reported.
    await waitFor(() =>
      expect(exportTally).toHaveBeenLastCalledWith('site-1', 'su-tok'),
    )
    expect(await screen.findByText(/exported 2 rows/i)).toBeInTheDocument()
  })

  it('surfaces a bad-OTP message and lets the user retry', async () => {
    exportTally.mockRejectedValueOnce(new StepUpRequiredError())
    stepUpVerify.mockRejectedValue(new ApiError(401, 'invalid_otp'))

    renderBtn()
    await userEvent.click(screen.getByRole('button', { name: /export to tally/i }))
    await userEvent.type(await screen.findByLabelText(/verification code/i), '999999')
    await userEvent.click(screen.getByRole('button', { name: /verify & export/i }))

    expect(await screen.findByText(/didn’t work/i)).toBeInTheDocument()
    // Still on the OTP prompt for another try.
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument()
  })
})
