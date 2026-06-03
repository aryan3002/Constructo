/**
 * Design Intake — a 3-step homeowner onboarding stepper, plus an owners-only
 * "who designs" sub-step at the end (Step 4).
 *
 *   1. Visual preference grid (pick ≥1 style → fire-and-forget selections)
 *   2. Upload reference photos (ImagePicker → homeowner.references)
 *   3. AI-drafted design profile (PUT empty body → review / adjust / confirm)
 *   4. Who gets a design say (owners only) → writes via PATCH /members/{id}/manage
 *
 * This is a ROOT route (outside the homeowner tab group), so it self-provides
 * the Daylight theme and self-guards auth.
 *
 * Entry: welcome.tsx → household.tsx → this screen (or direct deep-link).
 * Exit:  finish/skip → /(homeowner)/home (with L3 empty-state copy shown there).
 *
 * Calm Cockpit (§5): a clean step indicator, the real-photo preference grid,
 * and a Step-3 AI profile card with a grounding/"Reviewed" feel + tone pills +
 * honest abstention when inputs are sparse. Premium Feather icons, warm paper,
 * no emoji, no %. Strings stay in the per-screen en/hi pattern.
 */
import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Pressable, TextInput, View } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useMutation, useQuery } from '@tanstack/react-query'

import { homeowner, request } from '../src/api/client'
import type { DesignProfile, HomeownerMember, HomeownerSubRole, Space } from '../src/api/types'
import { useAuth } from '../src/auth/AuthContext'
import { useT } from '../src/i18n/I18nProvider'
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider'
import { AP, SPACE, TAP } from '../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  Card,
  Display,
  Micro,
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
    skip: 'Skip for now',
    step: 'Step {n} of {total}',
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
    s3Eyebrow: 'YOUR DESIGN PROFILE',
    grounded: 'Drafted from your choices',
    drafting: 'Crafting your design profile…',
    profileError: 'We could not draft your profile just now.',
    // Honest abstention when the model has too little to go on (§0 rule 5).
    sparse:
      "We don't have enough to capture your style yet. Pick a few looks or add a photo, and we'll draft it — or describe it in your own words below.",
    retry: 'Try again',
    feelsRight: 'This feels right',
    adjust: 'Adjust',
    save: 'Save changes',
    voice: 'Describe it in your words',
    toneLabel: 'TONE',
    // step 4 — owners only
    s4Title: 'Who else gets a design say?',
    s4Body: 'You can let other household members weigh in on design choices — for the whole home or just one room.',
    noSay: 'No say',
    fullSay: 'Full say',
    oneRoom: 'One room',
    pickRoom: 'Pick a room…',
    saveSay: 'Save & finish',
    savingSay: 'Saving…',
    // nav
    back: 'Back',
    continue: 'Continue',
    skipStep: 'Skip',
    finish: 'Finish',
  },
  hi: {
    skip: 'अभी छोड़ें',
    step: 'चरण {n} / {total}',
    s1Title: 'घर जैसा क्या लगता है?',
    s1Body: 'जो रूप आपको पसंद हों उन्हें चुनें। कोई गलत जवाब नहीं — जितने चाहें चुनें।',
    s2Title: 'अपनी प्रेरणा दिखाएँ',
    s2Body: 'ऐसी तस्वीरें जोड़ें जो आपकी पसंद की भावना दर्शाती हों। बाद में और जोड़ सकते हैं।',
    addPhotos: 'तस्वीरें जोड़ें',
    photosCount: '{n} तस्वीर(ें) जोड़ी गईं',
    s3Title: 'यह रहा आपका डिज़ाइन अंदाज़',
    s3Body: 'हमने इसे आपकी पसंद से तैयार किया है। क्या यह आपके जैसा लगता है?',
    s3Eyebrow: 'आपका डिज़ाइन प्रोफ़ाइल',
    grounded: 'आपकी पसंद से तैयार',
    drafting: 'आपका डिज़ाइन प्रोफ़ाइल तैयार हो रहा है…',
    profileError: 'अभी हम आपका प्रोफ़ाइल तैयार नहीं कर सके।',
    sparse:
      'आपकी पसंद समझने के लिए अभी हमारे पास पर्याप्त नहीं है। कुछ रूप चुनें या एक तस्वीर जोड़ें, फिर हम तैयार करेंगे — या नीचे अपने शब्दों में बताएँ।',
    retry: 'फिर कोशिश करें',
    feelsRight: 'यह सही लगता है',
    adjust: 'बदलें',
    save: 'बदलाव सहेजें',
    voice: 'अपने शब्दों में बताएँ',
    toneLabel: 'अंदाज़',
    s4Title: 'और किसे डिज़ाइन में राय देनी है?',
    s4Body: 'आप अन्य सदस्यों को डिज़ाइन विकल्पों में भाग लेने दे सकते हैं — पूरे घर के लिए या सिर्फ़ एक कमरे के लिए।',
    noSay: 'कोई राय नहीं',
    fullSay: 'पूरी राय',
    oneRoom: 'एक कमरा',
    pickRoom: 'कमरा चुनें…',
    saveSay: 'सेव करें और पूरा करें',
    savingSay: 'सेव हो रहा है…',
    back: 'पीछे',
    continue: 'आगे बढ़ें',
    skipStep: 'छोड़ें',
    finish: 'पूरा करें',
  },
} as const

function fmt(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

type DesignSay = 'none' | 'full' | 'room'
interface MemberSay {
  memberId: string
  say: DesignSay
  spaceId: string | null
}

function isOwnerRole(sr: HomeownerSubRole | null): boolean {
  return sr === 'primary_owner' || sr === 'co_owner'
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
  const { theme } = useTheme()
  const { subRole, siteId, markOnboarded } = useAuth()
  const L: Lang = lang === 'hi' ? 'hi' : 'en'
  const tx = STR[L]
  const skipColor = theme.colors.textMute

  const isOwner = isOwnerRole(subRole)
  const totalSteps = isOwner ? 4 : 3

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // step 1 — style selections
  const [selected, setSelected] = useState<string[]>([])

  // step 2 — reference thumbnails (local)
  const [photos, setPhotos] = useState<string[]>([])

  // step 3 — profile editing
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  // step 4 — design say per non-owner member
  const [memberSays, setMemberSays] = useState<MemberSay[]>([])
  const [savingSay, setSavingSay] = useState(false)
  const [sayError, setSayError] = useState<string | null>(null)

  // Roster for step 4 (owners-only)
  const rosterQ = useQuery({
    queryKey: ['household-roster', siteId],
    queryFn: () => homeowner.roster(siteId ?? undefined),
    enabled: isOwner && step === 4,
  })

  // Property spaces for room picker
  const propertyQ = useQuery({
    queryKey: ['property', siteId],
    queryFn: () => homeowner.property(siteId ?? undefined),
    enabled: isOwner && step === 4,
  })

  const nonOwnerMembers: HomeownerMember[] = (rosterQ.data ?? []).filter(
    (m) => m.sub_role !== 'primary_owner' && m.sub_role !== 'co_owner',
  )
  const spaces: Space[] = propertyQ.data?.spaces ?? []

  // Initialise memberSays when roster loads
  useEffect(() => {
    if (nonOwnerMembers.length > 0 && memberSays.length === 0) {
      setMemberSays(
        nonOwnerMembers.map((m) => ({
          memberId: m.id,
          say: m.can_design ? (m.design_space_id ? 'room' : 'full') : 'none',
          spaceId: m.design_space_id ?? null,
        })),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterQ.data])

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
    for (const image_url of uris) {
      void homeowner.references({ image_url, source: 'upload' }).catch(() => undefined)
    }
  }

  async function finish() {
    await markOnboarded()
    router.replace('/(homeowner)/home')
  }

  function startAdjust() {
    setDraft(text)
    setEditing(true)
  }

  function saveAdjusted() {
    saveMut.mutate(
      { profile: draft, tone },
      {
        onSuccess: () => {
          if (isOwner) {
            setStep(4)
          } else {
            void finish()
          }
        },
      },
    )
  }

  function onStep3Done() {
    if (isOwner) {
      setStep(4)
    } else {
      void finish()
    }
  }

  async function saveDesignSay() {
    setSavingSay(true)
    setSayError(null)
    try {
      await Promise.all(
        memberSays.map((ms) =>
          homeowner.manageMember(ms.memberId, {
            can_design: ms.say !== 'none',
            design_space_id: ms.say === 'room' ? (ms.spaceId ?? null) : null,
          }),
        ),
      )
      await finish()
    } catch {
      setSayError(L === 'hi' ? 'कुछ गड़बड़ हो गई' : 'Something went wrong. Please try again.')
    } finally {
      setSavingSay(false)
    }
  }

  function updateMemberSay(memberId: string, say: DesignSay, spaceId: string | null = null) {
    setMemberSays((prev) =>
      prev.map((ms) => (ms.memberId === memberId ? { ...ms, say, spaceId } : ms)),
    )
  }

  return (
    <Screen>
      {/* top bar: skip-for-now */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tx.skip}
          hitSlop={8}
          onPress={() => void finish()}
          style={{
            minHeight: TAP,
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.xs,
          }}
        >
          <Feather name="x" size={14} color={skipColor} />
          <Small muted>{tx.skip}</Small>
        </Pressable>
      </View>

      <ProgressBar step={step} total={totalSteps} label={fmt(tx.step, { n: step, total: totalSteps })} />

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
          onAdd={() => void pickPhotos()}
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
          tone={tone}
          editing={editing}
          draft={draft}
          setDraft={setDraft}
          saving={saveMut.isPending}
          onRetry={() => profileMut.mutate()}
          onFeelsRight={onStep3Done}
          onAdjust={startAdjust}
          onSave={saveAdjusted}
          onBack={() => setStep(2)}
        />
      ) : null}

      {step === 4 && isOwner ? (
        <StepDesignSay
          tx={tx}
          L={L}
          members={nonOwnerMembers}
          spaces={spaces}
          memberSays={memberSays}
          loading={rosterQ.isLoading}
          saving={savingSay}
          error={sayError}
          onUpdate={updateMemberSay}
          onSave={() => void saveDesignSay()}
          onSkip={() => void finish()}
          onBack={() => setStep(3)}
        />
      ) : null}
    </Screen>
  )
}

// ---- progress indicator --------------------------------------------------
function ProgressBar({ step, total, label }: { step: number; total: number; label: string }) {
  const { theme } = useTheme()
  return (
    <View style={{ gap: SPACE.sm }}>
      <View style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'center' }}>
        {Array.from({ length: total }, (_, i) => i + 1).map((i) => {
          const done = i < step
          const current = i === step
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: 8,
                borderRadius: 4,
                backgroundColor: done || current ? theme.colors.accent : theme.colors.line,
                opacity: current ? 0.65 : 1,
              }}
            />
          )
        })}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Feather name="compass" size={13} color={theme.colors.textMute} />
        <Small muted>{label}</Small>
      </View>
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
              accessibilityLabel={opt.label[L]}
              accessibilityState={{ selected: isOn }}
              onPress={() => onToggle(opt.key)}
              style={{
                width: '47%',
                aspectRatio: 1,
                borderRadius: theme.radii.card,
                overflow: 'hidden',
                borderWidth: isOn ? 2 : 1,
                borderColor: isOn ? theme.colors.accent : theme.colors.line,
                backgroundColor: theme.colors.paper,
              }}
            >
              {/* Real interior photo (bundled asset) — never an emoji or AI render (§8). */}
              <Image
                source={opt.image}
                resizeMode="cover"
                style={{ width: '100%', height: '100%' }}
              />
              {/* Bottom scrim so the white label stays legible on any photo. */}
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  paddingHorizontal: SPACE.md,
                  paddingTop: SPACE.xl,
                  paddingBottom: SPACE.md,
                  backgroundColor: 'rgba(0,0,0,0.35)',
                }}
              >
                <BodyStrong color="#ffffff">{opt.label[L]}</BodyStrong>
              </View>
              {/* Selected badge — premium check on Calm Pine. */}
              {isOn ? (
                <View
                  style={{
                    position: 'absolute',
                    top: SPACE.sm,
                    right: SPACE.sm,
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: theme.colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="check" size={16} color={theme.colors.onAccent} />
                </View>
              ) : null}
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
        leading={<Feather name="arrow-right" size={18} color={theme.colors.onAccent} />}
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

      <Button
        title={tx.addPhotos}
        variant="secondary"
        block
        onPress={onAdd}
        leading={<Feather name="image" size={18} color={theme.colors.text} />}
      />

      {photos.length > 0 ? (
        <View style={{ gap: SPACE.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="check" size={13} color={theme.colors.ok} />
            <Small muted>{fmt(tx.photosCount, { n: photos.length })}</Small>
          </View>
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
        <Button
          title={tx.back}
          variant="ghost"
          onPress={onBack}
          leading={<Feather name="arrow-left" size={16} color={theme.colors.text} />}
        />
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
  tone,
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
  tone: string
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
  // Honest abstention: the model returned (no error) but produced no usable text.
  const isSparse = !loading && !error && !editing && text.trim().length === 0

  return (
    <View style={{ gap: SPACE.lg }}>
      <View style={{ gap: SPACE.xs }}>
        <Display>{tx.s3Title}</Display>
        <Body muted>{tx.s3Body}</Body>
      </View>

      {loading ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
            <ActivityIndicator color={theme.colors.accent} />
            <Body muted>{tx.drafting}</Body>
          </View>
        </Card>
      ) : null}

      {error && !loading ? (
        <Card style={{ borderLeftWidth: 4, borderLeftColor: theme.colors.warn }}>
          <View style={{ gap: SPACE.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm }}>
              <Feather name="alert-triangle" size={16} color={theme.colors.warn} style={{ marginTop: 2 }} />
              <Small color={theme.colors.warn} style={{ flex: 1 }}>{tx.profileError}</Small>
            </View>
            <Button
              title={tx.retry}
              variant="secondary"
              onPress={onRetry}
              leading={<Feather name="refresh-cw" size={16} color={theme.colors.text} />}
            />
          </View>
        </Card>
      ) : null}

      {/* Honest abstention — sparse inputs, no fabricated profile (§0 rule 5). */}
      {isSparse ? (
        <Card style={{ backgroundColor: AP.surfaceLow, borderColor: theme.colors.line }}>
          <View style={{ flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' }}>
            <Feather name="info" size={16} color={theme.colors.info} style={{ marginTop: 2 }} />
            <Small muted style={{ flex: 1 }}>{tx.sparse}</Small>
          </View>
        </Card>
      ) : null}

      {!loading && !error && !isSparse ? (
        <>
          {/* AI profile card — pine-bordered, with a grounding/"Reviewed" badge. */}
          <View
            style={[
              {
                backgroundColor: theme.colors.card,
                borderRadius: theme.radii.card,
                borderLeftWidth: 4,
                borderLeftColor: theme.colors.accent,
                padding: SPACE.lg,
                gap: SPACE.md,
              },
              theme.shadowCard,
            ]}
          >
            {/* Eyebrow + grounding badge */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm }}>
              <Micro style={{ letterSpacing: 1.5, color: theme.colors.textMute }}>{tx.s3Eyebrow}</Micro>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: theme.radii.pill,
                  backgroundColor: AP.chip,
                  paddingHorizontal: SPACE.sm,
                  paddingVertical: 3,
                }}
              >
                <Feather name="check-circle" size={12} color={AP.onChip} />
                <Micro style={{ color: AP.onChip, fontWeight: '600' }}>{tx.grounded}</Micro>
              </View>
            </View>

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
                  backgroundColor: AP.surfaceLow,
                }}
              />
            ) : (
              <Body>{text}</Body>
            )}

            {/* Tone pill — a soft clay accent describing the vibe (when present). */}
            {!editing && tone ? (
              <View style={{ gap: SPACE.xs }}>
                <Micro style={{ letterSpacing: 1, color: theme.colors.textMute }}>{tx.toneLabel}</Micro>
                <View
                  style={{
                    alignSelf: 'flex-start',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: theme.radii.pill,
                    backgroundColor: theme.colors.secondaryContainer,
                    paddingHorizontal: SPACE.md,
                    paddingVertical: 4,
                  }}
                >
                  <Feather name="feather" size={13} color={theme.colors.secondary} />
                  <Small style={{ color: theme.colors.secondary, fontWeight: '600' }}>{tone}</Small>
                </View>
              </View>
            ) : null}
          </View>

          {/* voice affordance stub */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tx.voice}
            onPress={() => {
              // TODO(voice): wire up voice capture of the design profile.
            }}
            style={{
              minHeight: TAP,
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.sm,
            }}
          >
            <Feather name="mic" size={16} color={theme.colors.accent} />
            <Small style={{ color: theme.colors.accentDeep }}>{tx.voice}</Small>
          </Pressable>

          {editing ? (
            <Button
              title={tx.save}
              block
              size="lg"
              loading={saving}
              onPress={onSave}
              leading={saving ? undefined : <Feather name="check" size={18} color={theme.colors.onAccent} />}
            />
          ) : (
            <View style={{ gap: SPACE.md }}>
              <Button
                title={tx.feelsRight}
                block
                size="lg"
                onPress={onFeelsRight}
                leading={<Feather name="check" size={18} color={theme.colors.onAccent} />}
              />
              <Button
                title={tx.adjust}
                block
                variant="secondary"
                onPress={onAdjust}
                leading={<Feather name="edit-2" size={16} color={theme.colors.text} />}
              />
            </View>
          )}
        </>
      ) : null}

      {/* When sparse, still offer voice so the user can describe it themselves. */}
      {isSparse ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tx.voice}
          onPress={() => {
            // TODO(voice): wire up voice capture of the design profile.
          }}
          style={{
            minHeight: TAP,
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.sm,
          }}
        >
          <Feather name="mic" size={16} color={theme.colors.accent} />
          <Small style={{ color: theme.colors.accentDeep }}>{tx.voice}</Small>
        </Pressable>
      ) : null}

      <Button
        title={tx.back}
        variant="ghost"
        onPress={onBack}
        leading={<Feather name="arrow-left" size={16} color={theme.colors.text} />}
      />
    </View>
  )
}

// ---- step 4: who gets a design say (owners only) -------------------------
function StepDesignSay({
  tx,
  L,
  members,
  spaces,
  memberSays,
  loading,
  saving,
  error,
  onUpdate,
  onSave,
  onSkip,
  onBack,
}: {
  tx: Tx
  L: Lang
  members: HomeownerMember[]
  spaces: Space[]
  memberSays: MemberSay[]
  loading: boolean
  saving: boolean
  error: string | null
  onUpdate: (id: string, say: DesignSay, spaceId?: string | null) => void
  onSave: () => void
  onSkip: () => void
  onBack: () => void
}) {
  const { theme } = useTheme()

  if (loading) {
    return (
      <View style={{ gap: SPACE.lg, paddingVertical: SPACE.xl, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    )
  }

  return (
    <View style={{ gap: SPACE.lg }}>
      <View style={{ gap: SPACE.xs }}>
        <Display>{tx.s4Title}</Display>
        <Body muted>{tx.s4Body}</Body>
      </View>

      {members.length === 0 ? (
        <Card style={{ backgroundColor: AP.surfaceLow, borderColor: theme.colors.line }}>
          <View style={{ flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' }}>
            <Feather name="users" size={16} color={theme.colors.textMute} style={{ marginTop: 2 }} />
            <Body muted style={{ flex: 1 }}>
              {L === 'hi'
                ? 'अभी कोई अन्य सदस्य नहीं हैं। बाद में Settings → Members से जोड़ सकते हैं।'
                : 'No other members yet. You can add them later from Settings → Members.'}
            </Body>
          </View>
        </Card>
      ) : (
        members.map((m) => {
          const ms = memberSays.find((x) => x.memberId === m.id)
          const say: DesignSay = ms?.say ?? 'none'
          const spaceId = ms?.spaceId ?? null

          return (
            <Card key={m.id} style={{ gap: SPACE.md }}>
              {/* Member header — avatar chip + name + role, matches Members. */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: theme.radii.pill,
                    backgroundColor: AP.chip,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather
                    name={m.sub_role === 'advisor' ? 'feather' : 'user'}
                    size={18}
                    color={theme.colors.accentDeep}
                  />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <BodyStrong numberOfLines={1}>{m.display_name ?? m.phone ?? '—'}</BodyStrong>
                  <Small style={{ color: theme.colors.accentDeep }}>
                    {m.sub_role === 'family'
                      ? L === 'hi' ? 'परिवार' : 'Family'
                      : L === 'hi' ? 'सलाहकार' : 'Advisor'}
                  </Small>
                </View>
              </View>

              {/* Say chips — icon + word per option. */}
              <View style={{ flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap' }}>
                {(['none', 'full', 'room'] as DesignSay[]).map((opt) => {
                  const label =
                    opt === 'none' ? tx.noSay : opt === 'full' ? tx.fullSay : tx.oneRoom
                  const icon: React.ComponentProps<typeof Feather>['name'] =
                    opt === 'none' ? 'minus-circle' : opt === 'full' ? 'home' : 'square'
                  const active = say === opt
                  return (
                    <Pressable
                      key={opt}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => onUpdate(m.id, opt, opt === 'room' ? spaceId : null)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        borderRadius: theme.radii.pill,
                        borderWidth: 1,
                        borderColor: active ? theme.colors.accent : theme.colors.line,
                        backgroundColor: active ? theme.colors.accentWarm : theme.colors.card,
                        paddingHorizontal: SPACE.md,
                        paddingVertical: SPACE.xs,
                        minHeight: TAP,
                        justifyContent: 'center',
                      }}
                    >
                      <Feather
                        name={icon}
                        size={13}
                        color={active ? theme.colors.accentDeep : theme.colors.textMute}
                      />
                      <Small style={{ color: active ? theme.colors.accentDeep : theme.colors.text, fontWeight: active ? '600' : '400' }}>
                        {label}
                      </Small>
                    </Pressable>
                  )
                })}
              </View>

              {/* Room picker — shown when say === 'room' and spaces exist */}
              {say === 'room' && spaces.length > 0 ? (
                <View style={{ gap: SPACE.xs }}>
                  <Small muted>{tx.pickRoom}</Small>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                    {spaces.map((sp) => {
                      const active = spaceId === sp.id
                      return (
                        <Pressable
                          key={sp.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => onUpdate(m.id, 'room', sp.id)}
                          style={{
                            borderRadius: theme.radii.pill,
                            borderWidth: 1,
                            borderColor: active ? theme.colors.accent : theme.colors.line,
                            backgroundColor: active ? AP.chip : theme.colors.card,
                            paddingHorizontal: SPACE.md,
                            paddingVertical: 6,
                          }}
                        >
                          <Small style={{ color: active ? theme.colors.accentDeep : theme.colors.text }}>
                            {sp.name}
                          </Small>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
              ) : null}
            </Card>
          )
        })
      )}

      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="alert-circle" size={14} color={theme.colors.risk} />
          <Small color={theme.colors.risk} style={{ flex: 1 }}>{error}</Small>
        </View>
      ) : null}

      <Button
        title={saving ? tx.savingSay : tx.saveSay}
        block
        size="lg"
        loading={saving}
        onPress={onSave}
        leading={saving ? undefined : <Feather name="check" size={18} color={theme.colors.onAccent} />}
      />
      <Button title={tx.skipStep} block variant="ghost" onPress={onSkip} />
      <Button
        title={tx.back}
        variant="ghost"
        onPress={onBack}
        leading={<Feather name="arrow-left" size={16} color={theme.colors.text} />}
      />
    </View>
  )
}
