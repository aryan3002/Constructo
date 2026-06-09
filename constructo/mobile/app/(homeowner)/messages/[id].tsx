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
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { AP, SPACE, TAP } from '../../../src/theme/tokens'
import { BodyStrong, QuietState, Small } from '../../../src/ui'
import { homeowner } from '../../../src/api/client'
import { actionItemsApi } from '../../../src/api/actionItems'
import { useAuth } from '../../../src/auth/AuthContext'
import { chatApi, type ChatMessage } from '../../../src/api/chat'
import { ChatComposer, MessageFeed, useChatThread, type FeedRow } from '../../../src/chat'
import { HomeownerAskRow, type AskStatus } from '../_ask_row'
import { HOME_ROOM_STR, weaveHomeRoom, type DecisionAction } from '../_home_room.util'
import { HomeRoomDecisionCard, HomeRoomUpdateCard } from '../_messages_components'

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
    reply: 'Reply',
    makeTodo: 'Make a to-do',
    todoErr: 'We couldn’t make that to-do just now.',
    todos: 'To-dos',
    cancel: 'Cancel',
    photo: 'Send a photo',
    photoErr: 'We couldn’t send that photo just now.',
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
  const { siteId } = useAuth()
  const qc = useQueryClient()

  // Home Room weave (#158): in her builder channel (kind=homeowner, which has a
  // site), interleave the published Updates + pending Decisions as on-brand cards
  // she can act on in place. A group thread has no single site → plain feed.
  const isBuilder = kind === 'homeowner'
  const homeRoom = isBuilder && !!siteId
  const hr = HOME_ROOM_STR[lang as 'en' | 'hi'] ?? HOME_ROOM_STR.en

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
  const capsQ = useQuery({
    queryKey: ['homeowner', 'capabilities', siteId],
    queryFn: () => homeowner.capabilities(siteId ?? undefined),
    enabled: homeRoom,
  })
  const canApprove = capsQ.data?.can_approve ?? false

  // Her in-thread action on a pending decision (approve is owners-only server-side).
  const onRespondDecision = async (decisionId: string, action: DecisionAction, note?: string) => {
    try {
      await homeowner.respondDecision(decisionId, action, note)
      await Promise.all([
        decisionsQ.refetch(),
        qc.invalidateQueries({ queryKey: ['homeowner', 'home'] }),
      ])
      Alert.alert(
        '',
        action === 'approve'
          ? hr.approved
          : action === 'comment'
            ? hr.commentSent
            : hr.changeRequested,
      )
    } catch {
      Alert.alert('', hr.respondErr)
    }
  }

  // Make a to-do from a message (Slice C) — her own action item, linked back to
  // the message. site_id comes from her restored auth state (the builder channel
  // is her site). She sees only her own to-dos in the To-dos screen.
  const makeTodo = async (m: ChatMessage) => {
    const title = (m.body ?? '').trim()
    if (!siteId || !title) return
    try {
      await actionItemsApi.create({ site_id: siteId, title, source_message_id: m.id })
      router.push('/(homeowner)/todos')
    } catch {
      Alert.alert(t.makeTodo, t.todoErr)
    }
  }

  // Long-press a message → Reply or Make a to-do.
  const onLongPress = (m: ChatMessage) => {
    Alert.alert(headerTitle, undefined, [
      { text: t.reply, onPress: () => thread.setReply(m) },
      { text: t.makeTodo, onPress: () => void makeTodo(m) },
      { text: t.cancel, style: 'cancel' },
    ])
  }

  // Send a photo (Slice D): pick from camera/library → upload to her channel →
  // send as a document so the worker OCRs a challan into a card (booked to her
  // site, flagged for crew confirm). Only her builder channel (it has a site).
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
    const mime = asset.mimeType ?? 'image/jpeg'
    try {
      const uploaded = await chatApi.uploadMedia(
        { conversationId: id },
        { uri: asset.uri, name: asset.fileName ?? 'photo.jpg', type: mime },
        'document',
      )
      await thread.sendMedia({
        attachmentKey: uploaded.key,
        mime,
        sha256: uploaded.sha256,
        mediaType: 'document',
      })
    } catch {
      Alert.alert(t.photo, t.photoErr)
    }
  }

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
    // Weave her messages (bubbles + capture cards) with the published Updates +
    // pending Decisions, chronologically; render update/decision rows as the
    // signature Home Room cards.
    const woven = weaveHomeRoom(
      thread.messages,
      homeRoom ? (updatesQ.data?.items ?? []) : [],
      homeRoom ? (decisionsQ.data ?? []) : [],
      (lang as 'en' | 'hi') ?? 'en',
    )
    const base: FeedRow[] = woven.map((r) => {
      if (r.kind === 'update')
        return { kind: 'custom', key: r.key, node: <HomeRoomUpdateCard update={r.update} /> }
      if (r.kind === 'decision')
        return {
          kind: 'custom',
          key: r.key,
          node: (
            <HomeRoomDecisionCard
              decision={r.decision}
              canApprove={canApprove}
              str={hr}
              onRespond={(a, n) => onRespondDecision(r.decision.id, a, n)}
            />
          ),
        }
      return r.item
    })
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
  }, [thread.messages, lang, asks, homeRoom, updatesQ.data, decisionsQ.data, canApprove, hr])

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
            onLongPressMessage={onLongPress}
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
        leadingActions={
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
        }
      />
    </KeyboardAvoidingView>
  )
}
