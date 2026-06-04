import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { LanguageProvider } from '../../i18n'
import type { AppNotification } from '../../api/approvals'

// Network-free: mock the owned API layer.
const notifications = vi.fn()
const markRead = vi.fn()
const unreadCount = vi.fn()
vi.mock('../../api/approvals', () => ({
  approvalsApi: {
    notifications: (...a: unknown[]) => notifications(...a),
    markRead: (...a: unknown[]) => markRead(...a),
    unreadCount: (...a: unknown[]) => unreadCount(...a),
  },
}))

const { NotificationsPanel } = await import('./NotificationsPanel')

function makeNotification(over: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    company_id: 'c1',
    recipient_id: 'u1',
    role: 'owner',
    decision_id: null,
    site_id: 's1',
    kind: 'approval_pending',
    title: 'Cement approval needs you',
    body: 'Supervisor raised a shortfall on Tower B.',
    severity: 'risk',
    read_at: null,
    created_at: '2026-06-04T08:00:00Z',
    ...over,
  }
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <LanguageProvider>{children}</LanguageProvider>
      </QueryClientProvider>
    )
  }
  return render(<NotificationsPanel />, { wrapper: Wrapper })
}

describe('NotificationsPanel', () => {
  beforeEach(() => {
    notifications.mockReset()
    markRead.mockReset()
    unreadCount.mockReset()
    markRead.mockResolvedValue(undefined)
  })

  it('renders the feed newest-first with unread + read rows', async () => {
    notifications.mockResolvedValue([
      makeNotification({ id: 'n1', title: 'Unread one', read_at: null }),
      makeNotification({
        id: 'n2',
        title: 'Read one',
        read_at: '2026-06-04T09:00:00Z',
      }),
    ])
    renderPanel()
    expect(await screen.findByText('Unread one')).toBeInTheDocument()
    expect(screen.getByText('Read one')).toBeInTheDocument()
  })

  it('marks a single unread row read on click', async () => {
    notifications.mockResolvedValue([
      makeNotification({ id: 'n1', title: 'Unread one', read_at: null }),
    ])
    renderPanel()
    const row = await screen.findByRole('button', { name: /Unread one/ })
    await userEvent.click(row)
    await waitFor(() => expect(markRead).toHaveBeenCalledWith('n1'))
  })

  it('does not re-mark an already-read row', async () => {
    notifications.mockResolvedValue([
      makeNotification({
        id: 'n2',
        title: 'Read one',
        read_at: '2026-06-04T09:00:00Z',
      }),
    ])
    renderPanel()
    const row = await screen.findByRole('button', { name: 'Read one' })
    await userEvent.click(row)
    expect(markRead).not.toHaveBeenCalled()
  })

  it('marks every unread row read from the header action', async () => {
    notifications.mockResolvedValue([
      makeNotification({ id: 'n1', read_at: null }),
      makeNotification({ id: 'n2', read_at: null }),
      makeNotification({ id: 'n3', read_at: '2026-06-04T09:00:00Z' }),
    ])
    renderPanel()
    const markAll = await screen.findByRole('button', { name: /mark all read/i })
    await userEvent.click(markAll)
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2))
    expect(markRead).toHaveBeenCalledWith('n1')
    expect(markRead).toHaveBeenCalledWith('n2')
  })

  it('hides "mark all read" when nothing is unread', async () => {
    notifications.mockResolvedValue([
      makeNotification({ id: 'n2', read_at: '2026-06-04T09:00:00Z' }),
    ])
    renderPanel()
    await screen.findByText('Cement approval needs you')
    expect(
      screen.queryByRole('button', { name: /mark all read/i }),
    ).not.toBeInTheDocument()
  })

  it('shows the empty state when caught up', async () => {
    notifications.mockResolvedValue([])
    renderPanel()
    expect(await screen.findByText(/all caught up/i)).toBeInTheDocument()
  })

  it('stays quiet (non-blocking) on a feed error', async () => {
    notifications.mockRejectedValue(new Error('boom'))
    renderPanel()
    expect(
      await screen.findByText(/couldn’t load notifications/i),
    ).toBeInTheDocument()
  })
})
