/**
 * Issue-report flow — homeowner pushed screen (Calm Cockpit §5).
 *
 * Two-step wizard:
 *   Step 1: Photos (up to 5 via expo-image-picker, real upload via
 *           `homeowner.uploadVisitPhoto`) + honest "Voice note — coming soon" stub.
 *   Step 2: Description text + room chips + urgency chips → submit via
 *           `homeowner.createRequest()`. On success: Toast + navigate back.
 *
 * Real API calls:
 *   - `homeowner.uploadVisitPhoto(file: UploadFile, caption?, siteId?)` → `Photo`
 *   - `homeowner.createRequest({ title, detail?, site_id? })` → `HomeownerRequest`
 *
 * Route: (homeowner)/issue — registered `href: null` in _layout.tsx.
 */
import { useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  TextInput,
  View,
  type TextStyle,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { homeowner, type UploadFile } from '../../src/api/client'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  Chip,
  Screen,
  Small,
  SubHeader,
  useInputStyle,
  useToast,
} from '../../src/ui'
import { buildRequestDetail, ROOM_PRESETS, URGENCY_PRESETS, type Urgency } from '../_requests.util'

type Lang = 'en' | 'hi'
type Step = 1 | 2

const MAX_PHOTOS = 5

// ---- localised copy ----
interface Strings {
  title: string
  subtitle: string
  stepPhotos: string
  stepDetails: string
  photosHint: string
  addPhoto: string
  photoLimit: string
  voiceSoon: string
  next: string
  back: string
  fieldTitle: string
  titlePlaceholder: string
  fieldDetail: string
  detailPlaceholder: string
  room: string
  urgency: string
  submit: string
  submitting: string
  titleRequired: string
  submitError: string
  uploadError: string
  successToast: string
}

const STR: Record<Lang, Strings> = {
  en: {
    title: 'Report an issue',
    subtitle: 'Your team will be notified',
    stepPhotos: 'Photos',
    stepDetails: 'Details',
    photosHint: 'Photos help your team spot the issue faster. Up to 5.',
    addPhoto: 'Add photo',
    photoLimit: 'Up to 5 photos',
    voiceSoon: 'Voice note — coming soon',
    next: 'Next →',
    back: '← Back',
    fieldTitle: 'What is the issue?',
    titlePlaceholder: 'e.g. Leaking tap in kitchen',
    fieldDetail: 'More detail (optional)',
    detailPlaceholder: 'Describe what you noticed…',
    room: 'Room',
    urgency: 'Urgency',
    submit: 'Send to team',
    submitting: 'Sending…',
    titleRequired: 'Please add a short title first.',
    submitError: 'Could not send. Please try again.',
    uploadError: 'Photo upload failed — issue sent without photos.',
    successToast: 'Request sent to your team',
  },
  hi: {
    title: 'समस्या दर्ज करें',
    subtitle: 'आपकी टीम को सूचित किया जाएगा',
    stepPhotos: 'फ़ोटो',
    stepDetails: 'विवरण',
    photosHint: 'फ़ोटो आपकी टीम को समस्या जल्दी समझने में मदद करती है। अधिकतम 5।',
    addPhoto: 'फ़ोटो जोड़ें',
    photoLimit: 'अधिकतम 5 फ़ोटो',
    voiceSoon: 'आवाज़ नोट — जल्द आ रहा है',
    next: 'आगे →',
    back: '← वापस',
    fieldTitle: 'क्या समस्या है?',
    titlePlaceholder: 'जैसे रसोई में टपकता नल',
    fieldDetail: 'अधिक विवरण (वैकल्पिक)',
    detailPlaceholder: 'आपने जो देखा उसका वर्णन करें…',
    room: 'कमरा',
    urgency: 'अत्यावश्यकता',
    submit: 'टीम को भेजें',
    submitting: 'भेजा जा रहा है…',
    titleRequired: 'कृपया पहले एक छोटा शीर्षक जोड़ें।',
    submitError: 'भेजा नहीं जा सका। कृपया पुनः प्रयास करें।',
    uploadError: 'फ़ोटो अपलोड नहीं हुई — समस्या बिना फ़ोटो के भेजी गई।',
    successToast: 'आपकी टीम को अनुरोध भेजा गया',
  },
} as const

// ---- Small step indicator ----
function StepDots({ step }: { step: Step }) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'center' }}>
      {([1, 2] as Step[]).map((s) => (
        <View
          key={s}
          style={{
            width: s === step ? 20 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: s === step ? c.accent : c.line,
          }}
        />
      ))}
    </View>
  )
}

export default function IssueScreen() {
  const { lang } = useT()
  const t = STR[lang as Lang] ?? STR.en
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const qc = useQueryClient()
  const toast = useToast()
  const inputStyle = useInputStyle()

  // ---- state ----
  const [step, setStep] = useState<Step>(1)
  const [photos, setPhotos] = useState<Array<{ uri: string; name: string; type: string }>>([])
  const [titleText, setTitleText] = useState('')
  const [detailText, setDetailText] = useState('')
  const [roomKey, setRoomKey] = useState<string | null>(null)
  const [urgency, setUrgency] = useState<Urgency>('normal')
  const [formError, setFormError] = useState<string | null>(null)

  // ---- mutations ----
  const submitMut = useMutation({
    mutationFn: async () => {
      // Step 1: upload photos (best-effort — issue sent regardless of failure).
      let uploadedCount = 0
      if (photos.length > 0) {
        try {
          await Promise.all(
            photos.map((p) =>
              homeowner.uploadVisitPhoto(
                { uri: p.uri, name: p.name, type: p.type } satisfies UploadFile,
                undefined,
                undefined,
              ),
            ),
          )
          uploadedCount = photos.length
        } catch {
          // Upload failed — issue sent anyway, warning via toast.
          toast(t.uploadError, 'alert-circle')
        }
      }

      // Step 2: build detail string (rooms + urgency + photo count) via shared util.
      const detail = buildRequestDetail({
        detail: detailText,
        roomKey,
        urgency,
        photoCount: uploadedCount,
        lang: lang as 'en' | 'hi',
      })

      return homeowner.createRequest({ title: titleText.trim(), detail })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['homeowner', 'requests'] })
      toast(t.successToast)
      router.back()
    },
    onError: () => setFormError(t.submitError),
  })

  // ---- photo picker ----
  const pickPhoto = async () => {
    if (photos.length >= MAX_PHOTOS) return
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsMultipleSelection: true,
        selectionLimit: MAX_PHOTOS - photos.length,
      })
      if (!res.canceled && res.assets?.length) {
        const next = res.assets.slice(0, MAX_PHOTOS - photos.length).map((a) => ({
          uri: a.uri,
          name: a.fileName ?? `photo_${Date.now()}.jpg`,
          type: a.type === 'image' ? (a.mimeType ?? 'image/jpeg') : 'image/jpeg',
        }))
        setPhotos((prev) => [...prev, ...next].slice(0, MAX_PHOTOS))
      }
    } catch {
      /* permission denied / cancelled — silent */
    }
  }

  const removePhoto = (uri: string) =>
    setPhotos((prev) => prev.filter((p) => p.uri !== uri))

  const onNext = () => {
    setFormError(null)
    setStep(2)
  }

  const onSubmit = () => {
    if (!titleText.trim()) {
      setFormError(t.titleRequired)
      return
    }
    submitMut.mutate()
  }

  const multilineInputStyle: TextStyle = {
    ...(inputStyle as TextStyle),
    minHeight: 96,
    textAlignVertical: 'top',
    paddingVertical: SPACE.md,
  }

  return (
    <Screen floatingNav>
      <SubHeader
        title={t.title}
        subtitle={t.subtitle}
        onBack={step === 1 ? () => router.back() : () => setStep(1)}
        right={<StepDots step={step} />}
      />

      {/* Step 1 — Photos */}
      {step === 1 ? (
        <View style={{ gap: SPACE.lg, marginTop: SPACE.md }}>
          <View style={{ gap: SPACE.xs }}>
            <BodyStrong>{t.stepPhotos}</BodyStrong>
            <Small muted>{t.photosHint}</Small>
          </View>

          {/* Photo grid */}
          {photos.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: SPACE.sm, paddingVertical: SPACE.xs }}
            >
              {photos.map((p) => (
                <View key={p.uri} style={{ position: 'relative' }}>
                  <Image
                    source={{ uri: p.uri }}
                    style={{
                      width: 120,
                      height: 120,
                      borderRadius: theme.radii.card,
                    }}
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={() => removePhoto(p.uri)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    hitSlop={8}
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: c.text,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="x" size={14} color={c.bg} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          {/* Add photo button */}
          {photos.length < MAX_PHOTOS ? (
            <Button
              title={t.addPhoto}
              variant="secondary"
              onPress={pickPhoto}
              leading={<Feather name="camera" size={16} color={c.accentDeep} />}
            />
          ) : (
            <Small muted>{t.photoLimit}</Small>
          )}

          {/* Voice note — honest stub, non-interactive */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.sm,
              paddingHorizontal: SPACE.md,
              paddingVertical: SPACE.sm + 2,
              borderRadius: theme.radii.pill,
              borderWidth: 1,
              borderColor: c.line,
              opacity: 0.55,
              alignSelf: 'flex-start',
            }}
          >
            <Feather name="mic" size={14} color={c.textMute} />
            <Small muted>{t.voiceSoon}</Small>
          </View>

          <Button
            title={t.next}
            onPress={onNext}
            block
            leading={<Feather name="arrow-right" size={16} color={c.onAccent} />}
          />
        </View>
      ) : null}

      {/* Step 2 — Details */}
      {step === 2 ? (
        <View style={{ gap: SPACE.lg, marginTop: SPACE.md }}>
          {/* Title */}
          <View style={{ gap: SPACE.sm }}>
            <BodyStrong>{t.fieldTitle}</BodyStrong>
            <TextInput
              value={titleText}
              onChangeText={(v) => {
                setTitleText(v)
                if (formError) setFormError(null)
              }}
              placeholder={t.titlePlaceholder}
              placeholderTextColor={c.textMute}
              returnKeyType="next"
              style={inputStyle as TextStyle}
            />
          </View>

          {/* Detail */}
          <View style={{ gap: SPACE.sm }}>
            <BodyStrong>{t.fieldDetail}</BodyStrong>
            <TextInput
              value={detailText}
              onChangeText={setDetailText}
              placeholder={t.detailPlaceholder}
              placeholderTextColor={c.textMute}
              multiline
              style={multilineInputStyle}
            />
          </View>

          {/* Room chips */}
          <View style={{ gap: SPACE.sm }}>
            <BodyStrong>{t.room}</BodyStrong>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
              {ROOM_PRESETS.map((r) => (
                <Chip
                  key={r.key}
                  label={lang === 'hi' ? r.hi : r.en}
                  active={roomKey === r.key}
                  onPress={() => setRoomKey(roomKey === r.key ? null : r.key)}
                />
              ))}
            </View>
          </View>

          {/* Urgency chips */}
          <View style={{ gap: SPACE.sm }}>
            <BodyStrong>{t.urgency}</BodyStrong>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
              {URGENCY_PRESETS.map((u) => (
                <Chip
                  key={u.key}
                  label={lang === 'hi' ? u.hi : u.en}
                  active={urgency === u.key}
                  onPress={() => setUrgency(u.key)}
                />
              ))}
            </View>
          </View>

          {/* Photo summary (carry-over from step 1) */}
          {photos.length > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.sm,
                backgroundColor: c.accentWarm,
                borderRadius: theme.radii.chip,
                paddingHorizontal: SPACE.md,
                paddingVertical: SPACE.sm,
              }}
            >
              <Feather name="camera" size={15} color={c.accentDeep} />
              <Small style={{ color: c.accentDeep }}>
                {photos.length} photo{photos.length > 1 ? 's' : ''} added
              </Small>
            </View>
          ) : null}

          {/* Error */}
          {formError ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
              <Feather name="alert-triangle" size={14} color={c.warn} />
              <Small color={c.warn} style={{ flex: 1 }}>
                {formError}
              </Small>
            </View>
          ) : null}

          {/* Submit */}
          <Button
            title={submitMut.isPending ? t.submitting : t.submit}
            onPress={onSubmit}
            loading={submitMut.isPending}
            block
            style={{ minHeight: TAP }}
            leading={
              submitMut.isPending ? undefined : (
                <Feather name="send" size={16} color={c.onAccent} />
              )
            }
          />

          <Button
            title={t.back}
            variant="ghost"
            onPress={() => setStep(1)}
            disabled={submitMut.isPending}
          />
        </View>
      ) : null}
    </Screen>
  )
}
