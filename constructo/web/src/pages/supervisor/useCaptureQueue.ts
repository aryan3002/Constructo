// Offline-tolerant capture queue for field roles.
//
// Design principle (Constructo): "queue, never lose, show sync status,
// optimistic UI". A capture is added to a local queue and rendered IMMEDIATELY
// (optimistic). A background flush POSTs each pending item; failures stay
// queued and retry. The queue persists to localStorage so a refresh or a dropped
// connection never loses a count the supervisor already entered.
//
// The backend is idempotent on `client_capture_id`, so retrying a flush can
// never create a duplicate day's attendance.

import { useCallback, useEffect, useRef, useState } from 'react'
import { attendanceApi, type CaptureAttendanceRequest } from '../../api/attendance'

export type QueueState = 'pending' | 'syncing' | 'synced' | 'error'

export interface QueuedCapture {
  clientCaptureId: string
  siteId: string
  body: CaptureAttendanceRequest
  state: QueueState
  /** Optimistic display fields so the timeline can render before the server replies. */
  headcount: number
  note?: string
  occurredOn: string
  createdAt: number
  error?: string
}

const STORAGE_KEY = 'cstk.capture.queue'

function loadQueue(): QueuedCapture[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as QueuedCapture[]
    // On reload, anything mid-flight is treated as pending so it retries.
    return parsed.map((q) => (q.state === 'syncing' ? { ...q, state: 'pending' } : q))
  } catch {
    return []
  }
}

function saveQueue(queue: QueuedCapture[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  } catch {
    /* private mode / quota — in-memory queue still works for this session */
  }
}

function makeId(): string {
  // crypto.randomUUID is widely available; fall back for older test envs.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `cap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export interface UseCaptureQueue {
  queue: QueuedCapture[]
  pendingCount: number
  errorCount: number
  isSyncing: boolean
  enqueue: (input: {
    siteId: string
    headcount: number
    occurredOn: string
    note?: string
    byTrade?: Record<string, number>
  }) => void
  retry: () => void
}

/**
 * Manage the supervisor's optimistic capture queue + background flush.
 * `onSynced` is called after each successful POST so the screen can refresh the
 * server-side timeline / planned-vs-actual.
 */
export function useCaptureQueue(onSynced?: () => void): UseCaptureQueue {
  const [queue, setQueue] = useState<QueuedCapture[]>(loadQueue)
  const [isSyncing, setIsSyncing] = useState(false)
  const flushing = useRef(false)
  const onSyncedRef = useRef(onSynced)
  onSyncedRef.current = onSynced

  useEffect(() => {
    saveQueue(queue)
  }, [queue])

  const flush = useCallback(async () => {
    if (flushing.current) return
    flushing.current = true
    setIsSyncing(true)
    try {
      // Snapshot the pending items at flush start.
      const pending = queue.filter((q) => q.state === 'pending' || q.state === 'error')
      for (const item of pending) {
        setQueue((q) =>
          q.map((x) =>
            x.clientCaptureId === item.clientCaptureId
              ? { ...x, state: 'syncing', error: undefined }
              : x,
          ),
        )
        try {
          await attendanceApi.capture(item.siteId, {
            ...item.body,
            client_capture_id: item.clientCaptureId,
          })
          setQueue((q) =>
            q.map((x) =>
              x.clientCaptureId === item.clientCaptureId ? { ...x, state: 'synced' } : x,
            ),
          )
          onSyncedRef.current?.()
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Sync failed'
          setQueue((q) =>
            q.map((x) =>
              x.clientCaptureId === item.clientCaptureId
                ? { ...x, state: 'error', error: message }
                : x,
            ),
          )
        }
      }
    } finally {
      flushing.current = false
      setIsSyncing(false)
    }
  }, [queue])

  // Auto-flush whenever there is pending work and the browser is online.
  useEffect(() => {
    const hasPending = queue.some((q) => q.state === 'pending')
    const online = typeof navigator === 'undefined' || navigator.onLine
    if (hasPending && online) void flush()
  }, [queue, flush])

  // Retry queued work when connectivity returns.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onOnline = () => void flush()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [flush])

  const enqueue = useCallback<UseCaptureQueue['enqueue']>((input) => {
    const clientCaptureId = makeId()
    const item: QueuedCapture = {
      clientCaptureId,
      siteId: input.siteId,
      body: {
        headcount: input.headcount,
        occurred_on: input.occurredOn,
        note: input.note,
        by_trade: input.byTrade,
        source: 'app',
      },
      state: 'pending',
      headcount: input.headcount,
      note: input.note,
      occurredOn: input.occurredOn,
      createdAt: Date.now(),
    }
    setQueue((q) => [item, ...q])
  }, [])

  const retry = useCallback(() => {
    setQueue((q) => q.map((x) => (x.state === 'error' ? { ...x, state: 'pending' } : x)))
  }, [])

  const pendingCount = queue.filter(
    (q) => q.state === 'pending' || q.state === 'syncing',
  ).length
  const errorCount = queue.filter((q) => q.state === 'error').length

  return { queue, pendingCount, errorCount, isSyncing, enqueue, retry }
}
