import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.stubEnv('VITE_USE_MOCKS', 'false')
vi.stubEnv('VITE_API_BASE', 'http://test-api')

const { Search } = await import('./Search')
const { LanguageProvider } = await import('../../i18n')
const { setToken, clearToken } = await import('../../api/auth')
const { ThemeProvider } = await import('../../ui')

function renderSearch() {
  return render(
    <ThemeProvider defaultTheme="site">
      <LanguageProvider defaultLanguage="en">
        <Search />
      </LanguageProvider>
    </ThemeProvider>,
  )
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

const sampleHit = {
  event_id: 'evt-1',
  site_id: 'site-1',
  site_name: 'Site A',
  event_type: 'material_delivery',
  occurred_on: '2026-05-28',
  summary: '50 bags cement delivered by ACC',
  fields: { material: 'cement', quantity: 50 },
  score: 0.82,
  evidence: {
    source_message_ids: ['msg-aaa', 'msg-bbb'],
    confidence: 0.9,
    needs_clarification: false,
  },
  created_at: '2026-05-28T10:00:00Z',
}

describe('Search', () => {
  beforeEach(() => {
    setToken('jwt-test')
  })
  afterEach(() => {
    clearToken()
    vi.restoreAllMocks()
  })

  it('shows the empty hint before searching', () => {
    renderSearch()
    expect(screen.getByText('Search your site ledger')).toBeInTheDocument()
  })

  it('posts the query and renders a result with on-tap evidence', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        query: {
          semantic_text: 'cement',
          event_type: 'material_delivery',
          date_from: null,
          date_to: null,
          site_name_hint: null,
        },
        hits: [sampleHit],
        answerable: true,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderSearch()
    await userEvent.type(
      screen.getByLabelText('Search site events'),
      'cement deliveries',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() =>
      expect(
        screen.getByText('50 bags cement delivered by ACC'),
      ).toBeInTheDocument(),
    )

    // Hit POSTs to the search endpoint with a bearer token.
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/search')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toMatchObject({ q: 'cement deliveries' })
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer jwt-test')

    // "Material delivery" appears both as the echoed filter chip and the result
    // card's type pill — both are intended.
    expect(screen.getAllByText('Material delivery').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByTestId('search-result-count')).toHaveTextContent('1 result')

    // Evidence is one tap away (P1): expanding reveals the source messages.
    const proof = screen.getByRole('button', { name: /Show proof/i })
    await userEvent.click(proof)
    expect(screen.getAllByText('WhatsApp message').length).toBe(2)
  })

  it('says "not sure" when the API is not confident', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        query: {
          semantic_text: 'xyz',
          event_type: null,
          date_from: null,
          date_to: null,
          site_name_hint: null,
        },
        hits: [],
        answerable: false,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderSearch()
    await userEvent.type(screen.getByLabelText('Search site events'), 'xyz')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() =>
      expect(screen.getByTestId('search-not-sure')).toBeInTheDocument(),
    )
    expect(screen.getByText('Not sure about that one')).toBeInTheDocument()
  })

  it('shows an error state on a failed request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({ detail: 'boom' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    renderSearch()
    await userEvent.type(screen.getByLabelText('Search site events'), 'cement')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Search failed'),
    )
  })
})
