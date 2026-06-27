/**
 * Transient hand-off for the markup screen's result. The chat photo composer
 * pushes the markup route, which writes the flattened (annotated) image URI here
 * and pops back; the composer reads it on focus and swaps it into the preview.
 * A tiny consume-once module slot (only one preview is active at a time) avoids
 * plumbing the result back through Expo Router's forward-only params.
 */
let pending: { uri: string } | null = null

/** Called by the markup screen when it finishes (chat return mode). */
export function setMarkupResult(uri: string): void {
  pending = { uri }
}

/** Read and clear the pending markup result (consume-once; null if none). */
export function takeMarkupResult(): { uri: string } | null {
  const r = pending
  pending = null
  return r
}
