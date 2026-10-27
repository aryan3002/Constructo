/**
 * Offline outbox — a durable queue of write actions taken while offline (or that
 * failed to send). Persisted in AsyncStorage so it survives app restarts. The
 * capture/request screens (H2) enqueue here; the one drainer in
 * {@link ./useOutbox} sends it when connectivity returns.
 *
 * This is the FOUNDATION: a generic replayable HTTP action. Screens enqueue a
 * `{path, method, body}` and the sync loop replays it through the API client.
 *
 * Every read-modify-write runs under one lock (T9): screens enqueue while the
 * drainer removes, and an unlocked write-back would drop the other's change.
 *
 * The queue is kept per person (T9): sign-out no longer throws unsent captures
 * away, and only the signed-in user's queue is read or sent. Before this, one
 * global key held the queue; {@link migrateLegacyOutbox} moves it over.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

import { newClientCaptureId, type CapturePayload } from '../api/capture'

/** The old single, global queue (before per-user queues). */
export const LEGACY_OUTBOX_KEY = 'constructo.outbox'
const QUEUE_PREFIX = 'constructo.outbox.user.'
const FAILED_PREFIX = 'constructo.outbox.failed.'

export function outboxKey(userId: string): string {
  return `${QUEUE_PREFIX}${userId}`
}

/** The user's "Couldn't send" list: items the server permanently refused. */
export function failedKey(userId: string): string {
  return `${FAILED_PREFIX}${userId}`
}

/** An item the server refused for good (4xx other than 401/408/429), kept so
 *  the person can see why, and Retry or Delete it (T9). */
export interface FailedItem {
  item: OutboxItem
  /** The refusal's HTTP status and error code (the reason shown is built
   *  from these, in the user's language). */
  status: number
  code: string
  failedAt: number
}

// The signed-in user whose queue the screens and the drainer use. Set by the
// sync engine when the session changes (see activateOutboxFor in ./useOutbox).
let currentUser: string | null = null

export function setOutboxUser(userId: string | null): void {
  currentUser = userId
}

export function getOutboxUser(): string | null {
  return currentUser
}

// With no one signed in (shouldn't happen: the queueing screens are behind
// sign-in) an item still isn't lost: it waits in the legacy key and moves to
// the session's user at the next sign-in.
function currentKey(): string {
  return currentUser ? outboxKey(currentUser) : LEGACY_OUTBOX_KEY
}

export interface OutboxItem {
  id: string
  createdAt: number
  /** Human label for the sync indicator, e.g. "Flag an issue". */
  label: string
  path: string
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  /**
   * When present, this item is a multipart field capture replayed via
   * `submitCapture` (POST /api/v1/capture) instead of the JSON `request` path.
   * The media uri is a local file uri captured on-device.
   */
  capture?: CapturePayload
}

// One promise chain serialises every storage operation (the pattern from
// src/chat/outbox.ts).
let lock: Promise<unknown> = Promise.resolve()

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn)
  lock = run.catch(() => undefined)
  return run
}

async function readAll(key: string): Promise<OutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(key)
    return raw ? (JSON.parse(raw) as OutboxItem[]) : []
  } catch {
    return []
  }
}

async function writeAll(key: string, items: OutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(items))
}

const changeListeners = new Set<() => void>()

/** Called after every change to the stored queue (the sync status listens). */
export function subscribeOutboxChanges(listener: () => void): () => void {
  changeListeners.add(listener)
  return () => {
    changeListeners.delete(listener)
  }
}

/** Read-modify-write one queue under the lock. `fn` returns false to skip the
 *  write. The key is fixed by the caller before it waits for the lock. */
async function mutate<T = void>(
  key: string,
  fn: (items: OutboxItem[]) => T | false,
): Promise<T | false> {
  const out = await withLock(async () => {
    const items = await readAll(key)
    const res = fn(items)
    if (res !== false) await writeAll(key, items)
    return res
  })
  if (out !== false) changeListeners.forEach((l) => l())
  return out
}

let counter = 0
function newId(): string {
  // Monotonic, collision-free without Math.random (stable for tests/replay).
  counter += 1
  return `ob_${Date.now()}_${counter}`
}

export async function enqueue(
  item: Omit<OutboxItem, 'id' | 'createdAt'>,
): Promise<OutboxItem> {
  const full: OutboxItem = { ...item, id: newId(), createdAt: Date.now() }
  // Every queued capture carries its id (kept when the screen already made one).
  if (full.capture && !full.capture.client_capture_id) {
    full.capture = { ...full.capture, client_capture_id: newClientCaptureId() }
  }
  await mutate(currentKey(), (items) => {
    items.push(full)
  })
  return full
}

/** The signed-in user's queue. */
export async function list(): Promise<OutboxItem[]> {
  return listFor(currentUser)
}

/** One user's queue (the drainer pins the user it started for). */
export async function listFor(userId: string | null): Promise<OutboxItem[]> {
  const key = userId ? outboxKey(userId) : LEGACY_OUTBOX_KEY
  return withLock(() => readAll(key))
}

export async function size(): Promise<number> {
  return (await list()).length
}

export async function remove(id: string, userId: string | null = currentUser): Promise<void> {
  await mutate(userId ? outboxKey(userId) : LEGACY_OUTBOX_KEY, (items) => {
    const i = items.findIndex((x) => x.id === id)
    if (i < 0) return false
    items.splice(i, 1)
  })
}

/** A capture queued before captures carried an id gets one (persisted) before
 *  its next send, so every later retry repeats the same id. */
export async function ensureCaptureId(
  item: OutboxItem,
  userId: string | null = currentUser,
): Promise<OutboxItem> {
  if (!item.capture || item.capture.client_capture_id) return item
  const id = newClientCaptureId()
  let updated: OutboxItem = { ...item, capture: { ...item.capture, client_capture_id: id } }
  await mutate(userId ? outboxKey(userId) : LEGACY_OUTBOX_KEY, (items) => {
    const stored = items.find((x) => x.id === item.id)
    if (!stored?.capture) return false
    if (stored.capture.client_capture_id) {
      updated = stored // another writer got there first; use its id
      return false
    }
    stored.capture = { ...stored.capture, client_capture_id: id }
  })
  return updated
}

async function readFailed(key: string): Promise<FailedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(key)
    return raw ? (JSON.parse(raw) as FailedItem[]) : []
  } catch {
    return []
  }
}

function notify(): void {
  changeListeners.forEach((l) => l())
}

/** The server refused this item for good: move it from the queue to the
 *  user's "Couldn't send" list, with the reason (one locked step). */
export async function moveToFailed(
  id: string,
  userId: string,
  reason: { status: number; code: string },
): Promise<void> {
  const moved = await withLock(async () => {
    const queue = await readAll(outboxKey(userId))
    const i = queue.findIndex((x) => x.id === id)
    if (i < 0) return false
    const [item] = queue.splice(i, 1)
    const failed = await readFailed(failedKey(userId))
    failed.push({ item, status: reason.status, code: reason.code, failedAt: Date.now() })
    await AsyncStorage.setItem(failedKey(userId), JSON.stringify(failed))
    await writeAll(outboxKey(userId), queue)
    return true
  })
  if (moved) notify()
}

/** The signed-in user's "Couldn't send" list, oldest first. */
export async function listFailed(userId: string | null = currentUser): Promise<FailedItem[]> {
  if (!userId) return []
  return withLock(() => readFailed(failedKey(userId)))
}

/** Retry: put a refused item back at the end of the queue. */
export async function retryFailed(id: string, userId: string | null = currentUser): Promise<void> {
  if (!userId) return
  const moved = await withLock(async () => {
    const failed = await readFailed(failedKey(userId))
    const i = failed.findIndex((f) => f.item.id === id)
    if (i < 0) return false
    const [f] = failed.splice(i, 1)
    const queue = await readAll(outboxKey(userId))
    if (!queue.some((x) => x.id === id)) queue.push(f.item)
    await writeAll(outboxKey(userId), queue)
    await AsyncStorage.setItem(failedKey(userId), JSON.stringify(failed))
    return true
  })
  if (moved) notify()
}

/** Delete: the person decided this refused item isn't worth keeping. */
export async function deleteFailed(id: string, userId: string | null = currentUser): Promise<void> {
  if (!userId) return
  const removed = await withLock(async () => {
    const failed = await readFailed(failedKey(userId))
    const next = failed.filter((f) => f.item.id !== id)
    if (next.length === failed.length) return false
    await AsyncStorage.setItem(failedKey(userId), JSON.stringify(next))
    return true
  })
  if (removed) notify()
}

/** Drop the signed-in user's queue. */
export async function clear(): Promise<void> {
  const key = currentKey()
  await withLock(() => AsyncStorage.removeItem(key))
  changeListeners.forEach((l) => l())
}

/** Delete one user's queued work and "Couldn't send" list (account deleted). */
export async function clearOutboxFor(userId: string): Promise<void> {
  await withLock(() => AsyncStorage.multiRemove([outboxKey(userId), failedKey(userId)]))
  changeListeners.forEach((l) => l())
}

/** First run after the upgrade: the old global queue moves into `userId`'s
 *  queue. Batch B guaranteed it only ever holds the session user's items (a
 *  different sign-in cleared it). */
export async function migrateLegacyOutbox(userId: string): Promise<void> {
  const moved = await withLock(async () => {
    const legacy = await readAll(LEGACY_OUTBOX_KEY)
    if (legacy.length === 0) {
      await AsyncStorage.removeItem(LEGACY_OUTBOX_KEY)
      return false
    }
    const mine = await readAll(outboxKey(userId))
    const have = new Set(mine.map((i) => i.id))
    await writeAll(outboxKey(userId), [...mine, ...legacy.filter((i) => !have.has(i.id))])
    await AsyncStorage.removeItem(LEGACY_OUTBOX_KEY)
    return true
  })
  if (moved) changeListeners.forEach((l) => l())
}
