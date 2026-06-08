/**
 * Homeowner message thread (doc 18 Phase 3) — read + send + mark-read for one
 * channel (her private builder channel, or a group she's in). Daylight theme:
 * warm paper, Calm Pine for her own bubbles, soft white cards for the builder's,
 * a Calm Pine Send button (icon + label, never icon-only), ≥48px targets.
 *
 * EVERY message renders as a DaylightBubble — `m.events` (CaptureCards) are
 * intentionally ignored here; her calm thread is conversation, not capture UI.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
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

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { AP, SPACE, TAP } from '../../../src/theme/tokens'
import { BodyStrong, QuietState, Small } from '../../../src/ui'
import { chatApi, newClientMsgId, type ChatMessage } from '../../../src/api/chat'
import { DaylightBubble } from '../_messages_components'

const STR = {
  en: {
    builder: 'Your builder',
    placeholder: 'Message your site team…',
    send: 'Send',
    emptyTitle: 'No messages yet',
    empty: 'Say hello to your site team — they’ll see it right away.',
    err: 'We couldn’t load this conversation just now.',
    back: 'Back',
  },
  hi: {
    builder: 'आपका बिल्डर',
    placeholder: 'अपनी साइट टीम को संदेश भेजें…',
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
  const qc = useQueryClient()
  const t = STR[lang as 'en' | 'hi'] ?? STR.en
  const listRef = useRef<FlatList<ChatMessage>>(null)

  const { id, kind, title, siteName } = useLocalSearchParams<{
    id: string
    kind: string
    title: string
    siteName: string
  }>()

  const headerTitle = kind === 'homeowner' ? t.builder : title || t.builder

  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const q = useQuery({
    queryKey: ['homeowner', 'thread', id],
    queryFn: () => chatApi.messages({ conversationId: id, afterSeq: 0 }),
    refetchInterval: 8000,
    enabled: !!id,
  })

  const messages = useMemo(() => q.data ?? [], [q.data])

  // Mark-read: advance the cursor to the newest seq, then clear the inbox badge.
  const newestSeq = messages.length > 0 ? messages[messages.length - 1].seq : 0
  useEffect(() => {
    if (!id || newestSeq <= 0) return
    chatApi
      .read({ conversationId: id, lastSeq: newestSeq })
      .then(() => qc.invalidateQueries({ queryKey: ['homeowner', 'conversations'] }))
      .catch(() => undefined)
  }, [id, newestSeq, qc])

  const scrollToEnd = useCallback(
    () => requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true })),
    [],
  )

  const canSend = !!text.trim() && !sending
  const onSend = async () => {
    const body = text.trim()
    if (!body || !id || sending) return
    setSending(true)
    setText('')
    try {
      await chatApi.send({
        conversation_id: id,
        client_msg_id: newClientMsgId(),
        body,
        media_type: 'text',
      })
      await q.refetch()
      scrollToEnd()
    } catch {
      // Restore the text so she can retry (no optimistic UI — keep it calm).
      setText(body)
    } finally {
      setSending(false)
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
        {/* Warm leading glyph — matches the inbox ChannelRow (house for her
            builder channel, people for a group). Colour + icon, never a bare initial. */}
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

      {q.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : q.error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.lg }}>
          <Small muted style={{ textAlign: 'center' }}>
            {t.err}
          </Small>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingTop: SPACE.lg, paddingBottom: SPACE.lg, flexGrow: 1 }}
          onContentSizeChange={scrollToEnd}
          // Render ALL messages as bubbles — ignore m.events (no CaptureCard here).
          renderItem={({ item: m }) => (
            <DaylightBubble
              body={m.body}
              mine={m.sender_side === 'homeowner'}
              timestamp={timeLabel(m.created_at)}
              attachmentUrl={m.attachment_url}
            />
          )}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <QuietState icon="message-circle" title={t.emptyTitle} message={t.empty} />
            </View>
          }
        />
      )}

      {/* Composer — Daylight input + Calm Pine Send (icon + accessibilityLabel) */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: SPACE.sm,
          paddingHorizontal: SPACE.gutter,
          paddingTop: SPACE.sm,
          paddingBottom: insets.bottom + SPACE.sm,
          borderTopWidth: 1,
          borderTopColor: c.line,
          backgroundColor: c.card,
        }}
      >
        <View
          style={{
            flex: 1,
            minHeight: TAP,
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: theme.radii.card,
            backgroundColor: c.paper,
            paddingHorizontal: SPACE.lg,
          }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t.placeholder}
            placeholderTextColor={c.textMute}
            multiline
            style={{
              maxHeight: 110,
              paddingVertical: SPACE.sm,
              color: c.text,
              fontSize: 16,
            }}
          />
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
              borderRadius: theme.radii.card,
              backgroundColor: c.accent,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !canSend ? 0.5 : 1,
              transform: [{ scale: pressed && canSend ? 0.96 : 1 }],
            },
            canSend ? theme.shadowCard : null,
          ]}
        >
          {sending ? (
            <ActivityIndicator color={c.onAccent} />
          ) : (
            <Feather name="arrow-up" size={22} color={c.onAccent} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}
