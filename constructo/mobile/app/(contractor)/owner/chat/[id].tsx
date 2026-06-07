/**
 * Owner conversation detail (doc 18 Phase 1) — read + send/reply + mark-read for
 * one site crew thread. Reuses the shared MessageView primitives (CaptureCard for
 * messages that minted a SiteEvent, MessageBubble otherwise) so it renders the
 * thread identically to the supervisor crew chat. Site-keyed chat API, no schema
 * change. Radar / dispute / recap / smart-suggest / voice are deferred (Phase 2).
 *
 * Blueprint theme: warm paper, amber Send fill with dark ink, ≥48px targets,
 * Hindi-first copy. A header cue + composer; the read cursor advances on the
 * newest seq and invalidates the inbox so its unread badge clears.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useT } from '../../../../src/i18n/I18nProvider'
import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE } from '../../../../src/theme/tokens'
import { BodyStrong, Small } from '../../../../src/ui'
import { CaptureCard, MessageBubble } from '../../../../src/chat/MessageView'
import { chatApi, newClientMsgId, type ChatEvent, type ChatMessage } from '../../../../src/api/chat'
import { LoadingBlock, ErrorBlock } from '../_components'

const STR = {
  en: {
    placeholder: 'Message your site team…',
    send: 'Send',
    empty: 'No messages yet.',
    err: 'Could not load this conversation.',
    retry: 'Try again',
    replyingTo: 'Replying to',
    cancel: 'Cancel',
    client: 'Client is in this thread',
    back: 'Back',
    site: 'Site',
    unavailable: "This conversation isn't available yet.",
  },
  hi: {
    placeholder: 'अपनी साइट टीम को मैसेज करें…',
    send: 'भेजो',
    empty: 'अभी कोई मैसेज नहीं।',
    err: 'यह बातचीत लोड नहीं हो सकी।',
    retry: 'फिर कोशिश करें',
    replyingTo: 'जवाब:',
    cancel: 'रद्द करें',
    client: 'इस चैट में ग्राहक मौजूद है',
    back: 'पीछे',
    site: 'साइट',
    unavailable: 'यह बातचीत अभी उपलब्ध नहीं है।',
  },
} as const

/** A one-line gist of a message — its card's summary, else its text. */
function msgSnippet(m: ChatMessage | undefined | null): string {
  if (!m) return ''
  const ev = m.events?.find((e) => e.event_type !== 'unknown')
  if (ev) return ev.summary || ev.event_type
  return m.body ?? ''
}

export default function OwnerConversation() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const qc = useQueryClient()
  const str = STR[lang]
  const listRef = useRef<FlatList>(null)

  const { siteId, title, hasHomeowner } = useLocalSearchParams<{
    siteId: string
    title: string
    hasHomeowner: string
  }>()

  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [sending, setSending] = useState(false)

  const q = useQuery({
    queryKey: ['owner', 'chat', siteId],
    queryFn: () => chatApi.messages(siteId, 0),
    refetchInterval: 8000,
    enabled: !!siteId,
  })

  const messages = useMemo(() => q.data ?? [], [q.data])

  // Mark-read: advance the cursor to the newest seq, then clear the inbox badge.
  const newestSeq = messages.length > 0 ? messages[messages.length - 1].seq : 0
  useEffect(() => {
    if (!siteId || newestSeq <= 0) return
    chatApi
      .read(siteId, newestSeq)
      .then(() => qc.invalidateQueries({ queryKey: ['owner', 'conversations'] }))
      .catch(() => undefined)
  }, [siteId, newestSeq, qc])

  const scrollToEnd = () =>
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))

  const onSend = async () => {
    const body = text.trim()
    if (!body || !siteId || sending) return
    setSending(true)
    const replyToId = replyTo?.id
    setText('')
    setReplyTo(null)
    try {
      await chatApi.send({
        site_id: siteId,
        client_msg_id: newClientMsgId(),
        body,
        ...(replyToId ? { reply_to_id: replyToId } : {}),
        media_type: 'text',
      })
      await q.refetch()
      scrollToEnd()
    } catch {
      // Restore the text so the user can retry; keep it simple (no optimistic UI).
      setText(body)
    } finally {
      setSending(false)
    }
  }

  // A non-`site` thread (future homeowner/group) has no site_id, so the detail
  // query is disabled (`enabled: !!siteId`) and would otherwise dead-end on a
  // blank screen. Show a calm bilingual line instead. Phase 1 only returns
  // `site` threads, so this is latent — but cheap to guard now.
  if (!siteId) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: SPACE.lg, justifyContent: 'center' }}>
        <Small muted style={{ textAlign: 'center' }}>{str.unavailable}</Small>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + SPACE.sm,
          paddingBottom: SPACE.sm,
          paddingHorizontal: SPACE.lg,
          backgroundColor: c.card,
          borderBottomColor: c.line,
          borderBottomWidth: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={str.back}
          onPress={() => router.back()}
          hitSlop={10}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <Feather name="chevron-left" size={24} color={c.text} />
        </Pressable>
        <BodyStrong style={{ flex: 1 }} numberOfLines={1}>
          {title || str.site}
        </BodyStrong>
      </View>

      {/* Client-present banner (shape + --info tint, never color alone). */}
      {hasHomeowner === '1' ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: SPACE.xs,
            paddingHorizontal: SPACE.lg,
            // 10% tint of theme info (#3b7dd8) — Blueprint is light-only.
            backgroundColor: 'rgba(59,125,216,0.10)',
            borderBottomColor: c.line,
            borderBottomWidth: 1,
          }}
        >
          <Small style={{ color: c.info }}>◆</Small>
          <Small style={{ color: c.info, flex: 1 }}>{str.client}</Small>
        </View>
      ) : null}

      {/* Messages */}
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error ? (
        <View style={{ flex: 1, padding: SPACE.lg, justifyContent: 'center' }}>
          <ErrorBlock message={str.err} retryLabel={str.retry} onRetry={() => void q.refetch()} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: SPACE.lg, gap: SPACE.sm, flexGrow: 1 }}
          onContentSizeChange={scrollToEnd}
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Small muted>{str.empty}</Small>
            </View>
          }
          renderItem={({ item }) => {
            const cardEvents = item.events?.filter((e: ChatEvent) => e.event_type !== 'unknown') ?? []
            if (cardEvents.length > 0) {
              const mine = item.sender_side === 'contractor'
              return (
                <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '92%', gap: SPACE.sm }}>
                  {cardEvents.map((ev: ChatEvent, i: number) => (
                    // The source text / attachment / time belong to the MESSAGE,
                    // not each event — pass them to the first card only so the
                    // proof reveal doesn't visually duplicate across sibling cards.
                    <CaptureCard
                      key={ev.id}
                      event={ev}
                      lang={lang}
                      sourceText={i === 0 ? item.body : undefined}
                      attachmentUrl={i === 0 ? item.attachment_url : undefined}
                      time={i === 0 ? new Date(item.created_at).toLocaleTimeString() : ''}
                    />
                  ))}
                </View>
              )
            }
            return (
              <MessageBubble
                body={item.body}
                mine={item.sender_side === 'contractor'}
                attachmentUrl={item.attachment_url}
                timestamp={new Date(item.created_at).toLocaleTimeString()}
                onLongPress={() => setReplyTo(item)}
              />
            )
          }}
        />
      )}

      {/* Quote-reply banner */}
      {replyTo ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.sm,
            marginHorizontal: SPACE.lg,
            marginBottom: SPACE.xs,
            paddingVertical: SPACE.xs,
            paddingHorizontal: SPACE.md,
            borderRadius: theme.radii.control,
            borderLeftWidth: 3,
            borderLeftColor: c.accent,
            backgroundColor: c.paper,
          }}
        >
          <View style={{ flex: 1 }}>
            <Small style={{ color: c.textMute, fontWeight: '600' }}>{str.replyingTo}</Small>
            <Small numberOfLines={1} style={{ color: c.text }}>
              {msgSnippet(replyTo)}
            </Small>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={str.cancel}
            onPress={() => setReplyTo(null)}
            hitSlop={8}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="x" size={20} color={c.textMute} />
          </Pressable>
        </View>
      ) : null}

      {/* Composer */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: SPACE.sm,
          paddingHorizontal: SPACE.lg,
          paddingTop: SPACE.sm,
          paddingBottom: Math.max(insets.bottom, SPACE.sm),
          backgroundColor: c.card,
          borderTopColor: c.line,
          borderTopWidth: 1,
        }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={str.placeholder}
          placeholderTextColor={c.textMute}
          multiline
          style={{
            flex: 1,
            minHeight: 48,
            maxHeight: 120,
            borderRadius: theme.radii.control,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.bg,
            paddingHorizontal: SPACE.md,
            paddingTop: SPACE.sm,
            paddingBottom: SPACE.sm,
            fontFamily: 'Hind-Regular',
            fontSize: 16,
            color: c.text,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={str.send}
          onPress={() => void onSend()}
          disabled={!text.trim() || sending}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            minWidth: 64,
            minHeight: 48,
            paddingHorizontal: SPACE.lg,
            borderRadius: theme.radii.control,
            justifyContent: 'center',
            backgroundColor: text.trim() ? c.accent : c.line,
          }}
        >
          <Feather name="send" size={16} color={text.trim() ? c.onAccent : c.textMute} />
          <BodyStrong style={{ color: text.trim() ? c.onAccent : c.textMute }}>{str.send}</BodyStrong>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}
