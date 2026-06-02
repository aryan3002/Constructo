/**
 * Ask the Builder — a calm chat-style request thread with your site team
 * (Calm Cockpit, §5 "Ask/Assistant").
 *
 * HONEST FRAMING: there is no grounded-RAG / realtime-chat backend (H8 is
 * gated), so this is NOT a grounded assistant — it is honestly backed by the
 * homeowner REQUESTS API. Each question you send becomes a request
 * (POST /homeowner/requests); the team's progress on it (sent → seen →
 * in_progress → done) is shown back as their reply. On money/structural
 * questions we add an extra honest note that the team will weigh in — we never
 * fake an AI answer. Root route, self-themed Daylight, self-guarded.
 */
import type * as React from 'react'
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
import { Feather } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { homeowner } from '../src/api/client'
import type { HomeownerRequest, RequestStatus } from '../src/api/types'
import { useAuth } from '../src/auth/AuthContext'
import { useT } from '../src/i18n/I18nProvider'
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider'
import { SPACE, STATUS, TAP, type Status } from '../src/theme/tokens'
import { Body, BodyStrong, Mono, Small } from '../src/ui'
import { isMoneyOrStructural } from './_requests.util'

const STR = {
  en: {
    title: 'Your site team',
    subtitle: 'ASK THE BUILDER',
    placeholder: 'Type your question here…',
    footer: 'This goes straight to your site team — not a bot. They typically reply within a few hours on working days.',
    empty: 'Ask anything about your build — materials, timeline, a change you’d like. Your site team will reply here.',
    micSoon: 'Voice — coming soon',
    moneyNote: 'This touches cost or structure, so we’ll make sure your builder weighs in directly — we won’t guess on money or safety.',
    replyEyebrow: 'SITE TEAM',
    reply: {
      sent: 'Sent to your site team.',
      seen: 'Seen by the site team.',
      in_progress: 'The team is looking into this.',
      done: 'Resolved.',
    } as Record<RequestStatus, string>,
    back: 'Back',
    send: 'Send',
  },
  hi: {
    title: 'आपकी साइट टीम',
    subtitle: 'बिल्डर से पूछें',
    placeholder: 'अपना सवाल यहाँ लिखें…',
    footer: 'यह सीधे आपकी साइट टीम को जाता है — कोई बॉट नहीं। वे आमतौर पर कामकाजी दिनों में कुछ घंटों में जवाब देते हैं।',
    empty: 'अपने निर्माण के बारे में कुछ भी पूछें — सामान, समय, या कोई बदलाव। आपकी साइट टीम यहाँ जवाब देगी।',
    micSoon: 'आवाज़ — जल्द आ रहा है',
    moneyNote: 'यह लागत या ढाँचे से जुड़ा है, इसलिए हम आपके बिल्डर से सीधे राय लेंगे — हम पैसे या सुरक्षा पर अंदाज़ा नहीं लगाते।',
    replyEyebrow: 'साइट टीम',
    reply: {
      sent: 'आपकी साइट टीम को भेज दिया।',
      seen: 'टीम ने देख लिया।',
      in_progress: 'टीम इस पर काम कर रही है।',
      done: 'हल हो गया।',
    } as Record<RequestStatus, string>,
    back: 'वापस',
    send: 'भेजें',
  },
} as const

/** Reply tone follows the status spine (calm, never red here). */
const REPLY_TONE: Record<RequestStatus, Status> = {
  sent: 'info',
  seen: 'info',
  in_progress: 'warn',
  done: 'ok',
}
const REPLY_ICON: Record<RequestStatus, React.ComponentProps<typeof Feather>['name']> = {
  sent: 'send',
  seen: 'eye',
  in_progress: 'clock',
  done: 'check',
}

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
  const t = STR[lang as 'en' | 'hi'] ?? STR.en

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

  const canSend = !!text.trim() && !send.isPending
  // Live honest hint while composing a money/structural question.
  const composingMoneyOrStructural = isMoneyOrStructural(text)

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header — warm card, Feather glyphs (no emoji) */}
      <View
        style={[
          {
            paddingTop: insets.top + 6,
            paddingBottom: SPACE.md,
            paddingHorizontal: SPACE.gutter,
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.md,
            backgroundColor: c.card,
            borderBottomWidth: 1,
            borderBottomColor: c.line,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t.back}
          hitSlop={10}
          style={{ width: 36, height: 36, justifyContent: 'center' }}
        >
          <Feather name="chevron-left" size={26} color={c.text} />
        </Pressable>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: c.accentWarm,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="users" size={20} color={c.accentDeep} />
        </View>
        <View style={{ flex: 1 }}>
          <Small muted style={{ letterSpacing: 1, marginBottom: 1 }}>
            {t.subtitle}
          </Small>
          <BodyStrong>{t.title}</BodyStrong>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: SPACE.gutter, gap: SPACE.lg }}
          keyboardShouldPersistTaps="handled"
        >
          {q.isLoading ? (
            <View style={{ paddingVertical: SPACE.xxl, alignItems: 'center' }}>
              <ActivityIndicator color={c.accent} />
            </View>
          ) : requests.length === 0 ? (
            <View style={{ paddingVertical: SPACE.xxl, alignItems: 'center', gap: SPACE.md }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: c.accentWarm,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="message-circle" size={26} color={c.accentDeep} />
              </View>
              <Body muted style={{ textAlign: 'center', maxWidth: 300 }}>
                {t.empty}
              </Body>
            </View>
          ) : (
            requests.map((r) => {
              const tone = REPLY_TONE[r.status]
              const moneyOrStructural = isMoneyOrStructural(`${r.title} ${r.detail ?? ''}`)
              return (
                <View key={r.id} style={{ gap: SPACE.sm }}>
                  {/* Outgoing question (right, Calm Pine) */}
                  <View style={{ alignItems: 'flex-end' }}>
                    <View
                      style={{
                        maxWidth: '86%',
                        backgroundColor: c.accent,
                        borderRadius: theme.radii.card,
                        borderBottomRightRadius: 6,
                        paddingHorizontal: SPACE.lg,
                        paddingVertical: SPACE.md,
                      }}
                    >
                      <Body color={c.onAccent}>{r.title}</Body>
                      {r.detail ? (
                        <Body color="rgba(255,255,255,0.88)" style={{ marginTop: 2 }}>
                          {r.detail}
                        </Body>
                      ) : null}
                    </View>
                    <Mono muted style={{ marginTop: 4, marginRight: 4 }}>
                      {timeLabel(r.created_at)}
                    </Mono>
                  </View>

                  {/* Team reply (left, warm paper) — derived from status */}
                  <View style={{ alignItems: 'flex-start' }}>
                    <View
                      style={[
                        {
                          maxWidth: '86%',
                          backgroundColor: c.card,
                          borderWidth: 1,
                          borderColor: c.line,
                          borderRadius: theme.radii.card,
                          borderBottomLeftRadius: 6,
                          paddingHorizontal: SPACE.lg,
                          paddingVertical: SPACE.md,
                          gap: 6,
                        },
                        theme.shadowCard,
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name={REPLY_ICON[r.status]} size={13} color={STATUS[tone]} />
                        <Small style={{ color: STATUS[tone], letterSpacing: 1, fontWeight: '600' }}>
                          {t.replyEyebrow}
                        </Small>
                      </View>
                      <Body>{t.reply[r.status]}</Body>
                    </View>
                  </View>

                  {/* Honest money/structural note — never a fake answer */}
                  {moneyOrStructural ? (
                    <View style={{ alignItems: 'flex-start' }}>
                      <View
                        style={{
                          maxWidth: '90%',
                          flexDirection: 'row',
                          gap: SPACE.sm,
                          backgroundColor: c.secondaryContainer,
                          borderRadius: theme.radii.chip,
                          paddingHorizontal: SPACE.md,
                          paddingVertical: SPACE.sm,
                        }}
                      >
                        <Feather name="shield" size={15} color={c.secondary} style={{ marginTop: 2 }} />
                        <Small style={{ flex: 1, color: c.text }}>{t.moneyNote}</Small>
                      </View>
                    </View>
                  ) : null}
                </View>
              )
            })
          )}

          {/* Live composing hint (before send) so the promise is set up-front */}
          {composingMoneyOrStructural ? (
            <View
              style={{
                flexDirection: 'row',
                gap: SPACE.sm,
                backgroundColor: c.secondaryContainer,
                borderRadius: theme.radii.chip,
                paddingHorizontal: SPACE.md,
                paddingVertical: SPACE.sm,
              }}
            >
              <Feather name="shield" size={15} color={c.secondary} style={{ marginTop: 2 }} />
              <Small style={{ flex: 1, color: c.text }}>{t.moneyNote}</Small>
            </View>
          ) : null}
        </ScrollView>

        {/* Input bar (§4 CaptureBar styling — input + mic affordance + send) */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: SPACE.sm,
            paddingHorizontal: SPACE.gutter,
            paddingTop: SPACE.sm,
            paddingBottom: SPACE.sm,
            borderTopWidth: 1,
            borderTopColor: c.line,
            backgroundColor: c.card,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.sm,
              minHeight: TAP,
              borderWidth: 1,
              borderColor: c.line,
              borderRadius: theme.radii.pill,
              backgroundColor: c.paper,
              paddingLeft: SPACE.lg,
              paddingRight: SPACE.sm,
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
                maxHeight: 110,
                paddingVertical: SPACE.sm,
                color: c.text,
                fontSize: 16,
              }}
            />
            {/* Honest "coming soon" mic — non-interactive, no false affordance */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.micSoon}
              disabled
              style={{
                width: 32,
                height: 32,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.4,
              }}
            >
              <Feather name="mic" size={18} color={c.textMute} />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.send}
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={() => send.mutate(text.trim())}
            style={({ pressed }) => [
              {
                width: TAP,
                height: TAP,
                borderRadius: theme.radii.pill,
                backgroundColor: c.accent,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: !canSend ? 0.5 : 1,
                transform: [{ scale: pressed && canSend ? 0.96 : 1 }],
              },
              canSend ? theme.shadowCard : null,
            ]}
          >
            {send.isPending ? (
              <ActivityIndicator color={c.onAccent} />
            ) : (
              <Feather name="arrow-up" size={22} color={c.onAccent} />
            )}
          </Pressable>
        </View>

        {/* Honest footer — it's your team, not a bot */}
        <View
          style={{
            paddingHorizontal: SPACE.gutter,
            paddingBottom: insets.bottom + SPACE.sm,
            backgroundColor: c.card,
          }}
        >
          <Small muted style={{ textAlign: 'center' }}>
            {t.footer}
          </Small>
        </View>
      </KeyboardAvoidingView>
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
