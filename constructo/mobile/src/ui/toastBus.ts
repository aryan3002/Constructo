/**
 * Module-level toast emitter. Code that runs outside a screen — the app-wide
 * mutation error fallback, the money-decision undo window — shows a toast
 * through here; the mounted {@link ToastProvider} subscribes and renders it.
 *
 * Only the most recently mounted provider receives a toast, so a screen never
 * shows the same message twice. With no provider mounted the toast is dropped.
 */
export type ToastTone = 'success' | 'error' | 'info'

export interface ToastAction {
  label: string
  onPress: () => void
}

export interface ToastOptions {
  tone?: ToastTone
  /** A Feather icon name; each tone has a default. */
  icon?: string
  /** An optional button (e.g. Undo). Only the button takes touches. */
  action?: ToastAction
  /** How long the toast stays up; see {@link toastDurationMs}. */
  durationMs?: number
}

export interface ToastRequest extends ToastOptions {
  id: number
  message: string
}

/** `null` id = hide whatever is showing. */
export type ToastEvent = { kind: 'show'; toast: ToastRequest } | { kind: 'hide'; id: number | null }

type Listener = (e: ToastEvent) => void

const listeners: Listener[] = []
let seq = 0

export const TOAST_MS = 2200
export const ERROR_TOAST_MS = 4000
/** A toast with a button stays up long enough to reach it. */
export const ACTION_TOAST_MS = 6000

export function toastDurationMs(opts: ToastOptions): number {
  if (opts.durationMs != null) return opts.durationMs
  if (opts.action) return ACTION_TOAST_MS
  return opts.tone === 'error' ? ERROR_TOAST_MS : TOAST_MS
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.push(listener)
  return () => {
    const i = listeners.lastIndexOf(listener)
    if (i >= 0) listeners.splice(i, 1)
  }
}

/** Show a toast on the mounted provider. Returns its id (for {@link hideToast}). */
export function showToast(message: string, opts: ToastOptions = {}): number {
  seq += 1
  const toast: ToastRequest = { ...opts, id: seq, message }
  listeners[listeners.length - 1]?.({ kind: 'show', toast })
  return seq
}

/** Hide toast `id` if it is still showing (or any toast, with no id). */
export function hideToast(id: number | null = null): void {
  listeners[listeners.length - 1]?.({ kind: 'hide', id })
}
