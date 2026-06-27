/**
 * Transient consume-once hand-off for the chat photo send. The photo preview is a
 * route (the camera picker pushes it); on Send it writes {uri, mime, caption} here
 * and pops back, and the chat thread reads it on focus and runs its own durable
 * send. A module slot (only one photo flow is active at a time) avoids Expo Router's
 * forward-only params, and consume-once makes a double-send impossible.
 *
 * (Markup is embedded inline in the preview, so no markup hand-off is needed.)
 */
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
