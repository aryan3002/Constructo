import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.stubEnv('VITE_USE_MOCKS', 'false')
vi.stubEnv('VITE_API_BASE', 'http://test-api')

const { LanguageSwitcher } = await import('./LanguageSwitcher')
const { LanguageProvider } = await import('../../i18n')

describe('settings/LanguageSwitcher', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('constructo.token', 'jwt') // so it attempts a remote persist
  })
  afterEach(() => vi.restoreAllMocks())

  it('switches to Hindi, persists locally, and fire-and-forgets the profile patch', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 200, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <LanguageProvider defaultLanguage="en">
        <LanguageSwitcher />
      </LanguageProvider>,
    )

    const radios = screen.getAllByRole('radio')
    const en = radios[0]
    const hi = radios[1]
    expect(en).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(hi)
    expect(hi).toHaveAttribute('aria-checked', 'true')

    // Local persistence (B0 i18n storage key).
    expect(localStorage.getItem('cstk.lang')).toBe('hi')

    // Remote persist to PATCH /api/v1/users/me with {language:'hi'}.
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).endsWith('/api/v1/users/me'),
      )
      expect(call).toBeTruthy()
      const init = call![1] as RequestInit
      expect(init.method).toBe('PATCH')
      expect(JSON.parse(init.body as string)).toEqual({ language: 'hi' })
    })
  })
})
