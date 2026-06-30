import { uploadMultipart, type UploadFile } from '../api/client'
import { contractor } from '../api/contractor'

const IMAGE_CONTENT_TYPE = 'image/jpeg'

/** Map an advisory AI room hint onto one of THIS site's spaces; undefined when
 *  there's no confident match, so the UI forces a deliberate one-tap choice. */
export function defaultRoomFor(hint: string | null | undefined, spaces: string[]): string | undefined {
  if (!hint) return undefined
  return spaces.find((s) => s.toLowerCase() === hint.toLowerCase())
}

/** Upload one local image to R2 via the presign path (multipart fallback) and
 *  return the stored bare key to pass as `image_url` to publishPhoto. */
export async function uploadSitePhoto(siteId: string, localUri: string): Promise<string> {
  const presign = await contractor.presignPhoto(siteId)
  const file: UploadFile = { uri: localUri, name: presign.key.split('/').pop() ?? 'photo.jpg', type: IMAGE_CONTENT_TYPE }
  if (presign.upload_mode === 'presigned' && presign.put_url) {
    try {
      const blob = await (await fetch(file.uri)).blob()
      const res = await fetch(presign.put_url, {
        method: 'PUT',
        headers: { 'Content-Type': IMAGE_CONTENT_TYPE },
        body: blob,
      })
      if (res.ok) return presign.key
    } catch {
      // network / blob-read failure on one bar → fall through to multipart,
      // which self-heals (server sets the content-type, no signature to mismatch).
    }
  }
  const form = new FormData()
  form.append('file', file as unknown as Blob)
  form.append('site_id', siteId)
  form.append('kind', 'image')
  const uploaded = await uploadMultipart<{ key: string; sha256: string }>('/api/v1/chat/media', form)
  return uploaded.key
}
