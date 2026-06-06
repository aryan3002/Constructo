import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'
import type { NotificationSettings as Settings } from '../../api/approvals'

const getSettings = vi.fn()
const updateSettings = vi.fn()
vi.mock('../../api/approvals', () => ({
  approvalsApi: {
    getSettings: (...a: unknown[]) => getSettings(...a),
    updateSettings: (...a: unknown[]) => updateSettings(...a),
  },
}))

const { NotificationSettings } = await import('./NotificationSettings')

function settings(over: Partial<Settings> = {}): Settings {
  return { sla_hours: 24, escalate_overdue: true, daily_digest: true, ...over }
}

// Track the per-test QueryClient so we can tear it down deterministically —
// otherwise a query/mutation that resolves AFTER a test unmounts re-renders into
// a torn-down tree and throws "useT must be used within a <LanguageProvider>",
// which then flakes the next test (the spy-not-called failure seen in CI).
let activeQc: QueryClient | null = null

function renderSettings(role = 'owner') {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  activeQc = qc
  qc.setQueryData(['me'], { id: 'u1', role })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <NotificationSettings />
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

describe('NotificationSettings', () => {
  beforeEach(() => {
    getSettings.mockReset()
    updateSettings.mockReset()
    getSettings.mockResolvedValue(settings())
    updateSettings.mockImplementation((patch) => Promise.resolve(settings(patch)))
  })

  afterEach(() => {
    // Unmount first, then cancel/clear any in-flight async so nothing fires into
    // a dead tree between tests.
    cleanup()
    activeQc?.clear()
    activeQc = null
  })

  it('prefills the current SLA hours', async () => {
    getSettings.mockResolvedValue(settings({ sla_hours: 48 }))
    renderSettings('owner')
    expect(await screen.findByDisplayValue('48')).toBeInTheDocument()
  })

  it('saves changed SLA hours + toggles via updateSettings', async () => {
    renderSettings('owner')
    const input = await screen.findByDisplayValue('24')
    await userEvent.clear(input)
    await userEvent.type(input, '72')
    // Turn escalation off.
    await userEvent.click(
      screen.getByRole('switch', { name: /escalate overdue decisions/i }),
    )
    await userEvent.click(screen.getByRole('button', { name: /save settings/i }))
    await waitFor(() => expect(updateSettings).toHaveBeenCalled())
    expect(updateSettings.mock.calls[0][0]).toEqual({
      sla_hours: 72,
      escalate_overdue: false,
      daily_digest: true,
    })
    expect(await screen.findByText(/settings saved/i)).toBeInTheDocument()
  })

  it('blocks an out-of-range SLA value', async () => {
    renderSettings('owner')
    const input = await screen.findByDisplayValue('24')
    await userEvent.clear(input)
    await userEvent.type(input, '999')
    await userEvent.click(screen.getByRole('button', { name: /save settings/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/1–168/)
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('is read-only for a non-owner', async () => {
    renderSettings('pm')
    expect(await screen.findByText(/only the owner/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save settings/i })).not.toBeInTheDocument()
  })
})
