import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// The full suite runs 57 files in parallel; under CPU saturation a default
// 1000ms `waitFor`/`findBy*` can time out spuriously (observed once on the
// compound build+test+lint+budget gate). Raise the async timeout so load
// spikes don't cause false failures — a genuine failure still fails, just
// after a longer poll window. Passing assertions resolve as soon as they're
// satisfied, so this does not slow the suite down.
configure({ asyncUtilTimeout: 5000 })

// jsdom's built-in localStorage can throw a SecurityError depending on the
// document origin. Install a deterministic in-memory implementation for tests.
class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  get length() {
    return this.store.size
  }
  clear() {
    this.store.clear()
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value))
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: new MemoryStorage(),
})

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})
