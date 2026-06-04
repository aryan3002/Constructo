import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { qk } from '../../api/queryKeys'
import type { AppNotification } from '../../api/approvals'

const unreadCount = vi.fn()
const markRead = vi.fn()
const notifications = vi.fn()
vi.mock('../../api/approvals', () => ({
  approvalsApi: {
    unreadCount: (...a: unknown[]) => unreadCount(...a),
    markRead: (...a: unknown[]) => markRead(...a),
    notifications: (...a: unknown[]) => notifications(...a),
  },
}))

const { useUnreadCount, useMarkNotificationRead } = await import('./useUnreadCount')

function feedRow(over: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    company_id: 'c1',
    recipient_id: 'u1',
    role: 'owner',
    decision_id: null,
    site_id: 's1',
    kind: 'approval_pending',
    title: 't',
    body: null,
    severity: 'info',
    read_at: null,
    created_at: '2026-06-04T08:00:00Z',
    ...over,
  }
}

function harness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
  return { qc, wrapper }
}

describe('useUnreadCount', () => {
  beforeEach(() => {
    unreadCount.mockReset()
    markRead.mockReset()
    notifications.mockReset()
  })

  it('exposes the live unread count', async () => {
    unreadCount.mockResolvedValue(4)
    const { wrapper } = harness()
    const { result } = renderHook(() => useUnreadCount(), { wrapper })
    await waitFor(() => expect(result.current.data).toBe(4))
  })

  it('does not poll when disabled (no header / no bell)', async () => {
    unreadCount.mockResolvedValue(2)
    const { wrapper } = harness()
    renderHook(() => useUnreadCount({ enabled: false }), { wrapper })
    // Give the query a tick; it must never hit the network while gated off.
    await new Promise((r) => setTimeout(r, 10))
    expect(unreadCount).not.toHaveBeenCalled()
  })

  it('optimistically greys the row and ticks the badge down on markRead', async () => {
    // A controllable pending markRead so we can inspect the optimistic state
    // before onSettled invalidates.
    let resolveMark: () => void = () => {}
    markRead.mockReturnValue(
      new Promise<void>((res) => {
        resolveMark = res
      }),
    )
    const { qc, wrapper } = harness()
    qc.setQueryData(qk.notifications(), [feedRow({ id: 'n1', read_at: null })])
    qc.setQueryData(qk.notificationsUnread(), 3)

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper })
    result.current.mutate('n1')

    await waitFor(() =>
      expect(qc.getQueryData(qk.notificationsUnread())).toBe(2),
    )
    const feed = qc.getQueryData<AppNotification[]>(qk.notifications())
    expect(feed?.[0].read_at).not.toBeNull()
    expect(markRead).toHaveBeenCalledWith('n1')
    resolveMark()
  })

  it('rolls the badge back if markRead fails', async () => {
    markRead.mockRejectedValue(new Error('boom'))
    // Keep the onSettled refetches pending so they can't mask the rollback —
    // the cache must hold the restored snapshot, not the optimistic value.
    notifications.mockReturnValue(new Promise(() => {}))
    unreadCount.mockReturnValue(new Promise(() => {}))
    const { qc, wrapper } = harness()
    qc.setQueryData(qk.notifications(), [feedRow({ id: 'n1', read_at: null })])
    qc.setQueryData(qk.notificationsUnread(), 3)

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper })
    result.current.mutate('n1')

    await waitFor(() => expect(result.current.isError).toBe(true))
    // Rolled back to the snapshot (3), not stuck at the optimistic 2.
    expect(qc.getQueryData(qk.notificationsUnread())).toBe(3)
  })
})
