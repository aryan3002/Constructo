/**
 * mediaUpload — the shared chat-media upload orchestration.
 *
 * Extracted from ChatComposer so BOTH the composer (initial send) and
 * useChatThread (retry of a failed media send) can run the exact same
 * presigned-PUT → multipart-fallback → sha256 flow without duplicating it.
 *
 * Uses the same `chatApi.presignMedia` / `fetch` / `chatApi.uploadMedia`
 * primitives the composer used before, so the existing composer tests still
 * exercise this path unchanged.
 */
import { chatApi, type ChatAddress, type MediaKind } from '../../api/chat'

/** Derive the canonical MIME the R2 upload endpoint expects.
 *  R2 CORS rejects `image/jpg`; normalise it to `image/jpeg`. */
export function canonicalMime(raw: string): string {
  if (raw === 'image/jpg') return 'image/jpeg'
  return raw
}

/** Classify a MIME string into a `MediaKind` for the presign call. */
export function mimeToKind(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image'
  return 'document'
  // Voice recording is Phase B — 'voice' is not produced here yet.
}

/** Compute a hex SHA-256 of a File via the Web Crypto API.
 *  Falls back to an empty string in environments (e.g. jsdom) where
 *  `File.prototype.arrayBuffer` / `crypto.subtle` are unavailable — the
 *  backend re-derives the hash on multipart paths; callers should treat
 *  '' as "hash not yet available". */
async function sha256Hex(file: File | Blob): Promise<string> {
  try {
    const buf =
      typeof (file as File).arrayBuffer === 'function'
        ? await (file as File).arrayBuffer()
        : await new Promise<ArrayBuffer>((resolve, reject) => {
            const fr = new FileReader()
            fr.onload = () => resolve(fr.result as ArrayBuffer)
            fr.onerror = () => reject(fr.error)
            fr.readAsArrayBuffer(file as Blob)
          })
    const hashBuf = await crypto.subtle.digest('SHA-256', buf)
    return Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return ''
  }
}

export interface UploadedMedia {
  key: string
  sha256: string
  mime: string
  mediaType: MediaKind
}

/**
 * Upload a chat attachment and return the receipt needed to POST the message.
 * Prefers a direct presigned PUT to R2, falling back to a multipart upload.
 */
export async function uploadChatMedia(address: ChatAddress, file: File): Promise<UploadedMedia> {
  const rawMime = file.type || 'application/octet-stream'
  const mime = canonicalMime(rawMime)
  const kind = mimeToKind(mime)

  const presign = await chatApi.presignMedia({ ...address, kind })

  let key: string
  let sha256: string

  if (presign.upload_mode === 'presigned' && presign.put_url) {
    // Direct PUT to R2 with canonical MIME
    const r2Res = await fetch(presign.put_url, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': mime },
    })
    if (!r2Res.ok) throw new Error(`R2 PUT failed: ${r2Res.status}`)
    key = presign.key
    sha256 = await sha256Hex(file)
  } else {
    // Multipart fallback — server returns key + sha256
    const uploaded = await chatApi.uploadMedia(address, file, kind)
    key = uploaded.key
    sha256 = uploaded.sha256
  }

  return { key, sha256, mime, mediaType: kind }
}
