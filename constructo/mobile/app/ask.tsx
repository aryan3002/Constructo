/**
 * Ask your home — a calm, grounded assistant (Calm Cockpit, §5 "Ask/Assistant").
 *
 * GROUNDED-FIRST, BUILDER FALLBACK (handoff doc 16 §3a). Each question is first
 * answered by the grounded engine (POST /homeowner/ask, #109): the Trust Membrane
 * in question form — it answers in ONE-two warm sentences using ONLY her PUBLISHED
 * slice (updates, weekly summaries, milestones, changes, photo captions, confirmed
 * quiet periods), digit-guarded, and NEVER invents a fact, number, or name. When
 * the published record doesn't hold the answer it ABSTAINS ("ask your builder"),
 * and we offer a one-tap handoff to the site team (POST /homeowner/requests) —
 * which is the durable team thread, rendered as history at the top. Money/
 * structural questions naturally abstain (no rates cross the membrane) and carry
 * an extra honest note that a human will weigh in. We never fake an AI answer.
 *
 * Root route, self-themed Daylight, self-guarded.
 */
import type * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { homeowner } from '../src/api/client'
import type { HomeownerRequest, RequestStatus } from '../src/api/types'
import { useAuth } from '../src/auth/AuthContext'
import { useT } from '../src/i18n/I18nProvider'
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider'
import { SPACE, STATUS, TAP, type Status } from '../src/theme/tokens'
import { Body, BodyStrong, BreathingDots, Mono, ScreenLoader, Small } from '../src/ui'
import { isMoneyOrStructural } from './_requests.util'

const STR = {
  en: {
    title: 'Ask your home',
    subtitle: 'ANSWERED FROM YOUR UPDATES',
    placeholder: 'Ask anything about your build…',
    footer: 'Answers come from your published updates. Anything I can’t answer goes straight to your site team — I never guess on money or safety.',
    empty: 'Ask about your build — progress, a milestone, a recent change. I answer from your updates, and pass anything I can’t to your site team.',
    micSoon: 'Voice — coming soon',
    moneyNote: 'This touches cost or structure, so your builder will weigh in directly — I won’t guess on money or safety.',
    thinking: 'Looking through your updates…',
    groundedEyebrow: 'FROM YOUR UPDATES',
    provenance: 'Based on your published updates.',
    askBuilder: 'Ask your builder',
    errorMsg: 'I couldn’t check just now. Please try again.',
    retry: 'Try again',
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
    title: 'अपने घर से पूछें',
    subtitle: 'आपके अपडेट्स से जवाब',
    placeholder: 'अपने निर्माण के बारे में कुछ भी पूछें…',
    footer: 'जवाब आपके प्रकाशित अपडेट्स से आते हैं। जो मैं न बता सकूँ वह सीधे आपकी साइट टीम को जाता है — पैसे या सुरक्षा पर मैं अंदाज़ा नहीं लगाता।',
    empty: 'अपने निर्माण के बारे में पूछें — प्रगति, कोई पड़ाव, हाल का बदलाव। मैं आपके अपडेट्स से जवाब देता हूँ, और जो न बता सकूँ वह आपकी साइट टीम को भेज देता हूँ।',
    micSoon: 'आवाज़ — जल्द आ रहा है',
    moneyNote: 'यह लागत या ढाँचे से जुड़ा है, इसलिए आपका बिल्डर सीधे राय देगा — मैं पैसे या सुरक्षा पर अंदाज़ा नहीं लगाता।',
    thinking: 'आपके अपडेट्स देख रहा हूँ…',
    groundedEyebrow: 'आपके अपडेट्स से',
    provenance: 'आपके प्रकाशित अपडेट्स के आधार पर।',
    askBuilder: 'बिल्डर से पूछें',
    errorMsg: 'अभी जाँच नहीं कर पाया। कृपया फिर कोशिश करें।',
    retry: 'फिर कोशिश करें',
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
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  // Show a short date for anything that isn't today, so an older message never
  // reads as if it was sent just now.
  if (d.toDateString() === new Date().toDateString()) return time
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} · ${time}`
}

/** One live grounded exchange (this app-open). Not persisted — a grounded answer
 * is instant info, not a tracked request. An abstain can be promoted to a real
 * team request via the fallback (then it joins the persistent thread above). */
interface Exchange {
  id: string
  question: string
  status: 'pending' | 'grounded' | 'abstain' | 'error'
  answer?: string
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
  const [session, setSession] = useState<Exchange[]>([])
  const [asking, setAsking] = useState(false)
  const [forwardingId, setForwardingId] = useState<string | null>(null)
  const seq = useRef(0)
  const scrollRef = useRef<ScrollView>(null)
  // Only auto-scroll when the session GROWS (a new question/exchange) — not on
  // every content-size change (an answer swapping in, or the keyboard resizing,
  // would otherwise yank a reader who has scrolled up into earlier answers).
  const prevSessionLen = useRef(0)

  // The durable team thread (handed-off questions + the team's status replies).
  const q = useQuery({ queryKey: ['ask', 'requests'], queryFn: () => homeowner.requests() })

  // Persist the live session so the conversation survives leaving the screen (and
  // app restarts), keyed per home. Without this, the just-asked exchanges lived in
  // component state only and vanished on back-navigation — leaving just the older
  // durable thread, which read as "the chat reverted to a previous conversation".
  const propQ = useQuery({ queryKey: ['homeowner', 'property'], queryFn: () => homeowner.property() })
  const siteId = propQ.data?.site_id
  const hydrated = useRef(false)
  const sessionKey = siteId ? `constructo.ask.session.${siteId}` : null

  useEffect(() => {
    if (!sessionKey) return
    AsyncStorage.getItem(sessionKey)
      .then((raw) => {
        // Drop never-finished 'pending' exchanges (an ask interrupted by a close)
        // so nothing is stuck "thinking" forever.
        const saved = raw ? (JSON.parse(raw) as Exchange[]).filter((e) => e.status !== 'pending') : []
        setSession((cur) => {
          if (cur.length === 0) return saved
          const ids = new Set(cur.map((e) => e.id))
          return [...saved.filter((e) => !ids.has(e.id)), ...cur]
        })
      })
      .catch(() => undefined)
      .finally(() => {
        hydrated.current = true
      })
  }, [sessionKey])

  useEffect(() => {
    if (!sessionKey || !hydrated.current) return
    AsyncStorage.setItem(sessionKey, JSON.stringify(session)).catch(() => undefined)
  }, [session, sessionKey])
  // Dedupe by id defensively (a stale/duplicated request would otherwise collide
  // React keys) then sort oldest→newest.
  const requests: HomeownerRequest[] = [
    ...new Map((q.data ?? []).map((r) => [r.id, r])).values(),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at))

  const canSend = !!text.trim() && !asking

  async function onSend() {
    const question = text.trim()
    if (!question || asking) return
    // Globally-unique id: a per-record timestamp + a counter. (A bare counter
    // collided with ids restored from a previous session → duplicate React keys.)
    const id = `x${Date.now().toString(36)}_${(seq.current += 1)}`
    setText('')
    setSession((s) => [...s, { id, question, status: 'pending' }])
    setAsking(true)
    try {
      const res = await homeowner.ask(question)
      setSession((s) =>
        s.map((e) =>
          e.id === id
            ? { ...e, status: res.answerable ? 'grounded' : 'abstain', answer: res.answer }
            : e,
        ),
      )
    } catch {
      setSession((s) => s.map((e) => (e.id === id ? { ...e, status: 'error' } : e)))
    } finally {
      setAsking(false)
    }
  }

  async function onRetry(e: Exchange) {
    if (asking) return
    setSession((s) => s.map((x) => (x.id === e.id ? { ...x, status: 'pending' } : x)))
    setAsking(true)
    try {
      const res = await homeowner.ask(e.question)
      setSession((s) =>
        s.map((x) =>
          x.id === e.id
            ? { ...x, status: res.answerable ? 'grounded' : 'abstain', answer: res.answer }
            : x,
        ),
      )
    } catch {
      setSession((s) => s.map((x) => (x.id === e.id ? { ...x, status: 'error' } : x)))
    } finally {
      setAsking(false)
    }
  }

  // Promote an abstained question into the durable team thread, then drop it from
  // the live session (it reappears above as a real request with a status reply).
  function onForward(e: Exchange) {
    if (forwardingId) return
    setForwardingId(e.id)
    homeowner
      .createRequest({ title: e.question })
      .then(() => {
        setSession((s) => s.filter((x) => x.id !== e.id))
        void qc.invalidateQueries({ queryKey: ['ask', 'requests'] })
      })
      .catch(() => {
        /* leave the fallback button in place so she can retry the hand-off */
      })
      .finally(() => setForwardingId(null))
  }

  const isEmpty = !q.isLoading && requests.length === 0 && session.length === 0

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header — warm card, Feather glyphs (no emoji) */}
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingBottom: SPACE.md,
          paddingHorizontal: SPACE.gutter,
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
          style={{ width: 36, height: 36, justifyContent: 'center' }}
        >
          <Feather name="chevron-left" size={26} color={c.text} />
        </Pressable>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: c.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="zap" size={20} color={c.onAccent} />
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
        // The KAV bottom is the window bottom; the header above it is outside
        // the KAV frame, so no compensation is needed. A non-zero offset adds
        // that many px of empty space above the keyboard (the "gap bug").
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: SPACE.gutter, gap: SPACE.lg }}
          keyboardShouldPersistTaps="handled"
          // Auto-scroll only when the session grows (a new question), so a
          // streamed answer or keyboard resize doesn't yank a scrolled-up reader.
          onContentSizeChange={() => {
            const grew = session.length > prevSessionLen.current
            prevSessionLen.current = session.length
            if (grew) scrollRef.current?.scrollToEnd({ animated: true })
          }}
        >
          {q.isLoading ? (
            <ScreenLoader fill={false} />
          ) : isEmpty ? (
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
              <Body muted style={{ textAlign: 'center', maxWidth: 320 }}>
                {t.empty}
              </Body>
            </View>
          ) : null}

          {/* Durable team thread — handed-off questions + the team's status reply */}
          {requests.map((r) => {
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
          })}

          {/* Live grounded session — instant answers from her published updates */}
          {session.map((e) => {
            const moneyOrStructural = isMoneyOrStructural(e.question)
            return (
              <View key={e.id} style={{ gap: SPACE.sm }}>
                {/* Her question (right, Calm Pine) */}
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
                    <Body color={c.onAccent}>{e.question}</Body>
                  </View>
                </View>

                {/* Assistant bubble (left, warm paper) */}
                <View style={{ alignItems: 'flex-start' }}>
                  <View
                    style={[
                      {
                        maxWidth: '90%',
                        backgroundColor: c.card,
                        borderWidth: 1,
                        borderColor: c.line,
                        borderRadius: theme.radii.card,
                        borderBottomLeftRadius: 6,
                        paddingHorizontal: SPACE.lg,
                        paddingVertical: SPACE.md,
                        gap: 8,
                      },
                      theme.shadowCard,
                    ]}
                  >
                    {e.status === 'pending' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
                        <BreathingDots color={c.accent} />
                        <Body muted>{t.thinking}</Body>
                      </View>
                    ) : e.status === 'error' ? (
                      <>
                        <Body>{t.errorMsg}</Body>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t.retry}
                          onPress={() => onRetry(e)}
                          disabled={asking}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 }}
                        >
                          <Feather name="refresh-cw" size={15} color={c.accent} />
                          <BodyStrong color={c.accent}>{t.retry}</BodyStrong>
                        </Pressable>
                      </>
                    ) : e.status === 'grounded' ? (
                      <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Feather name="zap" size={13} color={c.accent} />
                          <Small style={{ color: c.accent, letterSpacing: 1, fontWeight: '600' }}>
                            {t.groundedEyebrow}
                          </Small>
                        </View>
                        <Body>{e.answer}</Body>
                        <Small muted>{t.provenance}</Small>
                      </>
                    ) : (
                      /* abstain → offer the builder hand-off */
                      <>
                        <Body>{e.answer}</Body>
                        {moneyOrStructural ? (
                          <View style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'flex-start' }}>
                            <Feather name="shield" size={14} color={c.secondary} style={{ marginTop: 2 }} />
                            <Small style={{ flex: 1, color: c.text }}>{t.moneyNote}</Small>
                          </View>
                        ) : null}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t.askBuilder}
                          accessibilityState={{ disabled: forwardingId === e.id }}
                          disabled={forwardingId === e.id}
                          onPress={() => onForward(e)}
                          style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: SPACE.sm,
                            minHeight: TAP,
                            borderRadius: theme.radii.pill,
                            backgroundColor: c.accent,
                            paddingHorizontal: SPACE.lg,
                            opacity: forwardingId === e.id ? 0.6 : pressed ? 0.9 : 1,
                          })}
                        >
                          {forwardingId === e.id ? (
                            <ActivityIndicator color={c.onAccent} />
                          ) : (
                            <Feather name="users" size={16} color={c.onAccent} />
                          )}
                          <BodyStrong color={c.onAccent}>{t.askBuilder}</BodyStrong>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              </View>
            )
          })}
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
            onPress={onSend}
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
            {asking ? (
              <ActivityIndicator color={c.onAccent} />
            ) : (
              <Feather name="arrow-up" size={22} color={c.onAccent} />
            )}
          </Pressable>
        </View>

        {/* Honest footer — grounded from her updates, hand-off to a human team */}
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
