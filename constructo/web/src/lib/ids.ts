// Client-generated identifiers (idempotency keys, optimistic row ids).
// UUID where the runtime supports it, with a timestamp+entropy fallback.

export function newClientId(prefix = 'cid'): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
}
