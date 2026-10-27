/**
 * The module-level toast emitter the mounted ToastProvider subscribes to.
 */
import {
  ACTION_TOAST_MS,
  ERROR_TOAST_MS,
  TOAST_MS,
  hideToast,
  showToast,
  subscribeToasts,
  toastDurationMs,
  type ToastEvent,
} from './toastBus'

describe('toastBus', () => {
  it('delivers to the most recently mounted provider only', () => {
    const a: ToastEvent[] = []
    const b: ToastEvent[] = []
    const offA = subscribeToasts((e) => a.push(e))
    const offB = subscribeToasts((e) => b.push(e))
    showToast('Saved')
    expect(a).toHaveLength(0)
    expect(b).toHaveLength(1)
    offB()
    showToast('Again')
    expect(a).toHaveLength(1)
    offA()
  })

  it('hides by id', () => {
    const got: ToastEvent[] = []
    const off = subscribeToasts((e) => got.push(e))
    const id = showToast('Approved', { action: { label: 'Undo', onPress: () => undefined } })
    hideToast(id)
    off()
    expect(got[1]).toEqual({ kind: 'hide', id })
  })

  it('does nothing with no provider mounted', () => {
    expect(() => showToast('lost')).not.toThrow()
  })

  it('keeps toasts with a button up longer', () => {
    expect(toastDurationMs({})).toBe(TOAST_MS)
    expect(toastDurationMs({ tone: 'error' })).toBe(ERROR_TOAST_MS)
    expect(toastDurationMs({ action: { label: 'Undo', onPress: () => undefined } })).toBe(ACTION_TOAST_MS)
    expect(toastDurationMs({ durationMs: 10 })).toBe(10)
  })
})
