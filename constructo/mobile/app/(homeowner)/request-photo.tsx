/**
 * Request a photo — the homeowner "pull door" (Phase 2). The contractor feed
 * PUSHES site photos; this lets the homeowner PULL one: pick a room (+ an
 * optional note) and the site team is notified. It creates an ordinary
 * homeowner request (POST /homeowner/requests), so it lands in the same queue
 * the team already works and can be answered by sharing a photo back to the
 * feed — closing the loop with the contractor photo-share flow.
 *
 * Deliberately simpler than the full issue report: no urgency, no upload. Pick
 * a room, optionally add a line, send. Mirrors issue.tsx's SubHeader + toast +
 * createRequest scaffolding.
 */
import { useState } from 'react'
import { TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { homeowner } from '../../src/api/client'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../src/theme/tokens'
import { BodyStrong, Button, Chip, Screen, Small, SubHeader, useToast } from '../../src/ui'
import { ROOM_PRESETS } from '../_requests.util'

type Lang = 'en' | 'hi'

interface Strings {
  title: string
  subtitle: string
  roomLabel: string
  intro: string
  noteLabel: string
  notePlaceholder: string
  submit: string
  submitting: string
  success: string
  error: string
  pickFirst: string
}

const STR: Record<Lang, Strings> = {
  en: {
    title: 'Request a photo',
    subtitle: 'Your site team will be notified',
    roomLabel: 'Which part of your home?',
    intro: 'Pick a room and your site team will share a fresh photo.',
    noteLabel: 'Add a note (optional)',
    notePlaceholder: 'Anything specific? e.g. the tiling near the window',
    submit: 'Send request',
    submitting: 'Sending…',
    success: 'Photo request sent to your site team.',
    error: 'We couldn’t send that just now. Please try again.',
    pickFirst: 'Pick a room first.',
  },
  hi: {
    title: 'फ़ोटो का अनुरोध',
    subtitle: 'आपकी साइट टीम को सूचित किया जाएगा',
    roomLabel: 'घर का कौन-सा हिस्सा?',
    intro: 'एक कमरा चुनें — आपकी साइट टीम ताज़ा फ़ोटो साझा करेगी।',
    noteLabel: 'एक नोट जोड़ें (वैकल्पिक)',
    notePlaceholder: 'कुछ ख़ास? जैसे खिड़की के पास की टाइलिंग',
    submit: 'अनुरोध भेजें',
    submitting: 'भेज रहे हैं…',
    success: 'फ़ोटो अनुरोध आपकी साइट टीम को भेज दिया गया।',
    error: 'अभी नहीं भेज सके। कृपया फिर कोशिश करें।',
    pickFirst: 'पहले एक कमरा चुनें।',
  },
}

export default function RequestPhotoScreen() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const t = STR[lang]
  const router = useRouter()
  const toast = useToast()
  const qc = useQueryClient()

  const [roomKey, setRoomKey] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const submitMut = useMutation({
    mutationFn: () => {
      const preset = ROOM_PRESETS.find((r) => r.key === roomKey)
      // English room label in the title so the site team reads it clearly
      // (mirrors the issue-report flow). "Other" folds into the note.
      const roomEn = preset && preset.key !== 'other' ? preset.en : 'a specific area'
      const trimmed = note.trim()
      const detailParts = [`Please share a recent photo of ${roomEn}.`]
      if (trimmed) detailParts.push(trimmed)
      return homeowner.createRequest({
        title: `Photo request — ${roomEn}`,
        detail: detailParts.join('\n'),
      })
    },
    onSuccess: () => {
      // Refresh Home (heartbeat) + the requests list so the new ask shows up.
      void qc.invalidateQueries({ queryKey: ['home'] })
      void qc.invalidateQueries({ queryKey: ['home', 'requests'] })
      toast(t.success, 'check-circle')
      if (router.canGoBack()) router.back()
      else router.replace('/(homeowner)/photos')
    },
    onError: () => toast(t.error, 'alert-circle'),
  })

  const onSubmit = () => {
    if (!roomKey) {
      toast(t.pickFirst, 'alert-circle')
      return
    }
    submitMut.mutate()
  }

  return (
    <Screen floatingNav>
      <SubHeader
        title={t.title}
        subtitle={t.subtitle}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(homeowner)/photos'))}
      />

      <View style={{ gap: SPACE.lg, marginTop: SPACE.md }}>
        <View style={{ gap: SPACE.xs }}>
          <BodyStrong>{t.roomLabel}</BodyStrong>
          <Small muted>{t.intro}</Small>
        </View>

        {/* Room chips */}
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

        {/* Optional note */}
        <View style={{ gap: SPACE.xs }}>
          <BodyStrong>{t.noteLabel}</BodyStrong>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t.notePlaceholder}
            placeholderTextColor={c.textMute}
            multiline
            style={{
              minHeight: 72,
              borderWidth: 1,
              borderColor: c.line,
              borderRadius: theme.radii.control,
              paddingHorizontal: SPACE.md,
              paddingVertical: SPACE.sm,
              color: c.text,
              fontSize: 16,
              textAlignVertical: 'top',
              backgroundColor: c.card,
            }}
          />
        </View>

        {/* Submit */}
        <Button
          title={submitMut.isPending ? t.submitting : t.submit}
          onPress={onSubmit}
          loading={submitMut.isPending}
          disabled={!roomKey || submitMut.isPending}
          block
          style={{ minHeight: TAP }}
          leading={submitMut.isPending ? undefined : <Feather name="send" size={16} color={c.onAccent} />}
        />
      </View>
    </Screen>
  )
}
