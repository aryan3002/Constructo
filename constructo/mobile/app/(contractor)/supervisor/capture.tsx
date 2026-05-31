/**
 * Capture home (`/capture`) — THE hero screen and default landing. One job: get
 * a photo or voice note out of a gloved supervisor's hands in seconds, even
 * offline. Photo/voice come BEFORE any form (a form is a failure for this role).
 *
 * Flow: pick a "what is this?" tag → tap 📷 (camera/library) or 🎙 → ENQUEUE a
 * capture into the offline outbox → optimistic "queued, will sync" with the
 * SyncStatus bar at top. The outbox replays via `submitCapture` → the REAL
 * POST /api/v1/capture, which stores the media and runs extraction (creating a
 * SiteEvent on the chosen site).
 *
 * Voice note: there is no on-device audio recorder/STT wired yet, so 🎙 enqueues
 * a short TEXT capture (still a real event) — swap for a recorded file later.
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'

import { captureSites, type CaptureMedia } from '../../../src/api/capture'
import type { CaptureKind } from '../../../src/api/supervisor'
import type { Site } from '../../../src/api/types'
import { useT } from '../../../src/i18n/I18nProvider'
import { Display, Screen, Small, SyncStatus, Card } from '../../../src/ui'
import { useOutbox } from '../../../src/offline/useOutbox'
import { enqueue, list, type OutboxItem } from '../../../src/offline/outbox'
import {
  CaptureBar,
  CalmEmpty,
  KindChipRow,
  KIND_GLYPH,
  SentRow,
  SiteChip,
  SPACE,
} from './_components'

const CAPTURE_PATH = '/api/v1/capture'

const STR = {
  en: {
    promise: 'Send it once. We file it.',
    photo: 'Photo bhejo',
    voice: 'Hold to talk',
    voiceHint: 'Bolkar batao — "24 mazdoor aaye…"',
    tagPrompt: 'What is this?',
    kinds: { attendance: 'Attendance', delivery: 'Delivery', progress: 'Progress', issue: 'Issue' },
    sentTitle: "TODAY YOU'VE SENT",
    filed: 'filed',
    queued: 'filing…',
    emptyTitle: 'Nothing yet today',
    emptyBody: 'First photo files itself — tap the big button above.',
    queuedToast: 'Queued — will sync when online.',
    voiceNote: 'Voice note',
    voiceText: 'Voice note (transcription pending)',
    photoLabel: 'Photo',
    permTitle: 'Camera needed',
    permBody: 'Allow camera/photos to send a site photo.',
    noSite: 'No site assigned yet — ask your PM.',
    tapSite: 'tap to switch site',
  },
  hi: {
    promise: 'एक बार भेजो। हम फ़ाइल कर देंगे।',
    photo: 'फ़ोटो भेजो',
    voice: 'दबाकर बोलो',
    voiceHint: 'बोलकर बताओ — "24 मज़दूर आए…"',
    tagPrompt: 'यह क्या है?',
    kinds: { attendance: 'हाज़िरी', delivery: 'डिलीवरी', progress: 'प्रगति', issue: 'समस्या' },
    sentTitle: 'आज आपने भेजा',
    filed: 'फ़ाइल हो गया',
    queued: 'भेज रहे…',
    emptyTitle: 'आज अभी कुछ नहीं',
    emptyBody: 'पहली फ़ोटो खुद फ़ाइल हो जाती है — ऊपर बड़ा बटन दबाओ।',
    queuedToast: 'कतार में — ऑनलाइन होते ही भेज देंगे।',
    voiceNote: 'आवाज़ नोट',
    voiceText: 'आवाज़ नोट (लिखाई बाकी)',
    photoLabel: 'फ़ोटो',
    permTitle: 'कैमरा चाहिए',
    permBody: 'साइट फ़ोटो भेजने के लिए कैमरा/फ़ोटो की अनुमति दें।',
    noSite: 'अभी कोई साइट असाइन नहीं हुई — PM से पूछो।',
    tapSite: 'साइट बदलने के लिए दबाएँ',
  },
} as const

function mediaFromAsset(a: ImagePicker.ImagePickerAsset): CaptureMedia {
  const name = a.fileName ?? a.uri.split('/').pop() ?? `photo_${Date.now()}.jpg`
  return { uri: a.uri, name, mime: a.mimeType ?? 'image/jpeg' }
}

export default function Capture() {
  const { lang } = useT()
  const { online, pending, flush } = useOutbox()
  const str = STR[lang]

  const [kind, setKind] = useState<CaptureKind>('progress')
  const [busy, setBusy] = useState(false)
  const [queued, setQueued] = useState<OutboxItem[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [siteIdx, setSiteIdx] = useState(0)

  // Resolve the supervisor's assigned site(s) for a real capture target.
  useEffect(() => {
    captureSites()
      .then(setSites)
      .catch(() => setSites([]))
  }, [])
  const site = sites[siteIdx]

  const refresh = useCallback(async () => {
    setQueued(await list())
  }, [])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )
  useEffect(() => {
    void refresh()
  }, [pending, refresh])

  const enqueueCapture = useCallback(
    async (media: CaptureMedia | null, text?: string) => {
      if (!site) {
        Alert.alert('•', str.noSite)
        return
      }
      const label = `${str.kinds[kind]} · ${media ? str.photoLabel : str.voiceNote}`
      await enqueue({
        label,
        path: CAPTURE_PATH,
        method: 'POST',
        capture: { site_id: site.id, type: kind, text: text ?? null, media },
      })
      await refresh()
      if (online) void flush() // optimistic: nudge a drain immediately
      Alert.alert('✓', str.queuedToast)
    },
    [kind, site, str, refresh, online, flush],
  )

  const onPhoto = useCallback(async () => {
    setBusy(true)
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      let result: ImagePicker.ImagePickerResult
      if (perm.granted) {
        result = await ImagePicker.launchCameraAsync({ quality: 0.7 })
      } else {
        const lib = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (!lib.granted) {
          Alert.alert(str.permTitle, str.permBody)
          return
        }
        result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 })
      }
      if (result.canceled || result.assets.length === 0) return
      await enqueueCapture(mediaFromAsset(result.assets[0]))
    } finally {
      setBusy(false)
    }
  }, [enqueueCapture, str])

  const onVoice = useCallback(async () => {
    // No recorder/STT yet → enqueue a short TEXT capture so the loop is real.
    await enqueueCapture(null, `[${str.kinds[kind]}] ${str.voiceText}`)
  }, [enqueueCapture, kind, str])

  const captureItems = queued.filter((i) => i.path === CAPTURE_PATH)

  return (
    <Screen>
      <View style={{ marginHorizontal: -SPACE.lg, marginTop: -SPACE.md }}>
        <SyncStatus />
      </View>

      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Pressable
          onPress={sites.length > 1 ? () => setSiteIdx((i) => (i + 1) % sites.length) : undefined}
        >
          <SiteChip name={site?.name ?? str.noSite} online={online} />
        </Pressable>
      </View>

      <Display>{str.promise}</Display>

      <Small muted>{str.tagPrompt}</Small>
      <KindChipRow value={kind} labels={str.kinds} onChange={setKind} />

      <CaptureBar
        photoLabel={str.photo}
        voiceLabel={str.voice}
        voiceHint={str.voiceHint}
        busy={busy}
        onPhoto={() => void onPhoto()}
        onVoice={() => void onVoice()}
      />

      <Small muted style={{ letterSpacing: 1, marginTop: SPACE.sm }}>
        {str.sentTitle}
      </Small>
      {captureItems.length === 0 ? (
        <CalmEmpty title={str.emptyTitle} body={str.emptyBody} />
      ) : (
        <Card padded={false} style={{ paddingHorizontal: SPACE.lg }}>
          {captureItems.map((item, i) => {
            const cap = item.capture
            const isVoice = !cap?.media
            const k = (cap?.type ?? 'progress') as CaptureKind
            const glyph = isVoice ? '🎙' : KIND_GLYPH[k]
            const time = new Date(item.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
            return (
              <SentRow
                key={item.id}
                glyph={glyph}
                label={item.label}
                meta={time}
                filed={false}
                filedLabel={str.filed}
                queuedLabel={str.queued}
                isLast={i === captureItems.length - 1}
              />
            )
          })}
        </Card>
      )}
    </Screen>
  )
}
