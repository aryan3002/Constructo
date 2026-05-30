import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.stubEnv('VITE_USE_MOCKS', 'false')
vi.stubEnv('VITE_API_BASE', 'http://test-api')

const { InviteTeam } = await import('./InviteTeam')
const { LanguageProvider } = await import('../../i18n')

function jsonOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

describe('auth/InviteTeam', () => {
  beforeEach(() => {
    localStorage.setItem('constructo.token', 'owner-jwt')
  })
  afterEach(() => vi.restoreAllMocks())

  it('creates an invite and surfaces a shareable join link', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/invites') && (!init || init.method !== 'POST')) {
        return jsonOk([]) // listInvites
      }
      if (url.endsWith('/invites') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string)
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: 'inv1',
            company_id: 'c1',
            phone: body.phone,
            role: body.role,
            name: body.name ?? null,
            status: 'pending',
            token: 'tok-123',
            created_at: '2026-05-29T00:00:00Z',
          }),
        }
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <LanguageProvider defaultLanguage="en">
        <InviteTeam companyName="Sharma Constructions" />
      </LanguageProvider>,
    )

    await userEvent.type(screen.getByLabelText(/teammate's phone/i), '+919999988888')
    // Default role is supervisor (a free seat).
    await userEvent.click(screen.getByRole('button', { name: /create invite link/i }))

    // The created-link panel shows the join URL containing the token.
    expect(await screen.findByText(/invite link ready/i)).toBeInTheDocument()
    expect(screen.getByText(/\/join\/tok-123/)).toBeInTheDocument()

    const postCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).endsWith('/invites') && (c[1] as RequestInit)?.method === 'POST',
    )
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toMatchObject({
      phone: '+919999988888',
      role: 'supervisor',
    })
  })

  it('shows free-seat roles among the options', async () => {
    const fetchMock = vi.fn(async () => jsonOk([]))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <LanguageProvider defaultLanguage="en">
        <InviteTeam />
      </LanguageProvider>,
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const select = screen.getByLabelText(/^role$/i) as HTMLSelectElement
    const optionText = Array.from(select.options).map((o) => o.textContent)
    expect(optionText.some((o) => /supervisor/i.test(o ?? ''))).toBe(true)
    expect(optionText.some((o) => /free seat/i.test(o ?? ''))).toBe(true)
  })
})
