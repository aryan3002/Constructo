/**
 * Photo comments — a threaded conversation on a published feed photo.
 *
 * Opened from a photo's "Comment" action with the photo `id` (+ `uri` for the
 * thumbnail). Lists the thread (oldest → newest) and lets any active member add
 * a comment — commenting is always open (authority.py). The author's name + role
 * are shown so the family always knows who said what.
 */
import { useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { homeowner } from '../../src/api/client'
import type { PhotoComment } from '../../src/api/types'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../src/theme/tokens'
import { Body, BodyStrong, MonoSm, ScreenLoader, Small, SubHeader, useInputStyle, useToast } from '../../src/ui'

const ROLE_LABEL: Record<string, { en: string; hi: string }> = {
  primary_owner: { en: 'Owner', hi: 'मालिक' },
  co_owner: { en: 'Co-owner', hi: 'सह-मालिक' },
  family: { en: 'Family', hi: 'परिवार' },
  advisor: { en: 'Advisor', hi: 'सलाहकार' },
}

const STR = {
  en: { title: 'Comments', empty: 'No comments yet. Start the conversation.', placeholder: 'Add a comment…', failed: 'Could not post. Try again.' },
  hi: { title: 'टिप्पणियाँ', empty: 'अभी कोई टिप्पणी नहीं। बातचीत शुरू करें।', placeholder: 'टिप्पणी जोड़ें…', failed: 'पोस्ट नहीं हो सका। पुनः प्रयास करें।' },
} as const

function timeLabel(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return time
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} · ${time}`
}

export default function PhotoCommentsScreen() {
  const { lang } = useT()
  const L = lang === 'hi' ? 'hi' : 'en'
  const t = STR[L]
  const toast = useToast()
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const inputStyle = useInputStyle()
  const qc = useQueryClient()
  const params = useLocalSearchParams<{ id?: string; uri?: string }>()
  const photoId = params.id

  const [text, setText] = useState('')

  const q = useQuery({
    queryKey: ['photo-comments', photoId],
    queryFn: () => homeowner.photoComments(photoId as string),
    enabled: !!photoId,
  })

  const addMut = useMutation({
    mutationFn: (body: string) => homeowner.addPhotoComment(photoId as string, body),
    onSuccess: () => {
      setText('')
      void qc.invalidateQueries({ queryKey: ['photo-comments', photoId] })
    },
    // The composer text is preserved (only cleared on success), so the user can
    // retry — but they MUST be told it failed (was a silent no-op before).
    onError: () => toast(t.failed),
  })

  const comments: PhotoComment[] = q.data ?? []

  function onSend() {
    const body = text.trim()
    if (!body || addMut.isPending) return
    addMut.mutate(body)
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={{ paddingHorizontal: SPACE.lg }}>
        <SubHeader title={t.title} onBack={() => router.back()} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SPACE.lg, gap: SPACE.md }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Photo thumbnail — what the thread is about */}
        {params.uri ? (
          <Image
            source={{ uri: params.uri }}
            resizeMode="cover"
            style={{ width: '100%', height: 180, borderRadius: theme.radii.card, backgroundColor: AP.surfaceLow }}
          />
        ) : null}

        {q.isLoading ? (
          <ScreenLoader fill={false} />
        ) : comments.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: SPACE.xl, gap: SPACE.sm }}>
            <Feather name="message-circle" size={28} color={c.textMute} />
            <Small muted>{t.empty}</Small>
          </View>
        ) : (
          comments.map((cm) => {
            const role = cm.author_role ? ROLE_LABEL[cm.author_role]?.[L] : null
            return (
              <View key={cm.id} style={{ alignItems: cm.is_mine ? 'flex-end' : 'flex-start', gap: 2 }}>
                {/* Author + role (skip for my own bubbles — clearly me) */}
                {!cm.is_mine ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
                    <Small style={{ color: c.text, fontWeight: '600' }}>{cm.author_name ?? '—'}</Small>
                    {role ? <MonoSm color={c.textMute}>{role}</MonoSm> : null}
                  </View>
                ) : null}
                <View
                  style={{
                    maxWidth: '86%',
                    backgroundColor: cm.is_mine ? c.accent : c.card,
                    borderWidth: cm.is_mine ? 0 : 1,
                    borderColor: c.line,
                    borderRadius: theme.radii.card,
                    borderBottomRightRadius: cm.is_mine ? 6 : theme.radii.card,
                    borderBottomLeftRadius: cm.is_mine ? theme.radii.card : 6,
                    paddingHorizontal: SPACE.lg,
                    paddingVertical: SPACE.md,
                  }}
                >
                  <Body color={cm.is_mine ? c.onAccent : c.text}>{cm.body}</Body>
                </View>
                <MonoSm muted style={{ paddingHorizontal: 4 }}>{timeLabel(cm.created_at)}</MonoSm>
              </View>
            )
          })
        )}
      </ScrollView>

      {/* Composer */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: SPACE.sm,
          paddingHorizontal: SPACE.lg,
          paddingTop: SPACE.sm,
          paddingBottom: insets.bottom + SPACE.sm,
          borderTopWidth: 1,
          borderTopColor: c.line,
          backgroundColor: c.bg,
        }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t.placeholder}
          placeholderTextColor={c.textMute}
          multiline
          style={[inputStyle, { flex: 1, maxHeight: 120 }]}
        />
        <Pressable
          onPress={onSend}
          accessibilityRole="button"
          accessibilityLabel={t.title}
          disabled={!text.trim() || addMut.isPending}
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.accent,
            opacity: !text.trim() || addMut.isPending ? 0.5 : 1,
          }}
        >
          <Feather name="arrow-up" size={22} color={c.onAccent} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}
