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
import { useCallback, useMemo, useRef, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { AP, SPACE, TAP } from '../../../src/theme/tokens'
import { Avatar, BodyStrong, BreathingDots, QuietState, Small } from '../../../src/ui'
import { FadeInUp } from '../../../src/ui/motion'
import { homeowner } from '../../../src/api/client'
import { actionItemsApi } from '../../../src/api/actionItems'
import { useAuth } from '../../../src/auth/AuthContext'
import { newClientMsgId, type ChatMessage } from '../../../src/api/chat'
import { enqueueChatSend } from '../../../src/chat/outbox'
import { ChatComposer, MessageBubble, MessageFeed, SystemNotice, useChatThread, messagesToFeed, type FeedRow } from '../../../src/chat'
import { takePhotoSend } from '../../../src/chat/markupHandoff'
import { systemNotice } from '../../../src/chat/systemNotice'
import { HomeownerAskRow, type AskStatus } from '../_ask_row'
import { summarizeWaiting } from '../../../src/homeowner/waiting'
import { ThreadSummaryStrip } from '../_thread_summary_strip'

/** An ephemeral inline @ask exchange (Slice B) — not a persisted message.
 *  `createdAt` (epoch ms) lets us interleave it with real messages by time, so a
 *  message sent AFTER an @ask renders below the answer, not above it. */
interface AskEntry {
  id: number
  question: string
  status: AskStatus
  answer?: string
  createdAt: number
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
    reply: 'Reply',
    makeTodo: 'Make a to-do',
    todoErr: 'We couldn’t make that to-do just now.',
    todos: 'To-dos',
    cancel: 'Cancel',
    photo: 'Send a photo',
    photoErr: 'We couldn’t send that photo just now.',
    caption: 'Add a caption…',
    markup: 'Markup',
    tapRetry: 'Tap to retry',
    mic: 'Hold to record — coming soon',
    micLabel: 'Voice message (coming soon)',
    members: 'Participants',
  },
  hi: {
    builder: 'आपका बिल्डर',
    placeholder: 'संदेश भेजें, या @ask से सवाल पूछें…',
    send: 'भेजें',
    emptyTitle: 'अभी कोई संदेश नहीं',
    empty: 'अपनी साइट टीम को नमस्ते कहें — वे तुरंत देख लेंगे।',
    err: 'यह बातचीत अभी लोड नहीं हो सकी।',
    back: 'वापस',
    reply: 'जवाब दें',
    makeTodo: 'काम बनाएं',
    todoErr: 'अभी यह काम नहीं बना सके।',
    todos: 'काम',
    cancel: 'रद्द करें',
    photo: 'फ़ोटो भेजें',
    photoErr: 'अभी फ़ोटो नहीं भेज सके।',
    caption: 'कैप्शन जोड़ें…',
    markup: 'मार्कअप',
    tapRetry: 'फिर भेजने के लिए टैप करें',
    mic: 'दबाकर रिकॉर्ड करें — जल्द आएगा',
    micLabel: 'वॉयस संदेश (जल्द आएगा)',
    members: 'प्रतिभागी',
  },
} as const

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** A one-line gist of a message — its card's summary, else its text. */
function msgSnippet(m: ChatMessage | undefined | null): string {
  if (!m) return ''
  const ev = m.events?.find((e) => e.event_type !== 'unknown')
  if (ev) return ev.summary || ev.event_type
  return m.body ?? ''
}

/** Day-separator label: Today / Yesterday / "8 Jun", localized. */
function dayLabelFor(iso: string, lang: 'en' | 'hi'): string {
  const d = new Date(iso)
  const now = new Date()
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  if (key(d) === key(now)) return lang === 'hi' ? 'आज' : 'Today'
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (key(d) === key(y)) return lang === 'hi' ? 'कल' : 'Yesterday'
  return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : undefined, { day: 'numeric', month: 'short' })
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

  const { siteId, me } = useAuth()
  const thread = useChatThread({ conversationId: id }, { myUserId: me?.id })
  const [text, setText] = useState('')

  // The builder channel (kind=homeowner, has a site) surfaces its published
  // Updates + pending Decisions as a pinned summary STRIP above the pure chat —
  // never woven into the message stream. She acts on them on their own screens.
  // A group thread has no single site → no strip, just chat.
  const isBuilder = kind === 'homeowner'
  const homeRoom = isBuilder && !!siteId

  const updatesQ = useQuery({
    queryKey: ['homeowner', 'updates', siteId],
    queryFn: () => homeowner.updates(siteId ?? undefined),
    enabled: homeRoom,
  })
  const decisionsQ = useQuery({
    queryKey: ['homeowner', 'decisions', siteId],
    queryFn: () => homeowner.decisions(siteId ?? undefined),
    enabled: homeRoom,
  })

  const waiting = summarizeWaiting(
    homeRoom ? (updatesQ.data?.items ?? []) : [],
    homeRoom ? (decisionsQ.data ?? []) : [],
  )

  // Make a to-do from a message (Slice C) — her own action item, linked back to
  // the message. site_id comes from her restored auth state (the builder channel
  // is her site). She sees only her own to-dos in the To-dos screen.
  const makeTodo = useCallback(
    async (m: ChatMessage) => {
      const title = (m.body ?? '').trim()
      if (!siteId || !title) return
      try {
        await actionItemsApi.create({ site_id: siteId, title, source_message_id: m.id })
        router.push('/(homeowner)/todos')
      } catch {
        Alert.alert(t.makeTodo, t.todoErr)
      }
    },
    [siteId, router, t],
  )

  // Long-press a message → Reply or Make a to-do. Memoized so it stays a stable
  // prop to MessageFeed (an unstable ref would re-run its renderItem each keystroke).
  // Depends on thread.setReply (a raw useState setter, identity-stable), never on
  // the `thread` object itself — that changes when messages/pending move, which
  // includes every keystroke-adjacent poll tick.
  const setReply = thread.setReply
  const onLongPress = useCallback(
    (m: ChatMessage) => {
      Alert.alert(headerTitle, undefined, [
        { text: t.reply, onPress: () => setReply(m) },
        { text: t.makeTodo, onPress: () => void makeTodo(m) },
        { text: t.cancel, style: 'cancel' },
      ])
    },
    [headerTitle, t, setReply, makeTodo],
  )

  // Stable day-separator labeler — a fresh closure here would re-run MessageFeed's
  // O(n) annotate/render memos on every keystroke (the composer state lives here).
  const dayLabel = useCallback(
    (iso: string) => dayLabelFor(iso, (lang as 'en' | 'hi') ?? 'en'),
    [lang],
  )

  // Quote-reply: render the parent message's snippet above a reply bubble (parity
  // with the contractor threads).
  const byId = useMemo(() => {
    const m = new Map<string, ChatMessage>()
    for (const x of thread.messages) m.set(x.id, x)
    return m
  }, [thread.messages])
  const replySnippetFor = useCallback(
    (m: ChatMessage) => (m.reply_to_id ? msgSnippet(byId.get(m.reply_to_id)) || null : null),
    [byId],
  )

  // Send a photo: pick from camera/library → push the WhatsApp-style preview
  // route (caption + markup) → on return, the preview hands back {uri, caption}.
  // Enqueue with the LOCAL uri (the durable outbox uploads on drain) so the pending
  // bubble shows the actual photo + caption immediately — no caption-only flicker.
  // Consume-once, so it never double-sends.
  useFocusEffect(
    useCallback(() => {
      const s = takePhotoSend()
      if (!s) return
      void (async () => {
        try {
          await enqueueChatSend({
            clientMsgId: newClientMsgId(),
            address: { conversation_id: id },
            ...(s.caption ? { body: s.caption } : {}),
            media: { kind: 'image', mime: s.mime, localUri: s.uri },
          })
          await thread.flush()
        } catch {
          Alert.alert(t.photo, t.photoErr)
        }
      })()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]),
  )

  const onCamera = async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync()
    let result: ImagePicker.ImagePickerResult
    if (cam.granted) {
      result = await ImagePicker.launchCameraAsync({ quality: 0.6 })
    } else {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!lib.granted) return
      result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 })
    }
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    router.push({
      pathname: '/photo-preview',
      params: {
        uri: asset.uri,
        mime: asset.mimeType ?? 'image/jpeg',
        markup: '1',
        placeholder: t.caption,
        markupLabel: t.markup,
      },
    })
  }

  // Inline @ask (Slice B): ephemeral grounded answers, shown right in the thread.
  const [asks, setAsks] = useState<AskEntry[]>([])
  const askId = useRef(0)

  // Stable element — an inline JSX child would hand MessageFeed a fresh
  // ListEmptyComponent every keystroke (composer state lives in this screen).
  const emptyState = useMemo(
    () => (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <QuietState icon="message-circle" title={t.emptyTitle} message={t.empty} />
      </View>
    ),
    [t],
  )

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
    // Pure chat: her messages only (a captured photo stays a photo bubble, not a
    // card — the structured detection lives on its own screen). System notices
    // render centered. Updates/Decisions are NOT woven in — they're in the strip.
    // Each row carries its epoch-ms timestamp so messages and @ask answers can be
    // interleaved chronologically (an @ask answer stays where it was asked).
    const baseItems = messagesToFeed(thread.messages, (lang as 'en' | 'hi') ?? 'en', {
      capturesAsBubbles: true,
    }).map((row) => {
      const ts = Date.parse(row.message.created_at) || 0
      const noticeText = systemNotice(row.message)
      const feedRow: FeedRow =
        noticeText !== null ? { kind: 'custom', key: row.key, node: <SystemNotice text={noticeText} /> } : row
      return { ts, row: feedRow }
    })
    const askItems = asks.map((a) => ({
      ts: a.createdAt,
      row: {
        kind: 'custom' as const,
        key: `ask:${a.id}`,
        node: (
          <HomeownerAskRow
            question={a.question}
            status={a.status}
            answer={a.answer}
            onAskBuilder={a.status === 'abstain' ? () => askBuilder(a) : undefined}
          />
        ),
      } as FeedRow,
    }))
    // Stable sort by time → equal timestamps keep server seq order (messagesToFeed).
    const timeline: FeedRow[] = [...baseItems, ...askItems]
      .sort((a, b) => a.ts - b.ts)
      .map((x) => x.row)
    // Durable-outbox pending bubbles — a storage-backed message that hasn't yet
    // confirmed from the server. Rendered as her own bubble with a calm status.
    // EVERY pending bubble is tappable: failed_permanent re-queues it; a still-
    // queued one just nudges the drain ("send now" beats waiting out a backoff).
    const pendingRows: FeedRow[] = thread.pending.map((p) => ({
      kind: 'custom',
      key: `pending:${p.clientMsgId}`,
      node: (
        <Pressable
          onPress={() =>
            p.state === 'failed_permanent'
              ? void thread.retry(p.clientMsgId)
              : void thread.flush()
          }
          style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.md }}
        >
          <MessageBubble
            body={p.body}
            attachmentUrl={p.mediaUri}
            mine
            timestamp={p.state === 'failed_permanent' ? t.tapRetry : t.send + '…'}
          />
        </Pressable>
      ),
    }))
    // Pending are the very latest (in-flight) — they belong at the bottom.
    return [...timeline, ...pendingRows]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.messages, thread.pending, lang, asks])

  const onSend = async () => {
    const body = text.trim()
    if (!body) return
    // "@ask <question>" → an inline grounded answer (not sent as a chat message).
    if (/^@ask\b/i.test(body)) {
      const question = body.replace(/^@ask\s*/i, '').trim()
      if (!question) return
      setText('')
      const id = (askId.current += 1)
      setAsks((prev) => [...prev, { id, question, status: 'pending', createdAt: Date.now() }])
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
      // This KAV is the root view (headerShown:false), spanning from the screen
      // top — so the offset is 0. A non-zero offset adds that many px of padding
      // ABOVE the keyboard (the gap bug: insets.top+56 ≈ 115px of empty space).
      keyboardVerticalOffset={0}
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

        {/* D1: Participants avatar cluster — taps to the Members roster. */}
        <Pressable
          onPress={() => router.push('/(homeowner)/members')}
          accessibilityRole="button"
          accessibilityLabel={t.members}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          {kind === 'homeowner' ? (
            /* Builder channel: stacked initials cluster — site team (hard-hat),
               co-owner (user), you (home) — matching the prototype's participant
               header. Three overlapping circles for a "whole team" feel. */
            <View style={{ width: 76, height: 40, position: 'relative' }}>
              {/* S — site team */}
              <View style={{
                position: 'absolute', left: 0, top: 0,
                width: 34, height: 34, borderRadius: 17,
                backgroundColor: AP.surfaceContainer,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Feather name="tool" size={14} color={c.textMute} />
              </View>
              {/* R — co-owner */}
              <View style={{
                position: 'absolute', left: 18, top: 0,
                width: 34, height: 34, borderRadius: 17,
                backgroundColor: c.secondaryContainer,
                borderWidth: 2, borderColor: c.card,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Feather name="user" size={14} color={c.secondary} />
              </View>
              {/* P — you (homeowner, accent) */}
              <View style={{
                position: 'absolute', left: 36, top: 0,
                width: 34, height: 34, borderRadius: 17,
                backgroundColor: AP.chip,
                borderWidth: 2, borderColor: c.card,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Feather name="home" size={14} color={AP.onChip} />
              </View>
            </View>
          ) : (
            /* Group thread: stacked pair (the title Avatar + a "+group" cue). */
            <View style={{ flexDirection: 'row' }}>
              <Avatar name={headerTitle} size={40} />
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: c.secondaryContainer,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: -12,
                  borderWidth: 2,
                  borderColor: c.card,
                }}
              >
                <Feather name="users" size={16} color={c.secondary} />
              </View>
            </View>
          )}
        </Pressable>

        <View style={{ flex: 1, gap: 2 }}>
          <BodyStrong numberOfLines={1}>{headerTitle}</BodyStrong>
          {/* Subtitle: site name for the builder channel; participants for groups.
              An online dot + participant list mirrors the prototype's header. */}
          {kind === 'homeowner' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
              {/* Green dot only when connected — grey + "Connecting…" when the
                  socket/network is down, so the dot never lies. */}
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: thread.online ? c.accent : c.textMute,
                }}
              />
              <Small muted numberOfLines={1}>
                {!thread.online
                  ? lang === 'hi'
                    ? 'कनेक्ट हो रहा है…'
                    : 'Connecting…'
                  : siteName
                    ? siteName
                    : lang === 'hi'
                      ? 'साइट टीम · आप · सह-मालिक'
                      : 'Site team · You · Co-owner'}
              </Small>
            </View>
          ) : !thread.online ? (
            <Small muted numberOfLines={1}>
              {lang === 'hi' ? 'कनेक्ट हो रहा है…' : 'Connecting…'}
            </Small>
          ) : siteName ? (
            <Small muted numberOfLines={1}>
              {siteName}
            </Small>
          ) : null}
        </View>
        {/* Her To-dos — also reachable by long-pressing a message → Make a to-do. */}
        <Pressable
          onPress={() => router.push('/(homeowner)/todos')}
          accessibilityRole="button"
          accessibilityLabel={t.todos}
          hitSlop={10}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <Feather name="check-square" size={22} color={c.accentDeep} />
        </Pressable>
      </View>

      {/* Pinned summary of everything AI-derived — never woven into the chat. */}
      {homeRoom ? (
        <ThreadSummaryStrip
          updateCount={waiting.updateCount}
          needsYouCount={waiting.needsYouCount}
          lang={(lang as 'en' | 'hi') ?? 'en'}
          onOpenUpdates={() => router.push('/(homeowner)/updates')}
          onOpenDecisions={() => router.push('/(homeowner)/updates')}
        />
      ) : null}

      {thread.isLoading && thread.messages.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <BreathingDots />
        </View>
      ) : thread.error && thread.messages.length === 0 ? (
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
            dayLabel={dayLabel}
            onLongPressMessage={onLongPress}
            deliveryStateFor={thread.deliveryState}
            replySnippetFor={replySnippetFor}
            newMessagesLabel={lang === 'hi' ? 'नए संदेश' : 'New messages'}
            emptyState={emptyState}
          />
        </View>
      )}

      {thread.isTyping && (
        <FadeInUp
          style={{
            position: 'absolute',
            left: SPACE.lg,
            bottom: Math.max(insets.bottom, SPACE.sm) + 64, // above composer
            backgroundColor: c.paper,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: c.line,
            zIndex: 10,
          }}
        >
          <BreathingDots />
        </FadeInUp>
      )}

      <ChatComposer
        value={text}
        onChange={setText}
        onSend={onSend}
        placeholder={t.placeholder}
        sendAccessibilityLabel={t.send}
        sendTyping={thread.sendTyping}
        reply={thread.reply ? { snippet: thread.reply.body ?? '' } : null}
        onCancelReply={() => thread.setReply(null)}
        insetsBottom={insets.bottom}
        leadingActions={
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            {/* Camera — live action (picks from camera or library). */}
            <Pressable
              onPress={() => void onCamera()}
              accessibilityRole="button"
              accessibilityLabel={t.photo}
              style={{
                width: TAP,
                height: TAP,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radii.card,
                borderWidth: 1,
                borderColor: c.line,
                backgroundColor: c.paper,
              }}
            >
              <Feather name="camera" size={20} color={c.accentDeep} />
            </Pressable>

            {/* D4: Mic — honest coming-soon stub. Labeled in the UI; no
                fake recording. The `belowComposer` slot (voice recorder)
                will replace this once the audio slice ships. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.micLabel}
              onLongPress={() => Alert.alert('', t.mic)}
              onPress={() => Alert.alert('', t.mic)}
              style={{
                width: TAP,
                height: TAP,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radii.card,
                borderWidth: 1,
                borderColor: c.line,
                backgroundColor: c.paper,
                opacity: 0.5,
              }}
            >
              <Feather name="mic" size={20} color={c.textMute} />
            </Pressable>
          </View>
        }
      />
    </KeyboardAvoidingView>
  )
}
