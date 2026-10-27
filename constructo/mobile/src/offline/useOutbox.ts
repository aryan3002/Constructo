/**
 * Sync engine for the offline {@link outbox}. ONE module-level drainer for the
 * whole app (T9): one NetInfo subscription, one drain in flight at a time (a
 * second `flush()` joins the running one), so a reconnect can't send the same
 * item from several screens at once. {@link useOutbox} only subscribes to its
 * state for the {@link SyncStatus} indicator and the screens.
 *
 * Drained items replay through the API client; a failed item stays queued for
 * the next attempt.
 */
import { useEffect, useSyncExternalStore } from 'react'
import NetInfo from '@react-native-community/netinfo'

import { ApiError, request } from '../api/client'
import { submitCapture } from '../api/capture'
import {
  ensureCaptureId,
  getOutboxUser,
  list,
  listFor,
  remove,
  setOutboxUser,
  subscribeOutboxChanges,
  type OutboxItem,
} from './outbox'

/** A 4xx (except 401 expired login / 408 timeout / 429 rate-limit) is a
 *  PERMANENT rejection — the item can never succeed as-is (too large /
 *  forbidden / invalid), so retrying it forever would wedge everything queued
 *  behind it. A 401 pauses the queue until the user signs back in: the capture
 *  is theirs and must not be thrown away because a login expired. */
export function isPermanentFailure(e: unknown): boolean {
  return (
    e instanceof ApiError &&
    e.status >= 400 &&
    e.status < 500 &&
    e.status !== 401 &&
    e.status !== 408 &&
    e.status !== 429
  )
}

export type SyncState = 'idle' | 'syncing' | 'offline'

export interface OutboxSnapshot {
  online: boolean
  state: SyncState
  pending: number
}

export interface OutboxStatus extends OutboxSnapshot {
  /** Force a drain attempt (e.g. a "retry now" tap). */
  flush: () => Promise<void>
}

let snapshot: OutboxSnapshot = { online: true, state: 'idle', pending: 0 }
const listeners = new Set<() => void>()

function setSnapshot(patch: Partial<OutboxSnapshot>): void {
  snapshot = { ...snapshot, ...patch }
  listeners.forEach((l) => l())
}

/** Re-read the queue length (after an enqueue, a remove, a sign-in). */
export async function refreshOutbox(): Promise<void> {
  setSnapshot({ pending: (await list()).length })
}

async function send(queued: OutboxItem, userId: string): Promise<void> {
  const item = await ensureCaptureId(queued, userId)
  if (item.capture) {
    // Multipart field capture → the real /capture extraction loop. Its
    // client_capture_id makes a repeat send land once on the server.
    await submitCapture(item.capture)
  } else {
    await request(item.path, {
      method: item.method,
      body: item.body != null ? JSON.stringify(item.body) : undefined,
    })
  }
}

async function drain(): Promise<void> {
  // Only the signed-in user's queue is ever sent, under their own login.
  const user = getOutboxUser()
  if (!user) return
  setSnapshot({ state: 'syncing' })
  // Items already tried in this pass (never retried twice in one drain).
  const tried = new Set<string>()
  try {
    for (;;) {
      // Signed out (or someone else signed in) mid-drain: stop.
      if (getOutboxUser() !== user) break
      const asked = flushRequests
      // Re-read every step, so a capture enqueued mid-drain goes out too.
      const next = (await listFor(user)).find((i) => !tried.has(i.id))
      if (!next) {
        // A screen enqueued and asked for a flush while we were reading: it
        // joined this drain, so look once more before finishing.
        if (flushRequests !== asked) continue
        break
      }
      tried.add(next.id)
      try {
        await send(next, user)
        await remove(next.id, user)
      } catch (e) {
        if (isPermanentFailure(e)) {
          // This item will NEVER sync (e.g. 413 too-large / 403 not-assigned /
          // 422). Drop it so it can't wedge every capture queued behind it, and
          // keep draining the rest.
          await remove(next.id, user)
          continue
        }
        // Transient (network / 5xx / timeout / expired login): stop and retry
        // the whole tail next time.
        break
      }
    }
  } finally {
    await refreshOutbox()
    setSnapshot({ state: snapshot.online ? 'idle' : 'offline' })
  }
}

// Keep the pending count current whenever the stored queue changes.
subscribeOutboxChanges(() => {
  void refreshOutbox()
})

let inFlight: { user: string | null; promise: Promise<void> } | null = null
let flushRequests = 0

/** Send what is queued. A call while a drain runs for the same user joins it
 *  (one sender); after a sign-in switch it runs once the old drain stops. */
export function flushOutbox(): Promise<void> {
  flushRequests += 1
  const user = getOutboxUser()
  if (inFlight && inFlight.user === user) return inFlight.promise
  const before = inFlight?.promise ?? Promise.resolve()
  const promise: Promise<void> = before
    .then(() => drain())
    .finally(() => {
      if (inFlight?.promise === promise) inFlight = null
    })
  inFlight = { user, promise }
  return promise
}

/** The session changed: use `userId`'s queue (null = signed out: nothing is
 *  read or sent). A signed-in user's waiting items go out straight away. */
export function activateOutboxFor(userId: string | null): void {
  setOutboxUser(userId)
  void refreshOutbox()
  if (userId) void flushOutbox()
}

let netUnsubscribe: (() => void) | null = null

/** Start the single connectivity watcher (idempotent): drain on reconnect. */
export function startOutboxSync(): void {
  if (netUnsubscribe) return
  netUnsubscribe = NetInfo.addEventListener((s) => {
    const online = Boolean(s.isConnected)
    setSnapshot({ online, state: online ? snapshot.state : 'offline' })
    if (online) void flushOutbox()
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => snapshot

export function useOutbox(): OutboxStatus {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  useEffect(() => {
    startOutboxSync()
    void refreshOutbox()
  }, [])
  return { ...s, flush: flushOutbox }
}

/** Test hook: reset the module state between tests. */
export function __resetOutboxSyncForTests(): void {
  netUnsubscribe?.()
  netUnsubscribe = null
  inFlight = null
  setOutboxUser(null)
  snapshot = { online: true, state: 'idle', pending: 0 }
}
