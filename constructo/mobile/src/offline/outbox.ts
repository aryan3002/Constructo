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
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

import type { CapturePayload } from '../api/capture'

const STORAGE_KEY = 'constructo.outbox'

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

async function readAll(): Promise<OutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as OutboxItem[]) : []
  } catch {
    return []
  }
}

async function writeAll(items: OutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

const changeListeners = new Set<() => void>()

/** Called after every change to the stored queue (the sync status listens). */
export function subscribeOutboxChanges(listener: () => void): () => void {
  changeListeners.add(listener)
  return () => {
    changeListeners.delete(listener)
  }
}

/** Read-modify-write under the lock. `mutate` returns false to skip the write. */
async function mutate<T = void>(fn: (items: OutboxItem[]) => T | false): Promise<T | false> {
  const out = await withLock(async () => {
    const items = await readAll()
    const res = fn(items)
    if (res !== false) await writeAll(items)
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
  await mutate((items) => {
    items.push(full)
  })
  return full
}

export async function list(): Promise<OutboxItem[]> {
  return withLock(readAll)
}

export async function size(): Promise<number> {
  return (await list()).length
}

export async function remove(id: string): Promise<void> {
  await mutate((items) => {
    const i = items.findIndex((x) => x.id === id)
    if (i < 0) return false
    items.splice(i, 1)
  })
}

export async function clear(): Promise<void> {
  await withLock(() => AsyncStorage.removeItem(STORAGE_KEY))
}
