/**
 * Mark up (route) — annotate a photo, then hand it to the issue composer. Opened
 * from a photo's "Mark up" action with the image `uri`. The drawing surface is the
 * shared {@link PhotoMarkupCanvas}; this route only wires its result into the issue
 * flow. (The chat photo preview embeds the same canvas inline instead of pushing
 * this route.)
 *
 * NOTE: flattening needs a dev/EAS build (view-shot is native, not in Expo Go).
 */
import { useLocalSearchParams, useRouter } from 'expo-router'

import { useT } from '../../src/i18n/I18nProvider'
import { useToast } from '../../src/ui'
import { PhotoMarkupCanvas } from '../../src/chat/PhotoMarkupCanvas'

const STR = {
  en: { title: 'Mark up', use: 'Use this', empty: 'Nothing to mark up.', failed: 'Could not save the markup.' },
  hi: { title: 'मार्क करें', use: 'इसे भेजें', empty: 'मार्क करने के लिए कुछ नहीं।', failed: 'मार्कअप सहेजा नहीं जा सका।' },
} as const

export default function MarkupScreen() {
  const { lang } = useT()
  const t = STR[lang === 'hi' ? 'hi' : 'en']
  const router = useRouter()
  const toast = useToast()
  const { uri } = useLocalSearchParams<{ uri?: string }>()

  if (!uri) return null

  return (
    <PhotoMarkupCanvas
      uri={uri}
      title={t.title}
      useLabel={t.use}
      onCancel={() => router.back()}
      onEmpty={() => toast(t.empty, 'edit-2')}
      onCaptureFail={() => toast(t.failed, 'alert-circle')}
      onDone={(out) => router.replace({ pathname: '/(homeowner)/issue', params: { photo: out } })}
    />
  )
}
