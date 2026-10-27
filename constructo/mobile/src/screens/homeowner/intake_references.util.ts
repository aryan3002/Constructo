// Design intake (app/intake.tsx) sends — T6. Pure so they are unit-tested:
// a reference photo is uploaded first and only the returned storage key is
// posted (never the picker's file:// URI, which means nothing off the phone),
// and style picks report which ones failed instead of being dropped silently.
import type { UploadFile } from '../../api/client'

export interface PickedAsset {
  uri: string
  fileName?: string | null
  mimeType?: string | null
}

/** Upload one picked photo, then create the reference from the returned key.
 *  Resolves to the stored key; rejects if either step fails. */
export async function uploadIntakeReference(
  asset: PickedAsset,
  deps: {
    upload: (file: UploadFile) => Promise<{ image_url: string }>
    create: (body: { image_url: string; source: 'upload' }) => Promise<unknown>
  },
): Promise<string> {
  const { image_url } = await deps.upload({
    uri: asset.uri,
    name: asset.fileName ?? `reference-${Date.now()}.jpg`,
    type: asset.mimeType ?? 'image/jpeg',
  })
  await deps.create({ image_url, source: 'upload' })
  return image_url
}

/** Post the style picks not yet saved. Returns which saved and which failed,
 *  so the caller can say so and retry only the failures (no duplicates). */
export async function saveStylePicks(
  choices: string[],
  alreadySaved: ReadonlySet<string>,
  post: (choice: string) => Promise<unknown>,
): Promise<{ saved: string[]; failed: string[] }> {
  const pending = choices.filter((c) => !alreadySaved.has(c))
  const settled = await Promise.allSettled(pending.map((c) => post(c)))
  const saved: string[] = []
  const failed: string[] = []
  settled.forEach((s, i) => (s.status === 'fulfilled' ? saved : failed).push(pending[i]))
  return { saved, failed }
}
