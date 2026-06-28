/**
 * Pure helpers for chat media uploads — kept dependency-free so they're unit
 * tested (the logic here is load-bearing: a mismatch silently wedges photo sends).
 *
 * The backend signs a presigned PUT with a content-type derived ONLY from the
 * media `kind` (server `_MEDIA_CONTENT_TYPE`), and R2 bakes it into the signature
 * (`SignedHeaders=content-type;host`). The client's PUT `Content-Type` header
 * MUST equal that exact value or R2 returns `SignatureDoesNotMatch` (403) and the
 * send sticks on "Send…" forever. So the client derives the header from `kind`
 * here — never from the raw file mime (which may be image/heic, image/png, …).
 */

export type MediaKind = 'image' | 'document' | 'voice'

/** The content-type the backend signs for a given kind. MUST stay in sync with
 *  `_MEDIA_CONTENT_TYPE` in `backend/app/chat/router.py`. */
export function signedMediaContentType(kind: MediaKind): string {
  return kind === 'image' ? 'image/jpeg' : kind === 'voice' ? 'audio/m4a' : 'application/pdf'
}

/** Recover the true media kind. Older builds queued photos as `document`, so they
 *  were signed + stored as application/pdf — which both wedged the upload (the PUT
 *  sent image/jpeg → 403) and, once uploaded, never rendered. Correct a
 *  `document` that carries an image mime back to `image` so both new sends AND
 *  items already stuck in the durable outbox upload and display correctly. */
export function effectiveMediaKind(
  kind: MediaKind | undefined,
  mime: string | undefined,
): MediaKind {
  if (kind === 'document' && (mime ?? '').startsWith('image/')) return 'image'
  return kind ?? 'document'
}
