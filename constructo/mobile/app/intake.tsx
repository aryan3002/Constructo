/**
 * Design Intake — a 3-step homeowner onboarding stepper.
 *
 *   1. Visual preference grid (pick ≥1 style → fire-and-forget selections)
 *   2. Upload reference photos (ImagePicker → homeowner.references)
 *   3. AI-drafted design profile (PUT empty body → review / adjust / confirm)
 *
 * This is a ROOT route (outside the homeowner tab group), so it self-provides
 * the Daylight theme and self-guards auth.
 */
import { useEffect, useState } from 'react'
import { Image, Pressable, TextInput, View } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { useMutation } from '@tanstack/react-query'

import { homeowner, request } from '../src/api/client'
import type { DesignProfile } from '../src/api/types'
import { useAuth } from '../src/auth/AuthContext'
import { useT } from '../src/i18n/I18nProvider'
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider'
import { SPACE, TAP } from '../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  CalmCard,
  Card,
  Display,
  H2,
  Screen,
  Small,
} from '../src/ui'
import {
  profileText,
  profileTone,
  STYLE_OPTIONS,
  type Lang,
} from './_intake.util'

// ---- copy ----------------------------------------------------------------
const STR = {
  en: {
    skip: '✕ Skip for now',
    step: 'Step {n} of 3',
    // step 1
    s1Title: 'What feels like home?',
    s1Body: 'Pick the looks you love. There are no wrong answers — choose as many as you like.',
    // step 2
    s2Title: 'Show us your inspiration',
    s2Body: 'Add photos that capture the feeling you are going for. You can always add more later.',
    addPhotos: 'Add photos',
    photosCount: '{n} photo(s) added',
    // step 3
    s3Title: 'Here is your design vibe',
    s3Body: 'We drafted this from your choices. Does it feel like you?',
    drafting: 'Crafting your design profile…',
    profileError: 'We could not draft your profile just now.',
    retry: 'Try again',
    feelsRight: 'This feels right',
    adjust: 'Adjust',
    save: 'Save changes',
    voice: '🎙️ Describe it in your words',
    // nav
    back: 'Back',
    continue: 'Continue',
    skipStep: 'Skip',
    finish: 'Finish',
  },
  hi: {
    skip: '✕ अभी छोड़ें',
    step: 'चरण {n} / 3',
    s1Title: 'घर जैसा क्या लगता है?',
    s1Body: 'जो रूप आपको पसंद हों उन्हें चुनें। कोई गलत जवाब नहीं — जितने चाहें चुनें।',
    s2Title: 'अपनी प्रेरणा दिखाएँ',
    s2Body: 'ऐसी तस्वीरें जोड़ें जो आपकी पसंद की भावना दर्शाती हों। बाद में और जोड़ सकते हैं।',
    addPhotos: 'तस्वीरें जोड़ें',
    photosCount: '{n} तस्वीर(ें) जोड़ी गईं',
    s3Title: 'यह रहा आपका डिज़ाइन अंदाज़',
    s3Body: 'हमने इसे आपकी पसंद से तैयार किया है। क्या यह आपके जैसा लगता है?',
    drafting: 'आपका डिज़ाइन प्रोफ़ाइल तैयार हो रहा है…',
    profileError: 'अभी हम आपका प्रोफ़ाइल तैयार नहीं कर सके।',
    retry: 'फिर कोशिश करें',
    feelsRight: 'यह सही लगता है',
    adjust: 'बदलें',
    save: 'बदलाव सहेजें',
    voice: '🎙️ अपने शब्दों में बताएँ',
    back: 'पीछे',
    continue: 'आगे बढ़ें',
    skipStep: 'छोड़ें',
    finish: 'पूरा करें',
  },
} as const

function fmt(tpl: string, n: number): string {
  return tpl.replace('{n}', String(n))
}

// ---- screen entry: self-provide theme + guard auth -----------------------
export default function IntakeRoute() {
  return (
    <ThemeProvider initial="daylight">
      <IntakeGuard />
    </ThemeProvider>
  )
}

function IntakeGuard() {
  const { status } = useAuth()
  if (status === 'guest') return <Redirect href="/(auth)/login" />
  return <IntakeFlow />
}

// ---- the flow ------------------------------------------------------------
function IntakeFlow() {
  const router = useRouter()
  const { lang } = useT()
  const L: Lang = lang === 'hi' ? 'hi' : 'en'
  const tx = STR[L]

  const [step, setStep] = useState<1 | 2 | 3>(1)

  // step 1 — style selections
  const [selected, setSelected] = useState<string[]>([])

  // step 2 — reference thumbnails (local)
  const [photos, setPhotos] = useState<string[]>([])

  // step 3 — profile editing
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  // PUT empty body → AI-drafted profile
  const profileMut = useMutation<DesignProfile>({
    mutationFn: () =>
      request<DesignProfile>('/api/v1/homeowner/design/profile', {
        method: 'PUT',
        body: JSON.stringify({}),
      }),
  })

  // PUT confirmed/adjusted profile
  const saveMut = useMutation<DesignProfile, unknown, { profile: string; tone: string }>({
    mutationFn: (vars) =>
      request<DesignProfile>('/api/v1/homeowner/design/profile', {
        method: 'PUT',
        body: JSON.stringify({ profile: { profile: vars.profile, tone: vars.tone } }),
      }),
  })

  const text = profileText(profileMut.data)
  const tone = profileTone(profileMut.data)

  // Draft the AI profile the first time we land on step 3.
  useEffect(() => {
    if (step === 3 && !profileMut.data && !profileMut.isPending && !profileMut.isError) {
      profileMut.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  function toggleStyle(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  function goToStep2() {
    // Fire-and-forget a selection per pick — don't block the UI.
    for (const choice of selected) {
      void request('/api/v1/homeowner/design/selections', {
        method: 'POST',
        body: JSON.stringify({ item: 'style', choice }),
      }).catch(() => undefined)
    }
    setStep(2)
  }

  async function pickPhotos() {
    const res = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      quality: 0.8,
    })
    if (res.canceled) return
    const uris = res.assets.map((a) => a.uri)
    setPhotos((prev) => [...prev, ...uris])
    // Persist each reference (fire-and-forget; thumbnails are already shown).
    for (const image_url of uris) {
      void homeowner.references({ image_url, source: 'upload' }).catch(() => undefined)
    }
  }

  function finish() {
    router.replace('/(homeowner)/design')
  }

  function startAdjust() {
    setDraft(text)
    setEditing(true)
  }

  function saveAdjusted() {
    saveMut.mutate(
      { profile: draft, tone },
      { onSuccess: () => finish() },
    )
  }

  return (
    <Screen>
      {/* top bar: skip-for-now */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.replace('/(homeowner)/home')}
          style={{ minHeight: TAP, justifyContent: 'center' }}
        >
          <Small muted>{tx.skip}</Small>
        </Pressable>
      </View>

      <ProgressBar step={step} label={fmt(tx.step, step)} />

      {step === 1 ? (
        <StepStyles
          tx={tx}
          L={L}
          selected={selected}
          onToggle={toggleStyle}
          onContinue={goToStep2}
        />
      ) : null}

      {step === 2 ? (
        <StepReferences
          tx={tx}
          photos={photos}
          onAdd={pickPhotos}
          onBack={() => setStep(1)}
          onContinue={() => setStep(3)}
        />
      ) : null}

      {step === 3 ? (
        <StepProfile
          tx={tx}
          loading={profileMut.isPending}
          error={profileMut.isError}
          text={text}
          editing={editing}
          draft={draft}
          setDraft={setDraft}
          saving={saveMut.isPending}
          onRetry={() => profileMut.mutate()}
          onFeelsRight={finish}
          onAdjust={startAdjust}
          onSave={saveAdjusted}
          onBack={() => setStep(2)}
        />
      ) : null}
    </Screen>
  )
}

// ---- progress indicator --------------------------------------------------
function ProgressBar({ step, label }: { step: number; label: string }) {
  const { theme } = useTheme()
  return (
    <View style={{ gap: SPACE.xs }}>
      <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              backgroundColor: i <= step ? theme.colors.accent : theme.colors.line,
            }}
          />
        ))}
      </View>
      <Small muted>{label}</Small>
    </View>
  )
}

// ---- step 1 --------------------------------------------------------------
type Tx = { [K in keyof (typeof STR)['en']]: string }

function StepStyles({
  tx,
  L,
  selected,
  onToggle,
  onContinue,
}: {
  tx: Tx
  L: Lang
  selected: string[]
  onToggle: (key: string) => void
  onContinue: () => void
}) {
  const { theme } = useTheme()
  return (
    <View style={{ gap: SPACE.lg }}>
      <View style={{ gap: SPACE.xs }}>
        <Display>{tx.s1Title}</Display>
        <Body muted>{tx.s1Body}</Body>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md }}>
        {STYLE_OPTIONS.map((opt) => {
          const isOn = selected.includes(opt.key)
          return (
            <Pressable
              key={opt.key}
              accessibilityRole="button"
              accessibilityState={{ selected: isOn }}
              onPress={() => onToggle(opt.key)}
              style={{ width: '47%' }}
            >
              <Card
                style={{
                  borderColor: isOn ? theme.colors.accent : theme.colors.line,
                  borderWidth: isOn ? 2 : 1,
                  minHeight: 96,
                  justifyContent: 'space-between',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <Body>{opt.glyph}</Body>
                  {isOn ? (
                    <Body color={theme.colors.accent} style={{ fontWeight: '700' }}>
                      ✓
                    </Body>
                  ) : null}
                </View>
                <BodyStrong style={{ marginTop: SPACE.sm }}>{opt.label[L]}</BodyStrong>
              </Card>
            </Pressable>
          )
        })}
      </View>

      <Button
        title={tx.continue}
        block
        size="lg"
        disabled={selected.length === 0}
        onPress={onContinue}
      />
    </View>
  )
}

// ---- step 2 --------------------------------------------------------------
function StepReferences({
  tx,
  photos,
  onAdd,
  onBack,
  onContinue,
}: {
  tx: Tx
  photos: string[]
  onAdd: () => void
  onBack: () => void
  onContinue: () => void
}) {
  const { theme } = useTheme()
  return (
    <View style={{ gap: SPACE.lg }}>
      <View style={{ gap: SPACE.xs }}>
        <Display>{tx.s2Title}</Display>
        <Body muted>{tx.s2Body}</Body>
      </View>

      <Button title={tx.addPhotos} variant="secondary" block onPress={onAdd} />

      {photos.length > 0 ? (
        <View style={{ gap: SPACE.sm }}>
          <Small muted>{fmt(tx.photosCount, photos.length)}</Small>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
            {photos.map((uri, i) => (
              <Image
                key={`${uri}-${i}`}
                source={{ uri }}
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: theme.radii.card,
                  backgroundColor: theme.colors.line,
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: SPACE.md }}>
        <Button title={tx.back} variant="ghost" onPress={onBack} />
        <View style={{ flex: 1 }} />
        <Button title={tx.skipStep} variant="ghost" onPress={onContinue} />
        <Button title={tx.continue} onPress={onContinue} />
      </View>
    </View>
  )
}

// ---- step 3 --------------------------------------------------------------
function StepProfile({
  tx,
  loading,
  error,
  text,
  editing,
  draft,
  setDraft,
  saving,
  onRetry,
  onFeelsRight,
  onAdjust,
  onSave,
  onBack,
}: {
  tx: Tx
  loading: boolean
  error: boolean
  text: string
  editing: boolean
  draft: string
  setDraft: (s: string) => void
  saving: boolean
  onRetry: () => void
  onFeelsRight: () => void
  onAdjust: () => void
  onSave: () => void
  onBack: () => void
}) {
  const { theme } = useTheme()
  return (
    <View style={{ gap: SPACE.lg }}>
      <View style={{ gap: SPACE.xs }}>
        <Display>{tx.s3Title}</Display>
        <Body muted>{tx.s3Body}</Body>
      </View>

      {loading ? (
        <Card>
          <Body muted>{tx.drafting}</Body>
        </Card>
      ) : null}

      {error && !loading ? (
        <Card>
          <View style={{ gap: SPACE.md }}>
            <Small color={theme.colors.risk}>{tx.profileError}</Small>
            <Button title={tx.retry} variant="secondary" onPress={onRetry} />
          </View>
        </Card>
      ) : null}

      {!loading && !error ? (
        <>
          <CalmCard title={tx.s3Title} status="ok">
            {editing ? (
              <TextInput
                multiline
                value={draft}
                onChangeText={setDraft}
                style={{
                  minHeight: 140,
                  textAlignVertical: 'top',
                  color: theme.colors.text,
                  fontSize: 16,
                  lineHeight: 24,
                  borderWidth: 1,
                  borderColor: theme.colors.line,
                  borderRadius: theme.radii.control,
                  padding: SPACE.md,
                }}
              />
            ) : (
              <Body>{text}</Body>
            )}
          </CalmCard>

          {/* voice affordance stub — capture lands later */}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              // TODO(voice): wire up voice capture of the design profile.
            }}
            style={{ minHeight: TAP, justifyContent: 'center' }}
          >
            <Small muted>{tx.voice}</Small>
          </Pressable>

          {editing ? (
            <Button title={tx.save} block size="lg" loading={saving} onPress={onSave} />
          ) : (
            <View style={{ gap: SPACE.md }}>
              <Button title={tx.feelsRight} block size="lg" onPress={onFeelsRight} />
              <Button title={tx.adjust} block variant="secondary" onPress={onAdjust} />
            </View>
          )}
        </>
      ) : null}

      <Button title={tx.back} variant="ghost" onPress={onBack} />
    </View>
  )
}
