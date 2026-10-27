/**
 * Money decisions wait a few seconds before they are sent, so a mis-tap can be
 * undone (T8). Lives outside any screen: leaving the screen doesn't lose a
 * pending approval, going to the background sends it at once (see the root
 * layout), and sign-out sends it before the login ends (see resetSession).
 *
 * While an action is pending its decision ids are hidden from the lists
 * ({@link usePendingHiddenIds}); Undo or a failed send brings them back.
 */
import { useSyncExternalStore } from 'react'

import { errorText } from '../api/errorText'
import { getActiveLang } from '../i18n/activeLang'
import { hideToast, showToast } from '../ui/toastBus'

/** How long a confirmed money action waits for Undo before it is sent. */
export const UNDO_MS = 5000

export interface PendingDecisionInput<R> {
  /** The decision ids this action settles (hidden until it is undone/fails). */
  ids: string[]
  /** Sends the action. Called at most once. */
  send: () => Promise<R>
  /** e.g. "Approved" — shown with the Undo button for the whole window. */
  message: string
  undoLabel: string
  /** e.g. "Not approved." — prefixed to the plain error text on failure. */
  failMessage: string
  /** After a successful send (refresh lists, report a batch result). */
  onSent?: (result: R) => Promise<unknown> | void
  delayMs?: number
}

interface Entry {
  key: string
  ids: string[]
  timer: ReturnType<typeof setTimeout>
  toastId: number
  run: () => Promise<void>
}

const pending = new Map<string, Entry>()
/** ids hidden from the lists, with how many pending/in-flight actions hide them. */
const hidden = new Map<string, number>()
const listeners = new Set<() => void>()
let snapshot: ReadonlySet<string> = new Set()
let seq = 0

function emit(): void {
  snapshot = new Set(hidden.keys())
  listeners.forEach((l) => l())
}

function hide(ids: string[]): void {
  for (const id of ids) hidden.set(id, (hidden.get(id) ?? 0) + 1)
  emit()
}

function unhide(ids: string[]): void {
  for (const id of ids) {
    const n = (hidden.get(id) ?? 0) - 1
    if (n > 0) hidden.set(id, n)
    else hidden.delete(id)
  }
  emit()
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
    hideToast(entry.toastId)
    try {
      const result = await input.send()
      // Keep the rows hidden until the lists have refetched without them.
      try {
        await input.onSent?.(result)
      } catch {
        /* a failed refresh doesn't undo a sent decision */
      }
      unhide(ids)
    } catch (err) {
      unhide(ids)
      showToast(`${input.failMessage} ${errorText(err, getActiveLang())}`, { tone: 'error' })
    }
  }

  const delay = input.delayMs ?? UNDO_MS
  const toastId = showToast(input.message, {
    tone: 'success',
    durationMs: delay,
    action: { label: input.undoLabel, onPress: () => undoPending(key) },
  })
  const timer = setTimeout(() => void run(), delay)
  pending.set(key, { key, ids, timer, toastId, run })
  hide(ids)
  return key
}

/** Cancel a pending action before it is sent. Returns false when it already went. */
export function undoPending(key: string): boolean {
  const entry = pending.get(key)
  if (!entry) return false
  pending.delete(key)
  clearTimeout(entry.timer)
  hideToast(entry.toastId)
  unhide(entry.ids)
  return true
}

/** Send everything pending now (app going to the background, sign-out). */
export async function flushPending(): Promise<void> {
  await Promise.all([...pending.values()].map((e) => e.run()))
}

export function pendingCount(): number {
  return pending.size
}

export function hiddenDecisionIds(): ReadonlySet<string> {
  return snapshot
}

export function subscribePending(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The decision ids to leave out of a list right now. */
export function usePendingHiddenIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribePending, hiddenDecisionIds, hiddenDecisionIds)
}
