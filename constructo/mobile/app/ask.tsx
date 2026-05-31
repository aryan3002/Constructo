/**
 * Ask the Builder — a calm chat with the site team (Architectural Precision).
 *
 * There is no realtime chat backend, so this is honestly backed by the
 * homeowner REQUESTS API: each question you send becomes a request
 * (POST /homeowner/requests); the team's progress on it (sent → seen →
 * in_progress → done) is shown back as their reply. Root route, self-themed
 * Daylight, self-guarded.
 */
import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { homeowner } from '../src/api/client'
import type { HomeownerRequest, RequestStatus } from '../src/api/types'
import { useAuth } from '../src/auth/AuthContext'
import { useT } from '../src/i18n/I18nProvider'
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider'
import { AP, SPACE, TAP } from '../src/theme/tokens'
import { Body, BodyStrong, Micro, Small } from '../src/ui'

const STR = {
  en: {
    title: 'Your site team',
    subtitle: 'SITE FOREMAN',
    placeholder: 'Type your question here…',
    footer: 'The team typically replies within a few hours on working days.',
    empty: 'Ask anything about your build — materials, timeline, a change you’d like.',
    reply: {
      sent: 'Sent to your site team.',
      seen: 'Seen by the site team.',
      in_progress: 'The team is looking into this.',
      done: 'Resolved ✓',
    } as Record<RequestStatus, string>,
    back: 'Back',
  },
  hi: {
    title: 'आपकी साइट टीम',
    subtitle: 'साइट फ़ोरमैन',
    placeholder: 'अपना सवाल यहाँ लिखें…',
    footer: 'टीम आमतौर पर कामकाजी दिनों में कुछ घंटों में जवाब देती है।',
    empty: 'अपने निर्माण के बारे में कुछ भी पूछें — सामान, समय, या कोई बदलाव।',
    reply: {
      sent: 'आपकी साइट टीम को भेज दिया।',
      seen: 'टीम ने देख लिया।',
      in_progress: 'टीम इस पर काम कर रही है।',
      done: 'हल हो गया ✓',
    } as Record<RequestStatus, string>,
    back: 'वापस',
  },
} as const

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function AskInner() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const qc = useQueryClient()
  const t = STR[lang]

  const [text, setText] = useState('')

  const q = useQuery({ queryKey: ['ask', 'requests'], queryFn: () => homeowner.requests() })
  const send = useMutation({
    mutationFn: (title: string) => homeowner.createRequest({ title }),
    onSuccess: () => {
      setText('')
      void qc.invalidateQueries({ queryKey: ['ask', 'requests'] })
    },
  })

  // Chat order = oldest first.
  const requests: HomeownerRequest[] = [...(q.data ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingBottom: SPACE.sm,
          paddingHorizontal: SPACE.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.md,
          backgroundColor: c.card,
          borderBottomWidth: 1,
          borderBottomColor: c.line,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t.back}
          hitSlop={10}
          style={{ minWidth: 32, minHeight: 32, justifyContent: 'center' }}
        >
          <Body style={{ fontSize: 22 }}>←</Body>
        </Pressable>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: AP.chip,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Body color={AP.onChip}>👷</Body>
        </View>
        <View style={{ flex: 1 }}>
          <BodyStrong>{t.title}</BodyStrong>
          <Micro muted style={{ letterSpacing: 1 }}>
            {t.subtitle}
          </Micro>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: SPACE.lg, gap: SPACE.md }}
        >
          {q.isLoading ? (
            <View style={{ paddingVertical: SPACE.xl, alignItems: 'center' }}>
              <ActivityIndicator color={c.accent} />
            </View>
          ) : requests.length === 0 ? (
            <View style={{ paddingVertical: SPACE.xl, alignItems: 'center' }}>
              <Body muted style={{ textAlign: 'center' }}>
                {t.empty}
              </Body>
            </View>
          ) : (
            requests.map((r) => (
              <View key={r.id} style={{ gap: SPACE.sm }}>
                {/* Outgoing question (right, teal) */}
                <View style={{ alignItems: 'flex-end' }}>
                  <View
                    style={{
                      maxWidth: '85%',
                      backgroundColor: c.accent,
                      borderRadius: theme.radii.card,
                      borderBottomRightRadius: 4,
                      paddingHorizontal: SPACE.md,
                      paddingVertical: SPACE.sm,
                    }}
                  >
                    <Body color={AP.onDark}>{r.title}</Body>
                    {r.detail ? (
                      <Body color="rgba(255,255,255,0.85)" style={{ marginTop: 2 }}>
                        {r.detail}
                      </Body>
                    ) : null}
                  </View>
                  <Micro muted style={{ marginTop: 2 }}>
                    {timeLabel(r.created_at)}
                  </Micro>
                </View>
                {/* Team reply (left, white) — derived from status */}
                <View style={{ alignItems: 'flex-start' }}>
                  <View
                    style={[
                      {
                        maxWidth: '85%',
                        backgroundColor: c.card,
                        borderWidth: 1,
                        borderColor: c.line,
                        borderRadius: theme.radii.card,
                        borderBottomLeftRadius: 4,
                        paddingHorizontal: SPACE.md,
                        paddingVertical: SPACE.sm,
                      },
                      theme.shadowCard,
                    ]}
                  >
                    <Body>{t.reply[r.status]}</Body>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {/* Input bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.sm,
            paddingHorizontal: SPACE.lg,
            paddingTop: SPACE.sm,
            paddingBottom: insets.bottom + SPACE.sm,
            borderTopWidth: 1,
            borderTopColor: c.line,
            backgroundColor: c.card,
          }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t.placeholder}
            placeholderTextColor={c.textMute}
            multiline
            style={{
              flex: 1,
              minHeight: TAP,
              maxHeight: 120,
              borderWidth: 1,
              borderColor: c.line,
              borderRadius: theme.radii.control,
              paddingHorizontal: SPACE.md,
              paddingVertical: SPACE.sm,
              backgroundColor: c.bg,
              color: c.text,
              fontSize: 16,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={!text.trim() || send.isPending}
            onPress={() => send.mutate(text.trim())}
            style={{
              width: TAP,
              height: TAP,
              borderRadius: theme.radii.control,
              backgroundColor: c.accent,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !text.trim() || send.isPending ? 0.5 : 1,
            }}
          >
            {send.isPending ? (
              <ActivityIndicator color={AP.onDark} />
            ) : (
              <Body color={AP.onDark} style={{ fontSize: 20 }}>
                ➤
              </Body>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <View style={{ paddingHorizontal: SPACE.lg, paddingBottom: insets.bottom, backgroundColor: c.card }}>
        <Small muted style={{ textAlign: 'center', paddingBottom: SPACE.sm }}>
          {t.footer}
        </Small>
      </View>
    </View>
  )
}

export default function Ask() {
  const { status } = useAuth()
  if (status === 'loading') return null
  if (status === 'guest') return <Redirect href="/(auth)/login" />
  return (
    <ThemeProvider initial="daylight">
      <AskInner />
    </ThemeProvider>
  )
}
