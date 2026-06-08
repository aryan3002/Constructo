/**
 * Homeowner message thread (doc 18 Phase 3 · Home Room) — read + send + mark-read
 * for one channel. Daylight theme: warm paper, Calm Pine for her own bubbles, soft
 * white cards for the builder's, a Calm Pine Send button, ≥48px targets.
 *
 * THE HOME ROOM: for her private builder channel (kind=homeowner) the thread weaves
 * the published Updates and pending Decisions for that site IN with her chat bubbles
 * as on-brand cards she can act on in place (approve / comment / request-change),
 * plus Ask + Request-a-visit quick-actions. A group thread (no single site) stays
 * plain bubbles. Chat `m.events` are still ignored — the curated cards come from the
 * homeowner reads, not the talk-only channel's (empty) extraction.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import { chatApi, newClientMsgId } from '../../../src/api/chat'
import { homeowner } from '../../../src/api/client'
import { DaylightBubble, HomeRoomDecisionCard, HomeRoomUpdateCard } from '../_messages_components'
import {
  HOME_ROOM_STR,
  mergeHomeRoom,
  type DecisionAction,
  type HomeRoomItem,
} from '../_home_room.util'

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
  const listRef = useRef<FlatList<HomeRoomItem>>(null)

  const { id, kind, title, siteName, siteId } = useLocalSearchParams<{
    id: string
    kind: string
    title: string
    siteName: string
    siteId: string
  }>()

  const headerTitle = kind === 'homeowner' ? t.builder : title || t.builder

  // The curated weave (updates + decisions as inline cards) is ONLY her private
  // builder channel — a group thread has no single site to source them from, so
  // it stays plain bubbles.
  const isBuilder = kind === 'homeowner'
  const homeRoom = isBuilder && !!siteId
  const hr = HOME_ROOM_STR[lang as 'en' | 'hi'] ?? HOME_ROOM_STR.en

  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const q = useQuery({
    queryKey: ['homeowner', 'thread', id],
    queryFn: () => chatApi.messages({ conversationId: id, afterSeq: 0 }),
    refetchInterval: 8000,
    enabled: !!id,
  })

  // Curated reads woven into her thread — each degrades on its own (a failed
  // updates/decisions fetch never blanks the conversation; bubbles still render).
  const updatesQ = useQuery({
    queryKey: ['homeowner', 'updates', siteId],
    queryFn: () => homeowner.updates(siteId),
    enabled: homeRoom,
  })
  const decisionsQ = useQuery({
    queryKey: ['homeowner', 'decisions', siteId],
    queryFn: () => homeowner.decisions(siteId),
    enabled: homeRoom,
  })
  const capsQ = useQuery({
    queryKey: ['homeowner', 'capabilities', siteId],
    queryFn: () => homeowner.capabilities(siteId),
    enabled: homeRoom,
  })
  const canApprove = capsQ.data?.can_approve ?? false

  const messages = useMemo(() => q.data ?? [], [q.data])

  // One chronological feed: bubbles + (builder channel only) curated update &
  // decision cards. For a group thread updates/decisions are empty → bubbles only.
  const feed: HomeRoomItem[] = useMemo(
    () =>
      mergeHomeRoom(
        messages,
        homeRoom ? updatesQ.data?.items ?? [] : [],
        homeRoom ? decisionsQ.data ?? [] : [],
      ),
    [messages, homeRoom, updatesQ.data, decisionsQ.data],
  )

  // Her in-thread action on a pending decision (gated server-side; approve is
  // owners-only). On success, refresh the woven decisions + the Home needs-you list.
  const onRespondDecision = useCallback(
    async (decisionId: string, action: DecisionAction, note?: string) => {
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
    },
    [decisionsQ, qc, hr],
  )

  // "Request a visit" — the one genuinely-missing micro-action from the brief.
  // A durable, tracked request (not chat chatter) via the requests channel.
  const [requestingVisit, setRequestingVisit] = useState(false)
  const onRequestVisit = useCallback(async () => {
    if (requestingVisit) return
    setRequestingVisit(true)
    try {
      await homeowner.createRequest({
        title: hr.requestVisitTitle,
        detail: hr.requestVisitDetail,
        site_id: siteId,
      })
      Alert.alert('', hr.visitRequested)
    } catch {
      Alert.alert('', hr.visitErr)
    } finally {
      setRequestingVisit(false)
    }
  }, [requestingVisit, hr, siteId])

  // A soft warm-paper quick-action chip (≥44px tap via padding + Small line-height).
  const chipStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACE.xs,
    minHeight: 44,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.paper,
  }

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
          data={feed}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ paddingTop: SPACE.lg, paddingBottom: SPACE.lg, flexGrow: 1 }}
          onContentSizeChange={scrollToEnd}
          // A bubble, a curated update card, or an actionable decision card —
          // her builder thread is the product (groups stay plain bubbles).
          renderItem={({ item }) => {
            if (item.kind === 'update') return <HomeRoomUpdateCard update={item.update} />
            if (item.kind === 'decision')
              return (
                <HomeRoomDecisionCard
                  decision={item.decision}
                  canApprove={canApprove}
                  str={hr}
                  onRespond={(action, note) => onRespondDecision(item.decision.id, action, note)}
                />
              )
            return (
              <DaylightBubble
                body={item.message.body}
                mine={item.message.sender_side === 'homeowner'}
                timestamp={timeLabel(item.message.created_at)}
                attachmentUrl={item.message.attachment_url}
              />
            )
          }}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <QuietState icon="message-circle" title={t.emptyTitle} message={t.empty} />
            </View>
          }
        />
      )}

      {/* Her quick-actions (builder channel only): Ask the home · Request a visit.
          Photo/voice are intentionally absent — chat media is blocked for her role
          server-side and voice needs the unconfirmed STT key (honest, not faked). */}
      {homeRoom ? (
        <View
          style={{
            flexDirection: 'row',
            gap: SPACE.sm,
            paddingHorizontal: SPACE.gutter,
            paddingTop: SPACE.sm,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hr.ask}
            onPress={() => router.push('/ask')}
            style={({ pressed }) => [chipStyle, { opacity: pressed ? 0.9 : 1 }]}
          >
            <Feather name="help-circle" size={15} color={c.accentDeep} />
            <Small style={{ color: c.accentDeep, fontWeight: '600' }}>{hr.ask}</Small>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hr.requestVisit}
            disabled={requestingVisit}
            onPress={() => void onRequestVisit()}
            style={({ pressed }) => [chipStyle, { opacity: pressed || requestingVisit ? 0.9 : 1 }]}
          >
            {requestingVisit ? (
              <ActivityIndicator size="small" color={c.accentDeep} />
            ) : (
              <Feather name="calendar" size={15} color={c.accentDeep} />
            )}
            <Small style={{ color: c.accentDeep, fontWeight: '600' }}>{hr.requestVisit}</Small>
          </Pressable>
        </View>
      ) : null}

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
