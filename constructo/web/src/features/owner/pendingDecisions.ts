/**
 * Money decisions wait a few seconds before they are sent, so a mis-tap can be
 * undone (T8, the web twin of the app's `src/owner/pendingDecisions.ts`).
 * Lives outside any component: leaving the page doesn't lose a pending
 * approval, hiding the tab sends it at once, and sign-out sends it before the
 * session ends (see `auth/session.ts`).
 *
 * While an action waits, the ids it settles are hidden from the lists
 * ({@link usePendingHiddenIds}) and {@link usePendingActions} lists it for the
 * Undo bar. Undo or a failed send brings the rows back.
 */
import { useSyncExternalStore } from 'react'

/** How long a confirmed money action waits for Undo before it is sent. */
export const UNDO_MS = 5000

export interface PendingDecisionInput<R> {
  /** The row ids this action settles (hidden until it is undone or fails). */
  ids: string[]
  /** Sends the action. Called at most once. */
  send: () => Promise<R>
  /** e.g. "Approved" — shown with the Undo button for the whole window. */
  message: string
  /** Called when the send fails (the rows are already back). */
  onError?: (err: unknown) => void
  delayMs?: number
}

export interface PendingAction {
  key: string
  message: string
}

interface Entry extends PendingAction {
  ids: string[]
  timer: ReturnType<typeof setTimeout>
  run: () => Promise<void>
}

const pending = new Map<string, Entry>()
/** ids hidden from the lists, with how many pending/in-flight actions hide them. */
const hidden = new Map<string, number>()
const listeners = new Set<() => void>()
let hiddenSnapshot: ReadonlySet<string> = new Set()
let actionsSnapshot: readonly PendingAction[] = []
let seq = 0

function emit(): void {
  hiddenSnapshot = new Set(hidden.keys())
  actionsSnapshot = [...pending.values()].map(({ key, message }) => ({ key, message }))
  listeners.forEach((l) => l())
}

function hide(ids: string[]): void {
  for (const id of ids) hidden.set(id, (hidden.get(id) ?? 0) + 1)
}

function unhide(ids: string[]): void {
  for (const id of ids) {
    const n = (hidden.get(id) ?? 0) - 1
    if (n > 0) hidden.set(id, n)
    else hidden.delete(id)
  }
}

/** Hold a confirmed money action for {@link UNDO_MS}, then send it. Returns a
 *  key for {@link undoPending}. */
export function schedulePending<R>(input: PendingDecisionInput<R>): string {
  seq += 1
  const key = `pd_${seq}`
  const ids = [...input.ids]

  const run = async () => {
    const entry = pending.get(key)
    if (!entry) return
    pending.delete(key)
    clearTimeout(entry.timer)
    emit()
    try {
      await input.send()
      unhide(ids)
      emit()
    } catch (err) {
      unhide(ids)
      emit()
      input.onError?.(err)
    }
  }

  const timer = setTimeout(() => void run(), input.delayMs ?? UNDO_MS)
  pending.set(key, { key, ids, timer, run, message: input.message })
  hide(ids)
  emit()
  return key
}

/** Cancel a pending action before it is sent. Returns false when it already went. */
export function undoPending(key: string): boolean {
  const entry = pending.get(key)
  if (!entry) return false
  pending.delete(key)
  clearTimeout(entry.timer)
  unhide(entry.ids)
  emit()
  return true
}

/** Send everything pending now (tab hidden, sign-out). */
export async function flushPending(): Promise<void> {
  await Promise.all([...pending.values()].map((e) => e.run()))
}

export function pendingCount(): number {
  return pending.size
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The row ids to leave out of a list right now. */
export function usePendingHiddenIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => hiddenSnapshot, () => hiddenSnapshot)
}

/** The actions waiting in their undo window, oldest first. */
export function usePendingActions(): readonly PendingAction[] {
  return useSyncExternalStore(subscribe, () => actionsSnapshot, () => actionsSnapshot)
}

// A hidden tab may never come back (closed, or the laptop sleeps): send now,
// as the app does when it goes to the background.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && pending.size > 0) void flushPending()
  })
}
