import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../i18n'
import type { RequestOut } from '../../api/requests'

const navigate = vi.fn()
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

const openHomeownerChannelMutate = vi.fn()
vi.mock('../chat/useOpenHomeownerChannel', () => ({
  useOpenHomeownerChannel: () => ({ mutate: openHomeownerChannelMutate }),
}))

const listMock = vi.fn<() => Promise<RequestOut[]>>()
vi.mock('../../api/requests', () => ({
  requestsApi: { list: (...a: unknown[]) => listMock(...(a as [])) },
}))

// AppShell pulls in heavy chrome; stub to a passthrough for a focused unit test.
vi.mock('../../ui/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { RequestsView } from './RequestsView'

const NOW = new Date('2026-07-03T12:00:00Z')
function req(p: Partial<RequestOut>): RequestOut {
  return {
    id: 'r', site_id: 's', raised_by: 'ho', title: 't', detail: null,
    status: 'sent', sla_due_at: null,
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    voice_url: null, ...p,
  }
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <MemoryRouter><RequestsView /></MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // Fake only `Date` (not timers wholesale) — React Query's promise resolution
  // and testing-library's findBy*/waitFor polling both rely on real
  // setTimeout/microtask flushing, which a full `vi.useFakeTimers()` freezes
  // and deadlocks against `await`. `toFake: ['Date']` keeps `Date.now()`/
  // `new Date()` deterministic (for the overdue-vs-open grouping check)
  // without touching the timer queue.
  vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('RequestsView', () => {
  it('shows the empty invitation when there are no requests', async () => {
    listMock.mockResolvedValue([])
    renderView()
    expect(await screen.findByText('No requests yet')).toBeInTheDocument()
  })

  it('groups overdue / open / resolved and only Reply on non-resolved', async () => {
    listMock.mockResolvedValue([
      req({ id: 'a', title: 'Overdue one', status: 'sent', sla_due_at: '2026-07-01T00:00:00Z' }),
      req({ id: 'b', title: 'Open one', status: 'in_progress', sla_due_at: null }),
      req({ id: 'c', title: 'Resolved one', status: 'done' }),
    ])
    renderView()
    // Group headings are real <h2>s; scope by role since the "Resolved" group
    // label and the resolved row's own StatusPill both render the plain-text
    // string "Resolved" (requests.group.resolved / requests.status.done share
    // the same English copy — legitimate, not a collision to dedupe away).
    expect(await screen.findByRole('heading', { name: 'Overdue', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Open', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Resolved', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Overdue one')).toBeInTheDocument()
    // Reply appears for overdue + open (2), not for the resolved row.
    expect(screen.getAllByRole('button', { name: 'Reply in chat' })).toHaveLength(2)
  })

  it('Reply opens the row site homeowner channel', async () => {
    listMock.mockResolvedValue([req({ id: 'a', site_id: 'site-a', title: 'Open one', status: 'sent' })])
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Reply in chat' }))
    expect(openHomeownerChannelMutate).toHaveBeenCalledWith('site-a')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('shows the error state when the list call rejects', async () => {
    listMock.mockRejectedValue(new Error('boom'))
    renderView()
    await waitFor(() => expect(screen.getByText('Could not load requests.')).toBeInTheDocument())
  })
})
