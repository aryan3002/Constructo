/**
 * Homeowner message thread (doc 18 Phase 3) — now built on the UNIFIED CHAT KIT
 * (`src/chat/`), so the homeowner thread renders through the same theme-aware
 * components as the contractor screens (bubbles + capture cards) and gains
 * quote-reply. Daylight theme: warm paper, Calm Pine for her own bubbles, a Calm
 * Pine Send button, ≥48px targets.
 *
 * Capture cards appear here only when a message carries events; today the
 * homeowner channel is talk-only so messages are plain bubbles (the capture →
 * ledger slice will light the cards up). The composer is text + reply for now;
 * camera/voice/@ask arrive with their slices.
 */
import { useMemo, useRef, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../../src/theme/tokens'
import { BodyStrong, QuietState, Small } from '../../../src/ui'
import { homeowner } from '../../../src/api/client'
import {
  ChatComposer,
  MessageFeed,
  messagesToFeed,
  useChatThread,
  type FeedRow,
} from '../../../src/chat'
import { HomeownerAskRow, type AskStatus } from '../_ask_row'

/** An ephemeral inline @ask exchange (Slice B) — not a persisted message. */
interface AskEntry {
  id: number
  question: string
  status: AskStatus
  answer?: string
}

const STR = {
  en: {
    builder: 'Your builder',
    placeholder: 'Message, or @ask a question…',
    send: 'Send',
    emptyTitle: 'No messages yet',
    empty: 'Say hello to your site team — they’ll see it right away.',
    err: 'We couldn’t load this conversation just now.',
    back: 'Back',
  },
  hi: {
    builder: 'आपका बिल्डर',
    placeholder: 'संदेश भेजें, या @ask से सवाल पूछें…',
    send: 'भेजें',
    emptyTitle: 'अभी कोई संदेश नहीं',
    empty: 'अपनी साइट टीम को नमस्ते कहें — वे तुरंत देख लेंगे।',
    err: 'यह बातचीत अभी लोड नहीं हो सकी।',
    back: 'वापस',
  },
} as const

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function HomeownerThread() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const t = STR[lang as 'en' | 'hi'] ?? STR.en

  const { id, kind, title, siteName } = useLocalSearchParams<{
    id: string
    kind: string
    title: string
    siteName: string
  }>()

  const headerTitle = kind === 'homeowner' ? t.builder : title || t.builder

  const thread = useChatThread({ conversationId: id })
  const [text, setText] = useState('')

  // Inline @ask (Slice B): ephemeral grounded answers, shown right in the thread.
  const [asks, setAsks] = useState<AskEntry[]>([])
  const askId = useRef(0)

  // Abstained answers can be promoted into the durable builder request thread.
  const askBuilder = async (entry: AskEntry) => {
    try {
      await homeowner.createRequest({ title: entry.question })
      setAsks((prev) => prev.filter((a) => a.id !== entry.id))
    } catch {
      /* keep the row so she can retry */
    }
  }

  const items: FeedRow[] = useMemo(() => {
    const base = messagesToFeed(thread.messages, (lang as 'en' | 'hi') ?? 'en')
    const askRows: FeedRow[] = asks.map((a) => ({
      kind: 'custom',
      key: `ask:${a.id}`,
      node: (
        <HomeownerAskRow
          question={a.question}
          status={a.status}
          answer={a.answer}
          onAskBuilder={a.status === 'abstain' ? () => askBuilder(a) : undefined}
        />
      ),
    }))
    return [...base, ...askRows]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.messages, lang, asks])

  const onSend = async () => {
    const body = text.trim()
    if (!body) return
    // "@ask <question>" → an inline grounded answer (not sent as a chat message).
    if (/^@ask\b/i.test(body)) {
      const question = body.replace(/^@ask\s*/i, '').trim()
      if (!question) return
      setText('')
      const id = (askId.current += 1)
      setAsks((prev) => [...prev, { id, question, status: 'pending' }])
      try {
        const res = await homeowner.ask(question)
        setAsks((prev) =>
          prev.map((a) =>
            a.id === id
              ? { ...a, status: res.answerable ? 'grounded' : 'abstain', answer: res.answer }
              : a,
          ),
        )
      } catch {
        setAsks((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'error' } : a)))
      }
      return
    }
    setText('')
    try {
      await thread.send(body)
    } catch {
      setText(body) // restore so she can retry (no optimistic UI — keep it calm)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + 56}
    >
      {/* Header — warm card, back chevron, title + calm site subtitle */}
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
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: kind === 'homeowner' ? AP.chip : c.secondaryContainer,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather
            name={kind === 'homeowner' ? 'home' : 'users'}
            size={18}
            color={kind === 'homeowner' ? AP.onChip : c.secondary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <BodyStrong numberOfLines={1}>{headerTitle}</BodyStrong>
          {siteName ? (
            <Small muted numberOfLines={1}>
              {siteName}
            </Small>
          ) : null}
        </View>
      </View>

      {thread.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : thread.error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.lg }}>
          <Small muted style={{ textAlign: 'center' }}>
            {t.err}
          </Small>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <MessageFeed
            items={items}
            mineSide="homeowner"
            time={timeLabel}
            onLongPressMessage={(m) => thread.setReply(m)}
            emptyState={
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <QuietState icon="message-circle" title={t.emptyTitle} message={t.empty} />
              </View>
            }
          />
        </View>
      )}

      <ChatComposer
        value={text}
        onChange={setText}
        onSend={onSend}
        sending={thread.sending}
        placeholder={t.placeholder}
        sendAccessibilityLabel={t.send}
        reply={thread.reply ? { snippet: thread.reply.body ?? '' } : null}
        onCancelReply={() => thread.setReply(null)}
        insetsBottom={insets.bottom}
      />
    </KeyboardAvoidingView>
  )
}
