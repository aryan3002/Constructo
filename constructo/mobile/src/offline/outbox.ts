/**
 * Offline outbox — a durable queue of write actions taken while offline (or that
 * failed to send). Persisted in AsyncStorage so it survives app restarts. The
 * capture/request screens (H2) enqueue here; {@link useOutbox} drains it when
 * connectivity returns.
 *
 * This is the FOUNDATION: a generic replayable HTTP action. Screens enqueue a
 * `{path, method, body}` and the sync loop replays it through the API client.
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
  const items = await readAll()
  items.push(full)
  await writeAll(items)
  return full
}

export async function list(): Promise<OutboxItem[]> {
  return readAll()
}

export async function size(): Promise<number> {
  return (await readAll()).length
}

export async function remove(id: string): Promise<void> {
  const items = await readAll()
  await writeAll(items.filter((i) => i.id !== id))
}

export async function clear(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY)
}
