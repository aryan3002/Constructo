/**
 * Transient consume-once hand-offs for the chat photo flow, which is route-based
 * (preview screen → markup screen → back), since pushing the markup route from a
 * React Native <Modal> glitched. Two slots:
 *   - markup result: the markup screen writes the flattened image URI; the preview
 *     screen reads it on focus and swaps it in.
 *   - send payload: the preview screen writes {uri, mime, caption} on Send and pops
 *     back; the chat thread reads it on focus and runs its own durable send.
 * Module slots (only one photo flow is active at a time) avoid Expo Router's
 * forward-only params.
 */

// ── markup result (markup screen → preview screen) ──────────────────────────
let pendingMarkup: { uri: string } | null = null

/** Called by the markup screen when it finishes (chat return mode). */
export function setMarkupResult(uri: string): void {
  pendingMarkup = { uri }
}

/** Read and clear the pending markup result (consume-once; null if none). */
export function takeMarkupResult(): { uri: string } | null {
  const r = pendingMarkup
  pendingMarkup = null
  return r
}

// ── send payload (preview screen → chat thread) ─────────────────────────────
export interface PhotoSend {
  uri: string
  mime: string
  caption: string
}

let pendingSend: PhotoSend | null = null

/** Called by the preview screen on Send, just before it pops back to the thread. */
export function setPhotoSend(payload: PhotoSend): void {
  pendingSend = payload
}

/** Read and clear the pending send payload (consume-once; null if none). */
export function takePhotoSend(): PhotoSend | null {
  const r = pendingSend
  pendingSend = null
  return r
}
