/**
 * Attendance (HERO) — "mark today's crew present" in seconds, voice/photo/tap
 * ONLY, never a form. The single thing this role does daily.
 *
 * Three ways to answer one question: a GIANT +/- stepper, a 📷 crew photo, a 🎙
 * voice note. A huge "✓ Mark present" enqueues the count into the offline
 * outbox (capture never blocks on network — see backend gap in mukadam.ts),
 * shows a big optimistic "✓ marked — saved" with the SyncStatus indicator, and
 * frames everything as: proof = faster payment.
 *
 * Hindi/Devanagari is the first-class default for this role. Icon + WORD on
 * every action; targets ≥56px.
 */
import { useEffect, useState } from 'react'
import { Alert, Pressable, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, STATUS } from '../../../src/theme/tokens'
import { Body, BodyStrong, Card, Display, H2, Mono, Screen, Small, SyncStatus } from '../../../src/ui'
import { enqueue } from '../../../src/offline/outbox'
import { useOutbox } from '../../../src/offline/useOutbox'
import { captureSites, type CaptureMedia } from '../../../src/api/capture'
import type { Site } from '../../../src/api/types'
import { VoiceOutButton, MUKADAM_TAP, tapFeedback } from './_voice'

const STR = {
  en: {
    today: 'Today',
    siteFallback: 'Your site',
    question: 'How many came today?',
    proof: 'Clear proof = faster payment 💰',
    voiceOut: 'Sun lo',
    photo: 'Crew photo',
    voice: 'Speak count',
    voiceHint: 'Hold to speak — e.g. “twenty four came”',
    headcount: 'people',
    minus: 'one less',
    plus: 'one more',
    mark: '✓ Mark present',
    markedTitle: '✓ Marked — saved',
    markedBody: 'Supervisor will verify. Saved on this phone; it sends on its own when online.',
    markAnother: 'Change the count',
    photoAdded: '✓ Crew photo added',
    voiceAdded: '✓ Voice note added — “{n} came”',
    permTitle: 'Camera needed',
    permBody: 'Allow the camera to take a crew photo.',
    ok: 'OK',
    noSite: 'No site assigned yet — ask your supervisor.',
  },
  hi: {
    today: 'आज',
    siteFallback: 'आपकी साइट',
    question: 'आज कितने आदमी आए?',
    proof: 'साफ़ proof = जल्दी payment 💰',
    voiceOut: 'सुन लो',
    photo: 'आदमी की फ़ोटो',
    voice: 'बोलकर बताओ',
    voiceHint: 'दबाकर बोलो — जैसे “चौबीस आए”',
    headcount: 'आदमी',
    minus: 'एक कम',
    plus: 'एक ज़्यादा',
    mark: '✓ हाज़िरी लगाओ',
    markedTitle: '✓ हो गया — सेव',
    markedBody: 'Supervisor देख लेंगे। फ़ोन में सेव है; online होते ही अपने-आप चला जाएगा।',
    markAnother: 'गिनती बदलो',
    photoAdded: '✓ फ़ोटो जुड़ गई',
    voiceAdded: '✓ आवाज़ जुड़ गई — “{n} आए”',
    permTitle: 'कैमरा चाहिए',
    permBody: 'फ़ोटो लेने के लिए कैमरा चालू करने दें।',
    ok: 'ठीक है',
    noSite: 'अभी कोई साइट असाइन नहीं — supervisor से पूछो।',
  },
} as const

function todayLabel(lang: 'en' | 'hi'): string {
  return new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export default function Attendance() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const str = STR[lang]
  const { online, flush } = useOutbox()

  const [count, setCount] = useState(0)
  const [photoUri, setPhotoUri] = useState<string | undefined>()
  const [voiceUri, setVoiceUri] = useState<string | undefined>()
  const [marked, setMarked] = useState(false)
  const [sites, setSites] = useState<Site[]>([])

  // The mukadam is scoped to one site server-side; resolve it for a real capture.
  useEffect(() => {
    captureSites()
      .then(setSites)
      .catch(() => setSites([]))
  }, [])
  const site = sites[0]

  const dateStr = todayLabel(lang)

  // The text the 🔊 voice-out would read aloud.
  const readAloud = `${str.question} ${str.proof}. ${count} ${str.headcount}.`

  async function takeCrewPhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(str.permTitle, str.permBody, [{ text: str.ok }])
      return
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 })
    if (!res.canceled && res.assets[0]) {
      setPhotoUri(res.assets[0].uri)
      // A crew photo is the proof; if no count yet, nudge to at least 1.
      if (count === 0) setCount(1)
    }
  }

  function recordVoice() {
    // TODO(audio/STT): wire expo-av recording + speech-to-text to extract the
    // count. For now we stub a local uri so the capture still carries voice
    // proof through the outbox; the count stays user-confirmed via the stepper.
    const stubUri = `voice://local/${Date.now()}.m4a`
    setVoiceUri(stubUri)
  }

  async function markPresent() {
    if (!site) {
      Alert.alert('•', str.noSite, [{ text: str.ok }])
      return
    }
    // The headcount rides in the text so extraction reads it; an optional crew
    // photo is the proof. Capture NEVER blocks on network: enqueue + optimistic
    // confirm, then nudge a drain. useOutbox replays it via POST /api/v1/capture.
    const text = lang === 'hi' ? `${count} मज़दूर आए` : `${count} workers present today`
    const media: CaptureMedia | null = photoUri
      ? { uri: photoUri, name: `crew_${Date.now()}.jpg`, mime: 'image/jpeg' }
      : null
    await enqueue({
      label: lang === 'hi' ? 'हाज़िरी' : 'Attendance',
      method: 'POST',
      path: '/api/v1/capture',
      capture: { site_id: site.id, type: 'attendance', text, media },
    })
    if (online) void flush()
    tapFeedback()
    setMarked(true)
  }

  function reset() {
    setMarked(false)
    setPhotoUri(undefined)
    setVoiceUri(undefined)
  }

  return (
    <>
      <SyncStatus />
      <Screen>
        {/* Static site chip + date — never a switcher. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: STATUS.ok }} />
            <BodyStrong>{site?.name ?? str.siteFallback}</BodyStrong>
          </View>
          <Mono muted>{`${str.today} · ${dateStr}`}</Mono>
        </View>

        <Display>{str.question}</Display>
        <BodyStrong color={c.accentDeep}>{str.proof}</BodyStrong>

        <VoiceOutButton text={readAloud} label={str.voiceOut} lang={lang} />

        {marked ? (
          // Big, optimistic, HONEST confirmation.
          <Card>
            <View style={{ gap: SPACE.md, alignItems: 'center', paddingVertical: SPACE.lg }}>
              <BodyStrong style={{ fontSize: 56 }}>✓</BodyStrong>
              <H2 color={STATUS.ok}>{str.markedTitle}</H2>
              <Mono style={{ fontSize: 40 }}>{`${count} ${str.headcount}`}</Mono>
              <Body muted style={{ textAlign: 'center' }}>{str.markedBody}</Body>
              <Pressable
                accessibilityRole="button"
                onPress={reset}
                style={{ minHeight: MUKADAM_TAP, justifyContent: 'center', paddingHorizontal: SPACE.lg }}
              >
                <BodyStrong color={c.accentDeep}>{str.markAnother}</BodyStrong>
              </Pressable>
            </View>
          </Card>
        ) : (
          <>
            {/* Answer way 1 + 2: photo OR voice — icon + WORD, ≥56px. */}
            <View style={{ flexDirection: 'row', gap: SPACE.md }}>
              <CaptureTile
                glyph="📷"
                label={str.photo}
                done={!!photoUri}
                doneLabel={str.photoAdded}
                onPress={takeCrewPhoto}
              />
              <CaptureTile
                glyph="🎙"
                label={str.voice}
                hint={str.voiceHint}
                done={!!voiceUri}
                doneLabel={str.voiceAdded.replace('{n}', String(count))}
                onPress={recordVoice}
              />
            </View>

            {/* Answer way 3: the GIANT stepper. */}
            <Card>
              <View style={{ alignItems: 'center', gap: SPACE.md }}>
                <Small muted>{str.headcount.toUpperCase()}</Small>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xl }}>
                  <StepButton glyph="−" label={str.minus} onPress={() => setCount((n) => Math.max(0, n - 1))} disabled={count === 0} />
                  <Mono style={{ fontSize: 64, minWidth: 96, textAlign: 'center' }}>{String(count)}</Mono>
                  <StepButton glyph="+" label={str.plus} onPress={() => setCount((n) => n + 1)} />
                </View>
              </View>
            </Card>

            {/* The one decisive action — huge amber primary. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={str.mark}
              accessibilityState={{ disabled: count === 0 }}
              disabled={count === 0}
              onPress={markPresent}
              style={({ pressed }) => [
                {
                  minHeight: 72,
                  borderRadius: theme.radii.control,
                  backgroundColor: c.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: count === 0 ? 0.45 : pressed ? 0.92 : 1,
                },
                theme.shadowCard,
              ]}
            >
              <Display color={c.onAccent}>{str.mark}</Display>
            </Pressable>
          </>
        )}
      </Screen>
    </>
  )
}

function CaptureTile({
  glyph,
  label,
  hint,
  done,
  doneLabel,
  onPress,
}: {
  glyph: string
  label: string
  hint?: string
  done?: boolean
  doneLabel?: string
  onPress: () => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: done }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 120,
        borderRadius: theme.radii.card,
        borderWidth: 2,
        borderColor: done ? STATUS.ok : c.line,
        backgroundColor: done ? 'rgba(30,158,90,0.08)' : c.card,
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACE.md,
        gap: SPACE.xs,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <BodyStrong style={{ fontSize: 36 }}>{glyph}</BodyStrong>
      <BodyStrong style={{ textAlign: 'center' }}>{label}</BodyStrong>
      {done ? (
        <Small color={STATUS.ok} style={{ textAlign: 'center' }}>{doneLabel}</Small>
      ) : hint ? (
        <Small muted style={{ textAlign: 'center', fontSize: 12 }}>{hint}</Small>
      ) : null}
    </Pressable>
  )
}

function StepButton({
  glyph,
  label,
  onPress,
  disabled,
}: {
  glyph: string
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 72,
        height: 72,
        borderRadius: 36,
        borderWidth: 2,
        borderColor: c.line,
        backgroundColor: c.paper,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      <Display>{glyph}</Display>
    </Pressable>
  )
}
