import { uploadMultipart, type UploadFile } from '../api/client'

const IMAGE_CONTENT_TYPE = 'image/jpeg'

/** Map an advisory AI room hint onto one of THIS site's spaces; undefined when
 *  there's no confident match, so the UI forces a deliberate one-tap choice. */
export function defaultRoomFor(hint: string | null | undefined, spaces: string[]): string | undefined {
  if (!hint) return undefined
  return spaces.find((s) => s.toLowerCase() === hint.toLowerCase())
}

/** Upload one local image via MULTIPART (server streams it to R2). Not the
 *  presigned-PUT path: FormData streams the file so we never read the whole
 *  image into JS memory (the blob read OOM-crashed on large photos), and there
 *  is no R2 content-type signature to mismatch. Returns the stored bare key. */
export async function uploadSitePhoto(siteId: string, localUri: string): Promise<string> {
  const file: UploadFile = { uri: localUri, name: 'photo.jpg', type: IMAGE_CONTENT_TYPE }
  const form = new FormData()
  form.append('file', file as unknown as Blob)
  form.append('site_id', siteId)
  form.append('kind', 'image')
  const uploaded = await uploadMultipart<{ key: string; sha256: string }>('/api/v1/chat/media', form)
  return uploaded.key
}
