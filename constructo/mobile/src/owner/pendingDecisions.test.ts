/**
 * The undo window for money decisions (T8): nothing is sent for 5 seconds,
 * Undo cancels it, a flush (background / sign-out) sends early, and a failed
 * send brings the row back with an error.
 */
import { ApiError } from '../api/client'
import {
  UNDO_MS,
  flushPending,
  hiddenDecisionIds,
  pendingCount,
  schedulePending,
  undoPending,
} from './pendingDecisions'
import { subscribeToasts, type ToastEvent } from '../ui/toastBus'

const base = { message: 'Approved', undoLabel: 'Undo', failMessage: 'Not approved.' }

let toasts: ToastEvent[]
let off: () => void

beforeEach(() => {
  jest.useFakeTimers()
  toasts = []
  off = subscribeToasts((e) => toasts.push(e))
})

afterEach(async () => {
  off()
  await flushPending()
  jest.useRealTimers()
})

it('sends after the delay, not before', async () => {
  const send = jest.fn().mockResolvedValue({ id: 'd1' })
  const onSent = jest.fn()
  schedulePending({ ...base, ids: ['d1'], send, onSent })

  expect(hiddenDecisionIds().has('d1')).toBe(true)
  jest.advanceTimersByTime(UNDO_MS - 1)
  expect(send).not.toHaveBeenCalled()
  jest.advanceTimersByTime(1)
  await Promise.resolve()
  await Promise.resolve()
  expect(send).toHaveBeenCalledTimes(1)
  await jest.runAllTimersAsync()
  expect(onSent).toHaveBeenCalledWith({ id: 'd1' })
  expect(hiddenDecisionIds().has('d1')).toBe(false)
  expect(pendingCount()).toBe(0)
})

it('shows "Approved" with an Undo button for the whole window', () => {
  const send = jest.fn().mockResolvedValue(null)
  schedulePending({ ...base, ids: ['d1'], send })
  const shown = toasts[0]
  expect(shown.kind).toBe('show')
  if (shown.kind !== 'show') return
  expect(shown.toast.message).toBe('Approved')
  expect(shown.toast.action?.label).toBe('Undo')
  expect(shown.toast.durationMs).toBe(UNDO_MS)
})

it('Undo cancels it: nothing is sent and the row comes back', async () => {
  const send = jest.fn().mockResolvedValue(null)
  const key = schedulePending({ ...base, ids: ['d1'], send })
  expect(undoPending(key)).toBe(true)
  expect(hiddenDecisionIds().has('d1')).toBe(false)
  await jest.runAllTimersAsync()
  expect(send).not.toHaveBeenCalled()
  expect(undoPending(key)).toBe(false)
})

it('the toast Undo button undoes it', async () => {
  const send = jest.fn().mockResolvedValue(null)
  schedulePending({ ...base, ids: ['d1'], send })
  const shown = toasts[0]
  if (shown.kind === 'show') shown.toast.action?.onPress()
  await jest.runAllTimersAsync()
  expect(send).not.toHaveBeenCalled()
})

it('flush sends everything pending at once', async () => {
  const a = jest.fn().mockResolvedValue(null)
  const b = jest.fn().mockResolvedValue(null)
  schedulePending({ ...base, ids: ['d1'], send: a })
  schedulePending({ ...base, ids: ['d2', 'd3'], send: b })
  await flushPending()
  expect(a).toHaveBeenCalledTimes(1)
  expect(b).toHaveBeenCalledTimes(1)
  expect(pendingCount()).toBe(0)
  // The timer that would have sent them again does nothing.
  await jest.runAllTimersAsync()
  expect(a).toHaveBeenCalledTimes(1)
  // The Undo toast is taken down once it has gone.
  expect(toasts.filter((e) => e.kind === 'hide')).toHaveLength(2)
})

it('a failed send brings the row back with a plain error', async () => {
  const send = jest.fn().mockRejectedValue(new ApiError(503, 'upstream timeout'))
  schedulePending({ ...base, ids: ['d1'], send })
  await flushPending()
  expect(hiddenDecisionIds().has('d1')).toBe(false)
  const err = toasts.find((e) => e.kind === 'show' && e.toast.tone === 'error')
  expect(err).toBeDefined()
  if (err?.kind !== 'show') return
  expect(err.toast.message).toBe('Not approved. Something went wrong on our side. Please try again in a moment.')
})
