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
 * Voice note: the 🎙 is a REAL hold-to-talk recorder ({@link HoldToTalk}). It
 * records on-device audio to a file URI that becomes the capture's MEDIA, so the
 * backend STT pipeline (transcribe → numeral-repair → extract) runs on real
 * audio. When online we submit immediately to read the transcript back for
 * confirmation (CA1); offline we queue the audio in the outbox and never lose it.
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as Haptics from 'expo-haptics'

import {
  captureSites,
  fetchCaptureExtraction,
  newClientCaptureId,
  submitCapture,
  type CaptureExtraction,
  type CaptureMedia,
} from '../../../src/api/capture'
import type { CaptureKind } from '../../../src/api/supervisor'
import type { Site } from '../../../src/api/types'
import { useT } from '../../../src/i18n/I18nProvider'
import { BodyStrong, Button, Card, Display, EmptyState, Eyebrow, Screen, Small, SyncStatus, useToast } from '../../../src/ui'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { useAuth } from '../../../src/auth/AuthContext'
import { loadCachedSites, loadCaptureSites, type SiteSource } from '../../../src/offline/siteCache'
import { refusalText } from '../../../src/api/errorText'
import { HoldToTalk, TranscriptConfirm, type RecordedAudio } from '../../../src/audio'
import { useOutbox } from '../../../src/offline/useOutbox'
import {
  deleteFailed,
  enqueue,
  list,
  listFailed,
  retryFailed,
  type FailedItem,
  type OutboxItem,
} from '../../../src/offline/outbox'
import {
  CaptureBar,
  KindChipRow,
  KIND_GLYPH,
  SentRow,
  SiteChip,
  SPACE,
} from '../../../src/screens/supervisor/components'

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
    photoLabel: 'Photo',
    permTitle: 'Camera needed',
    permBody: 'Allow camera/photos to send a site photo.',
    micPermTitle: 'Microphone needed',
    micPermBody: 'Allow the microphone to record a voice note.',
    noSite: 'No site assigned yet — ask your PM.',
    offlineNoSites: "You're offline. Your sites will load when you're back online.",
    tapSite: 'tap to switch site',
    recording: 'Recording… release to send',
    tooShort: 'Too short — hold the mic and speak.',
    listening: 'Heard you — filing the audio…',
    heardTitle: "Here's what I heard",
    unsure: "Not fully sure — please check the number.",
    confirm: 'Confirm',
    fix: 'Fix the number',
    dismiss: 'Looks right',
    headcountLabel: 'People',
    quantityLabel: 'Quantity',
    amountLabel: 'Amount ₹',
    failedTitle: "COULDN'T SEND",
    failedHint: 'The server refused these. Retry once the problem is fixed, or delete them.',
    retry: 'Retry',
    delete: 'Delete',
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
    micPermTitle: 'माइक चाहिए',
    micPermBody: 'आवाज़ नोट रिकॉर्ड करने के लिए माइक की अनुमति दें।',
    noSite: 'अभी कोई साइट असाइन नहीं हुई — PM से पूछो।',
    offlineNoSites: 'आप ऑफ़लाइन हैं। ऑनलाइन होते ही आपकी साइटें आ जाएँगी।',
    tapSite: 'साइट बदलने के लिए दबाएँ',
    recording: 'रिकॉर्ड हो रहा… छोड़ो तो भेज देंगे',
    tooShort: 'बहुत छोटा — माइक दबाकर बोलो।',
    listening: 'सुन लिया — आवाज़ फ़ाइल हो रही…',
    heardTitle: 'मैंने यह सुना',
    unsure: 'पक्का नहीं — गिनती जाँच लें।',
    confirm: 'ठीक है',
    fix: 'गिनती बदलो',
    dismiss: 'सही है',
    headcountLabel: 'आदमी',
    quantityLabel: 'मात्रा',
    amountLabel: 'रकम ₹',
    failedTitle: 'नहीं भेजे जा सके',
    failedHint: 'सर्वर ने इन्हें मना कर दिया। दिक्कत ठीक होने पर फिर भेजें, या हटा दें।',
    retry: 'फिर भेजें',
    delete: 'हटाएँ',
  },
} as const

function mediaFromAsset(a: ImagePicker.ImagePickerAsset): CaptureMedia {
  const name = a.fileName ?? a.uri.split('/').pop() ?? `photo_${Date.now()}.jpg`
  return { uri: a.uri, name, mime: a.mimeType ?? 'image/jpeg' }
}

export default function Capture() {
  const { lang } = useT()
  const { me } = useAuth()
  const userId = me?.id ?? null
  const { online, pending, failed: failedCount, flush } = useOutbox()
  const toast = useToast()
  const str = STR[lang]

  const [kind, setKind] = useState<CaptureKind>('progress')
  const [busy, setBusy] = useState(false)
  const [queued, setQueued] = useState<OutboxItem[]>([])
  const [failed, setFailed] = useState<FailedItem[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [siteSource, setSiteSource] = useState<SiteSource | null>(null)
  const [siteIdx, setSiteIdx] = useState(0)

  // Transcript-back / numeral-confirm (CA1). `voicePending` shows the chip in
  // its "listening" state; `extraction` fills it once the transcript lands.
  const [voicePending, setVoicePending] = useState(false)
  const [extraction, setExtraction] = useState<CaptureExtraction | null>(null)

  // Resolve the supervisor's assigned site(s) for a real capture target. The
  // last good list is shown at once (and kept if the fetch fails offline), so
  // an offline start still knows the site (T9). Re-run when back online.
  useEffect(() => {
    let live = true
    if (userId) {
      void loadCachedSites(userId).then((cached) => {
        if (live && cached && cached.length > 0) {
          setSites((cur) => (cur.length ? cur : cached))
          setSiteSource((cur) => cur ?? 'cache')
        }
      })
    }
    void loadCaptureSites(userId, captureSites).then((res) => {
      if (!live) return
      // A failed fetch with nothing cached keeps whatever is already showing.
      if (res.source === 'unavailable') {
        setSiteSource((cur) => cur ?? 'unavailable')
        return
      }
      setSites(res.sites)
      setSiteSource(res.source)
    })
    return () => {
      live = false
    }
  }, [userId, online])
  const site = sites[siteIdx]
  // No site to show: offline with nothing cached is not "no site assigned".
  const noSiteText = siteSource === 'unavailable' ? str.offlineNoSites : str.noSite

  const refresh = useCallback(async () => {
    const [q, f] = await Promise.all([list(), listFailed()])
    setQueued(q)
    setFailed(f)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )
  useEffect(() => {
    void refresh()
  }, [pending, failedCount, refresh])

  const onRetryFailed = useCallback(
    async (id: string) => {
      await retryFailed(id)
      await refresh()
      void flush()
    },
    [refresh, flush],
  )

  const onDeleteFailed = useCallback(
    async (id: string) => {
      await deleteFailed(id)
      await refresh()
    },
    [refresh],
  )

  const enqueueCapture = useCallback(
    async (media: CaptureMedia | null, text?: string, clientCaptureId?: string) => {
      if (!site) {
        Alert.alert('•', noSiteText)
        return
      }
      const label = `${str.kinds[kind]} · ${media ? str.photoLabel : str.voiceNote}`
      await enqueue({
        label,
        path: CAPTURE_PATH,
        method: 'POST',
        capture: {
          site_id: site.id,
          type: kind,
          text: text ?? null,
          media,
          client_capture_id: clientCaptureId ?? newClientCaptureId(),
        },
      })
      await refresh()
      if (online) void flush() // optimistic: nudge a drain immediately
      // The SentRow list below already shows the queued item, so a blocking
      // OS Alert adds nothing — a calm toast + success haptic is the ack.
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      toast(str.queuedToast)
    },
    [kind, site, str, noSiteText, refresh, online, flush, toast],
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

  // A REAL recording finished. The audio file is the capture's MEDIA so the
  // backend STT path runs on real audio. Try-send-then-queue: when online, POST
  // immediately to read the transcript back for confirmation (CA1); on any
  // failure (offline/error) fall back to the durable outbox so we NEVER lose it.
  const onRecorded = useCallback(
    async (audio: RecordedAudio) => {
      if (!site) {
        Alert.alert('•', noSiteText)
        return
      }
      const media: CaptureMedia = { uri: audio.uri, name: audio.name, mime: audio.mime }
      // One id for this capture, used by the immediate try AND any queued
      // retry: a send whose response was lost must not be filed twice (T9).
      const clientCaptureId = newClientCaptureId()
      const payload = { site_id: site.id, type: kind, text: null, media, client_capture_id: clientCaptureId }

      if (!online) {
        // Offline: queue the audio; the outbox replays it via submitCapture.
        await enqueueCapture(media, undefined, clientCaptureId)
        return
      }

      setVoicePending(true)
      setExtraction(null)
      try {
        const res = await submitCapture(payload)
        await refresh()
        // Poll the events feed for what the AI heard (best-effort, non-blocking).
        const heard = await fetchCaptureExtraction(site.id, res.raw_message_id)
        if (heard) setExtraction(heard)
        else setVoicePending(false) // transcript not back in budget — drop the chip
      } catch {
        // Network/server hiccup mid-send → don't lose the audio: queue it
        // under the same id, so if the first send did land it isn't doubled.
        setVoicePending(false)
        await enqueueCapture(media, undefined, clientCaptureId)
      }
    },
    [site, kind, str, noSiteText, online, enqueueCapture, refresh],
  )

  const onMicDenied = useCallback(() => {
    Alert.alert(str.micPermTitle, str.micPermBody)
  }, [str])

  const dismissTranscript = useCallback(() => {
    setVoicePending(false)
    setExtraction(null)
  }, [])

  // Human commits. If they CORRECTED the numeral, file a short text capture with
  // the corrected value so the record reflects the human's number, not the
  // mis-heard one (the AI's event already landed; this is the authoritative
  // follow-up). If unchanged, just dismiss — nothing to add.
  const onConfirmTranscript = useCallback(
    async (corrected: number | null) => {
      const heardValue = extraction?.numeral?.value ?? null
      if (corrected != null && heardValue != null && corrected !== heardValue) {
        await enqueueCapture(null, `Correction: ${corrected} (heard ${heardValue})`)
      }
      dismissTranscript()
    },
    [extraction, enqueueCapture, dismissTranscript],
  )

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
          <SiteChip name={site?.name ?? noSiteText} online={online} />
        </Pressable>
      </View>

      <Display>{str.promise}</Display>

      <Small muted>{str.tagPrompt}</Small>
      <KindChipRow value={kind} labels={str.kinds} onChange={setKind} />

      <CaptureBar
        photoLabel={str.photo}
        busy={busy}
        onPhoto={() => void onPhoto()}
        voiceSlot={
          <HoldToTalk
            label={str.voice}
            hint={str.voiceHint}
            recordingLabel={str.recording}
            tooShortLabel={str.tooShort}
            permLabel={str.micPermBody}
            disabled={busy}
            onRecorded={(audio) => void onRecorded(audio)}
            onPermissionDenied={onMicDenied}
          />
        }
      />

      {/* Transcript-back + numeral-confirm — AI proposes, human commits (CA1). */}
      {voicePending ? (
        <TranscriptConfirm
          extraction={extraction}
          str={{
            listening: str.listening,
            heardTitle: str.heardTitle,
            unsure: str.unsure,
            confirm: str.confirm,
            fix: str.fix,
            dismiss: str.dismiss,
            headcountLabel: str.headcountLabel,
            quantityLabel: str.quantityLabel,
            amountLabel: str.amountLabel,
          }}
          onConfirm={(v) => void onConfirmTranscript(v)}
          onDismiss={dismissTranscript}
        />
      ) : null}

      {/* Refused by the server for good (T9): kept with the reason, never dropped. */}
      {failed.length > 0 ? (
        <>
          <Eyebrow style={{ marginTop: SPACE.sm }}>{str.failedTitle}</Eyebrow>
          <Small muted>{str.failedHint}</Small>
          <Card padded={false} style={{ paddingHorizontal: SPACE.lg }}>
            {failed.map((f, i) => (
              <FailedRow
                key={f.item.id}
                f={f}
                reason={refusalText(f.status, f.code, lang)}
                retryLabel={str.retry}
                deleteLabel={str.delete}
                isLast={i === failed.length - 1}
                onRetry={() => void onRetryFailed(f.item.id)}
                onDelete={() => void onDeleteFailed(f.item.id)}
              />
            ))}
          </Card>
        </>
      ) : null}

      <Eyebrow style={{ marginTop: SPACE.sm }}>{str.sentTitle}</Eyebrow>
      {captureItems.length === 0 ? (
        <EmptyState variant="empty" title={str.emptyTitle} body={str.emptyBody} />
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

function FailedRow({
  f,
  reason,
  retryLabel,
  deleteLabel,
  isLast,
  onRetry,
  onDelete,
}: {
  f: FailedItem
  reason: string
  retryLabel: string
  deleteLabel: string
  isLast: boolean
  onRetry: () => void
  onDelete: () => void
}) {
  const { theme } = useTheme()
  const time = new Date(f.item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <View
      style={{
        gap: SPACE.xs,
        paddingVertical: SPACE.md,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: theme.colors.line,
      }}
    >
      <BodyStrong numberOfLines={1}>{f.item.label}</BodyStrong>
      <Small muted>{time}</Small>
      <Small color={theme.colors.risk}>{reason}</Small>
      <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs }}>
        <Button title={retryLabel} variant="secondary" size="md" onPress={onRetry} />
        <Button title={deleteLabel} variant="ghost" size="md" onPress={onDelete} />
      </View>
    </View>
  )
}
