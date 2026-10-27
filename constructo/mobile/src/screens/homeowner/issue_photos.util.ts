// Issue report → photos attached to the request (T6). Pure orchestration so it
// is unit-tested: upload every photo independently, attach only the ids that
// actually uploaded, and tell the homeowner if any didn't.

type Lang = 'en' | 'hi'

export interface PhotoUploadOutcome {
  total: number
  attached: number
}

/** "1 of 3 photos didn't upload. Your report was sent with 2." — or null when
 *  every photo made it. */
export function photoUploadMessage({ total, attached }: PhotoUploadOutcome, lang: Lang): string | null {
  const failed = total - attached
  if (failed <= 0) return null
  if (lang === 'hi') {
    return attached === 0
      ? 'कोई फ़ोटो अपलोड नहीं हुई। आपकी रिपोर्ट बिना फ़ोटो के भेजी गई।'
      : `${total} में से ${failed} फ़ोटो अपलोड नहीं हुई। आपकी रिपोर्ट ${attached} फ़ोटो के साथ भेजी गई।`
  }
  if (attached === 0) {
    return total === 1
      ? "Your photo didn't upload. Your report was sent without it."
      : `None of your ${total} photos uploaded. Your report was sent without photos.`
  }
  return `${failed} of ${total} photo${total === 1 ? '' : 's'} didn't upload. Your report was sent with ${attached}.`
}

/** Upload each photo (failures don't sink the others), then send the report
 *  with the ids that succeeded. `buildDetail` gets the number actually
 *  attached so the text never claims photos the builder can't see. */
export async function sendIssueReport<P, R>({
  photos,
  upload,
  buildDetail,
  send,
  lang,
}: {
  photos: P[]
  upload: (photo: P) => Promise<{ id: string }>
  buildDetail: (attachedCount: number) => string | undefined
  send: (body: { detail: string | undefined; photo_ids: string[] }) => Promise<R>
  lang: Lang
}): Promise<{ result: R; warning: string | null }> {
  const settled = await Promise.allSettled(photos.map((p) => upload(p)))
  const photo_ids = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value.id] : []))
  const result = await send({ detail: buildDetail(photo_ids.length), photo_ids })
  return { result, warning: photoUploadMessage({ total: photos.length, attached: photo_ids.length }, lang) }
}
