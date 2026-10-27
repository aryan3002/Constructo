// Batch G item 10 — nothing on screen pretends: no local-only notification
// toggles, no raw IDs, plurals and quantities read like people write them,
// the PM's daily report is in their nav, the avatar shows real initials.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from './i18n'
import { ThemeModeProvider } from './ui/ThemeModeProvider'
import { formatQuantity } from './lib/format'
import { formatQty } from './pages/reconcile/helpers'
import { personInitials } from './ui/useRoleBadge'
import { ROLE_TABS } from './ui/AppShell'
import { en } from './i18n/en'

const me = vi.fn()
vi.mock('./api/auth', async () => {
  const actual = await vi.importActual<typeof import('./api/auth')>('./api/auth')
  return { ...actual, authApi: { ...actual.authApi, me: () => me() } }
})

const { Settings } = await import('./pages/settings/Settings')

function renderSettings(role: string) {
  me.mockResolvedValue({ id: 'u1', company_id: 'c1', name: 'Asha Rao', phone: '+919800000001', role, language: 'en' })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['me'], { id: 'u1', role })
  return render(
    <QueryClientProvider client={qc}>
      <ThemeModeProvider>
        <LanguageProvider defaultLanguage="en">
          <MemoryRouter initialEntries={['/settings']}>
            <Settings />
          </MemoryRouter>
        </LanguageProvider>
      </ThemeModeProvider>
    </QueryClientProvider>,
  )
}

describe('Settings notifications', () => {
  it('no local-only "coming soon" toggles; the owner is sent to the real company settings', async () => {
    renderSettings('owner')
    const link = await screen.findByRole('link', { name: /open notification settings/i })
    expect(link).toHaveAttribute('href', '/settings/admin?section=notifications')
    expect(screen.queryByText(/coming soon/i)).toBeNull()
    expect(screen.queryByRole('switch', { name: /daily brief|risk alerts|mentions/i })).toBeNull()
  })

  it('other roles have no notifications section to pretend with', async () => {
    renderSettings('pm')
    await screen.findByDisplayValue('Asha Rao')
    expect(screen.queryByRole('link', { name: /open notification settings/i })).toBeNull()
    expect(screen.queryByText(/saved locally/i)).toBeNull()
  })
})

describe('no "coming soon" left in the catalog this batch touched', () => {
  it('drops the strings', () => {
    const keys = Object.keys(en)
    expect(keys).not.toContain('settings.notifications.hint')
    expect(keys).not.toContain('admin.coming_soon')
    expect(keys).not.toContain('admin.company.id_label')
    expect(en['admin.headline']).toBe('Company settings')
  })
})

describe('quantities', () => {
  it('read like people write them', () => {
    expect(formatQuantity('24.00', 'nos')).toBe('24 pcs')
    expect(formatQuantity('12.50', 'Sq Ft')).toBe('12.5 Sq Ft')
    expect(formatQuantity('125000', 'kg')).toBe('1,25,000 kg')
    expect(formatQuantity(null, 'bag')).toBe('—')
    expect(formatQty(100, 'bag')).toBe('100 bag')
  })
})

describe('plurals', () => {
  it('has a singular for every count this batch fixed', () => {
    expect(en['reconcile.summary_at_risk_one']).toBe('{amount} at risk on 1 item')
    expect(en['payments.count_one']).toBe('1 payment')
    expect(en['capture.logged_one']).toBe('Logged 1 worker')
    expect(en['reconcile.export_done_one']).toBe('Exported 1 row to Tally CSV')
  })
})

describe('the PM daily report', () => {
  it('is linked from the PM nav', () => {
    expect(ROLE_TABS.pm.map((t) => t.to)).toContain('/dpr')
  })
})

describe('avatar initials', () => {
  it("come from the person's name", () => {
    expect(personInitials('Asha Rao')).toBe('AR')
    expect(personInitials('Ramesh Kumar Yadav')).toBe('RY')
    expect(personInitials('Asha')).toBe('AS')
    expect(personInitials('Rajesh Gupta (Owner)')).toBe('RG')
    expect(personInitials('राजेश गुप्ता')).toBe('रग')
    expect(personInitials('(Owner)')).toBeNull()
    expect(personInitials('  ')).toBeNull()
    expect(personInitials(null)).toBeNull()
  })
})
