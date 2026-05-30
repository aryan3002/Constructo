import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

// Mock the api layer so the queue is exercised network-free.
const capture = vi.fn()
vi.mock('../../api/attendance', () => ({
  attendanceApi: { capture: (...args: unknown[]) => capture(...args) },
}))

const { useCaptureQueue } = await import('./useCaptureQueue')

describe('useCaptureQueue', () => {
  beforeEach(() => {
    localStorage.clear()
    capture.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  it('optimistically enqueues and flushes to the API, marking synced', async () => {
    capture.mockResolvedValue({ id: 'ev-1' })
    const onSynced = vi.fn()
    const { result } = renderHook(() => useCaptureQueue(onSynced))

    act(() => {
      result.current.enqueue({ siteId: 's1', headcount: 12, occurredOn: '2026-05-29' })
    })
    // Optimistic row visible immediately.
    expect(result.current.queue).toHaveLength(1)

    await waitFor(() => expect(capture).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.queue[0].state).toBe('synced'))

    // Idempotency id is sent so retries never duplicate.
    const [siteId, body] = capture.mock.calls[0]
    expect(siteId).toBe('s1')
    expect(body.client_capture_id).toBeTruthy()
    expect(onSynced).toHaveBeenCalled()
  })

  it('keeps a failed capture queued as error and can retry', async () => {
    capture.mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useCaptureQueue())

    act(() => {
      result.current.enqueue({ siteId: 's1', headcount: 5, occurredOn: '2026-05-29' })
    })

    await waitFor(() => expect(result.current.queue[0].state).toBe('error'))
    expect(result.current.errorCount).toBe(1)

    // Now the network recovers; retry re-queues and flushes successfully.
    capture.mockResolvedValue({ id: 'ev-2' })
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.queue[0].state).toBe('synced'))
  })

  it('persists pending captures to localStorage (never lost on reload)', async () => {
    // Make the flush hang so the item stays pending while we inspect storage.
    capture.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useCaptureQueue())
    act(() => {
      result.current.enqueue({ siteId: 's1', headcount: 7, occurredOn: '2026-05-29' })
    })
    await waitFor(() => {
      const raw = localStorage.getItem('cstk.capture.queue')
      expect(raw).toContain('"headcount":7')
    })
  })
})
