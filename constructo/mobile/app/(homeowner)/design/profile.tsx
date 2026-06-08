/**
 * Confirm / re-draft your style (Design rebuild) — the PUT /design/profile loop,
 * pushed full-screen from the Design tab (href:null). Daylight theme.
 *
 * Honest-AI loop: "Draft an updated style" PUTs with NO profile, so the server
 * drafts one from her intake fingerprint AND persists it (not a discardable
 * preview — the copy says so). She then edits the prose + tone words and "Save my
 * style" PUTs the confirmed profile back. The draft's other keys (per_room /
 * contributors / conflicts / source) are carried through untouched so editing the
 * prose never drops her conflict cards or contributor roster. Gated on can_design.
 */
import { useEffect, useRef, useState } from 'react'
import { Alert, Pressable, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { homeowner } from '../../../src/api/client'
import type { DesignProfile } from '../../../src/api/types'
import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../../src/theme/tokens'
import { Body, BodyStrong, Button, Display, Screen, Small, useInputStyle } from '../../../src/ui'
import { isProfileEmpty, profileText, profileTone } from '../_design.util'
import { buildProfilePayload, PROFILE_STR } from '../_design_select.util'

export default function StyleProfileLoop() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const qc = useQueryClient()
  const inputStyle = useInputStyle()
  const t = PROFILE_STR[lang as 'en' | 'hi'] ?? PROFILE_STR.en

  const capsQ = useQuery({
    queryKey: ['homeowner', 'capabilities'],
    queryFn: () => homeowner.capabilities(),
  })
  const canDesign = capsQ.data?.can_design ?? false

  const profileQ = useQuery({
    queryKey: ['design', 'profile'],
    queryFn: () => homeowner.designProfile(),
  })

  // The most recent known profile (a fresh draft, else the saved one) — the
  // source for carry-through keys when she confirms.
  const [drafted, setDrafted] = useState<DesignProfile | null>(null)
  const [text, setText] = useState('')
  const [tones, setTones] = useState<string[]>([])
  const [toneDraft, setToneDraft] = useState('')
  const [showHint, setShowHint] = useState(false)
  const seeded = useRef(false)

  // Seed the editor from the saved profile once (never clobber her edits on a
  // background refetch).
  useEffect(() => {
    if (seeded.current || !profileQ.data) return
    seeded.current = true
    setText(profileText(profileQ.data))
    setTones(profileTone(profileQ.data))
  }, [profileQ.data])

  const isEmpty = isProfileEmpty(profileQ.data)

  const draftMut = useMutation({
    mutationFn: () => homeowner.saveDesignProfile({}),
    onSuccess: (data) => {
      setDrafted(data)
      setText(profileText(data))
      setTones(profileTone(data))
      setShowHint(true)
    },
    onError: () => Alert.alert('', t.draftErr),
  })

  const saveMut = useMutation({
    mutationFn: () =>
      homeowner.saveDesignProfile({
        profile: buildProfilePayload(drafted ?? profileQ.data, text, tones),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['design', 'profile'] })
      Alert.alert('', t.saved)
      router.back()
    },
    onError: () => Alert.alert('', t.saveErr),
  })

  const addTone = () => {
    const v = toneDraft.trim()
    if (!v || tones.includes(v)) {
      setToneDraft('')
      return
    }
    setTones((prev) => [...prev, v])
    setToneDraft('')
  }

  const back = (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel={t.back}
      hitSlop={10}
      style={{ width: 40, height: 40, justifyContent: 'center', marginBottom: SPACE.xs }}
    >
      <Feather name="chevron-left" size={26} color={c.text} />
    </Pressable>
  )

  // A non-design member who deep-links here sees her style read-only (no editor).
  const readOnly = !!capsQ.data && !canDesign

  return (
    <Screen floatingNav>
      {back}
      <View style={{ gap: 2 }}>
        <Display>{t.title}</Display>
        <Body muted>{t.subtitle}</Body>
      </View>

      {/* Draft trigger — "Create" when she has no profile yet, else "Draft an
          updated style". Hidden for a read-only viewer. */}
      {!readOnly ? (
        <Button
          title={isEmpty ? t.createCta : t.draftCta}
          variant="secondary"
          loading={draftMut.isPending}
          leading={<Feather name="refresh-cw" size={16} color={c.accentDeep} />}
          onPress={() => draftMut.mutate()}
          style={{ marginTop: SPACE.md }}
        />
      ) : null}

      {showHint ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.sm,
            backgroundColor: c.accentWarm,
            borderRadius: theme.radii.control,
            padding: SPACE.md,
          }}
        >
          <Feather name="info" size={15} color={c.accentDeep} />
          <Small style={{ flex: 1, color: c.accentDeep }}>{t.draftHint}</Small>
        </View>
      ) : null}

      {isEmpty && !showHint && !readOnly ? <Small muted>{t.currentEmpty}</Small> : null}

      {/* The prose — her style, in words. Read-only viewers see it as plain text. */}
      <View style={{ gap: SPACE.sm, marginTop: SPACE.sm }}>
        <BodyStrong>{t.profileLabel}</BodyStrong>
        {readOnly ? (
          <Body color={c.text}>{text || t.currentEmpty}</Body>
        ) : (
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t.profilePlaceholder}
            placeholderTextColor={c.textMute}
            multiline
            style={[inputStyle, { minHeight: 120, paddingVertical: SPACE.md, textAlignVertical: 'top' }]}
          />
        )}
      </View>

      {/* Tone words — editable chips (remove with ×, add below). */}
      <View style={{ gap: SPACE.sm, marginTop: SPACE.md }}>
        <BodyStrong>{t.toneLabel}</BodyStrong>
        {tones.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
            {tones.map((tone) => (
              <View
                key={tone}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACE.xs,
                  paddingLeft: SPACE.md,
                  paddingRight: readOnly ? SPACE.md : SPACE.sm,
                  paddingVertical: SPACE.sm,
                  borderRadius: theme.radii.pill,
                  borderWidth: 1,
                  borderColor: c.line,
                  backgroundColor: c.paper,
                }}
              >
                <Feather name="feather" size={12} color={c.accent} />
                <Small color={c.accentDeep} style={{ fontWeight: '600' }}>
                  {tone}
                </Small>
                {!readOnly ? (
                  <Pressable
                    onPress={() => setTones((prev) => prev.filter((x) => x !== tone))}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.back} ${tone}`}
                    hitSlop={8}
                  >
                    <Feather name="x" size={14} color={c.textMute} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {!readOnly ? (
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            <TextInput
              value={toneDraft}
              onChangeText={setToneDraft}
              placeholder={t.tonePlaceholder}
              placeholderTextColor={c.textMute}
              onSubmitEditing={addTone}
              returnKeyType="done"
              style={[inputStyle, { flex: 1 }]}
            />
            <Button title={t.addTone} variant="ghost" size="md" onPress={addTone} />
          </View>
        ) : null}
      </View>

      {!readOnly ? (
        <Button
          title={t.save}
          loading={saveMut.isPending}
          disabled={text.trim().length === 0}
          onPress={() => saveMut.mutate()}
          style={{ marginTop: SPACE.lg, minHeight: TAP }}
          leading={
            saveMut.isPending ? undefined : <Feather name="check" size={16} color={c.onAccent} />
          }
        />
      ) : null}
    </Screen>
  )
}
