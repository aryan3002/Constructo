/**
 * Capture home (`/capture`) — THE hero screen and default landing. One job: get
 * a photo or voice note out of a gloved supervisor's hands in seconds, even
 * offline. Photo/voice come BEFORE any form (a form is a failure for this role).
 *
 * Flow: pick a "what is this?" tag → tap 📷 (camera/library) or hold 🎙 →
 * ENQUEUE a capture into the offline outbox → optimistic "queued, will sync"
 * with the SyncStatus bar visible at top. The pending outbox items render below.
 *
 * BACKEND GAP: there is no app-authenticated capture endpoint yet (ingest uses
 * an X-Ingest-Key for the WhatsApp bridge, not the app). So we enqueue against
 * the assumed CAPTURE_PATH/CaptureBody shape; the outbox replays once it exists.
 * The queue + optimistic UI IS the deliverable; the offline foundation is real.
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'

import { useT } from '../../../src/i18n/I18nProvider'
import { useAuth } from '../../../src/auth/AuthContext'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { Display, Screen, Small, SyncStatus, Card } from '../../../src/ui'
import { useOutbox } from '../../../src/offline/useOutbox'
import { enqueue, list, type OutboxItem } from '../../../src/offline/outbox'
import {
  CAPTURE_PATH,
  type CaptureBody,
  type CaptureKind,
} from '../../../src/api/supervisor'
import {
  CaptureBar,
  CalmEmpty,
  KindChipRow,
  KIND_GLYPH,
  SentRow,
  SiteChip,
  SPACE,
} from './_components'

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
    photoLabel: 'Photo',
    permTitle: 'Camera needed',
    permBody: 'Allow camera/photos to send a site photo.',
    noSite: 'No site assigned yet — ask your PM.',
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
    photoLabel: 'फ़ोटो',
    permTitle: 'कैमरा चाहिए',
    permBody: 'साइट फ़ोटो भेजने के लिए कैमरा/फ़ोटो की अनुमति दें।',
    noSite: 'अभी कोई साइट असाइन नहीं हुई — PM से पूछो।',
  },
} as const

let captureSeq = 0
function newCaptureId(): string {
  captureSeq += 1
  return `cap_${Date.now()}_${captureSeq}`
}

export default function Capture() {
  const { lang } = useT()
  const { me } = useAuth()
  const { theme } = useTheme()
  const { online, pending, flush } = useOutbox()
  const str = STR[lang]

  const [kind, setKind] = useState<CaptureKind>('progress')
  const [busy, setBusy] = useState(false)
  const [queued, setQueued] = useState<OutboxItem[]>([])

  // The supervisor is scoped to an assigned site. We don't have a site_id on
  // `me` here, so we use the company-scoped placeholder until a capture targets
  // a chosen site (My Sites tab). For the capture promise we tag with company.
  const siteId = me?.company_id ?? 'site'
  const siteName = me?.name ? `${me.name}'s site` : 'My site'

  const refresh = useCallback(async () => {
    setQueued(await list())
  }, [])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  // Keep the pending strip fresh as the outbox drains.
  useEffect(() => {
    void refresh()
  }, [pending, refresh])

  const enqueueCapture = useCallback(
    async (media: CaptureBody['media'], extras: Partial<CaptureBody> = {}) => {
      const body: CaptureBody = {
        type: kind,
        site_id: siteId,
        media,
        created_at: new Date().toISOString(),
        client_capture_id: newCaptureId(),
        ...extras,
      }
      const label = `${str.kinds[kind]} · ${
        media[0]?.kind === 'voice' ? str.voiceNote : str.photoLabel
      }`
      await enqueue({ label, path: CAPTURE_PATH, method: 'POST', body })
      await refresh()
      // Optimistic confirmation; if online, nudge a drain immediately.
      if (online) void flush()
      Alert.alert('✓', str.queuedToast)
    },
    [kind, siteId, str, refresh, online, flush],
  )

  const onPhoto = useCallback(async () => {
    setBusy(true)
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      let result: ImagePicker.ImagePickerResult
      if (perm.granted) {
        result = await ImagePicker.launchCameraAsync({ quality: 0.7 })
      } else {
        // Fall back to the library if the camera is denied.
        const lib = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (!lib.granted) {
          Alert.alert(str.permTitle, str.permBody)
          return
        }
        result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 })
      }
      if (result.canceled || result.assets.length === 0) return
      await enqueueCapture(
        result.assets.map((a) => ({ kind: 'photo' as const, uri: a.uri })),
      )
    } finally {
      setBusy(false)
    }
  }, [enqueueCapture, str])

  const onVoice = useCallback(async () => {
    // TODO(backend/client): no audio recorder + STT endpoint yet. We still
    // enqueue a voice-note capture with a placeholder local uri so the outbox
    // and "today you've sent" flow are exercised end-to-end. Replace the uri
    // with a real recorded file once an audio client + transcription land.
    const uri = `voice://pending/${newCaptureId()}.m4a`
    await enqueueCapture([{ kind: 'voice', uri }], { transcript: undefined })
  }, [enqueueCapture])

  // Map an outbox item back to its display glyph/label from the enqueued body.
  const captureItems = queued.filter((i) => i.path === CAPTURE_PATH)

  return (
    <Screen>
      {/* Sticky-ish sync indicator at the very top — the trust surface. */}
      <View style={{ marginHorizontal: -SPACE.lg, marginTop: -SPACE.md }}>
        <SyncStatus />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <SiteChip name={siteName} online={online} />
      </View>

      <Display>{str.promise}</Display>

      {/* Tag first (one tap), then the giant capture buttons. */}
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

      {/* "Today you've sent" — a confirmation log, NOT a feed. */}
      <Small muted style={{ letterSpacing: 1, marginTop: SPACE.sm }}>
        {str.sentTitle}
      </Small>
      {captureItems.length === 0 ? (
        <CalmEmpty title={str.emptyTitle} body={str.emptyBody} />
      ) : (
        <Card padded={false} style={{ paddingHorizontal: SPACE.lg }}>
          {captureItems.map((item, i) => {
            const body = item.body as CaptureBody | undefined
            const isVoice = body?.media?.[0]?.kind === 'voice'
            const k = (body?.type ?? 'progress') as CaptureKind
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
                // Queued items are, by definition, not yet filed (they leave the
                // outbox on a successful sync). So everything here is "filing…".
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
