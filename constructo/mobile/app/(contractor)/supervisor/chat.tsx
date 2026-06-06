/**
 * Crew chat (`/chat`) — the site's in-app thread (Phase 1). Every message also
 * flows into extraction server-side, so this is "capture with a conversation
 * around it". Blueprint theme: warm paper, amber for own messages + Send,
 * ≥48px tap targets, Hindi-first copy.
 *
 * v1: the supervisor's assigned site(s); messages poll every ~8s; sends are
 * optimistic (a local "sending" bubble) and idempotent on client_msg_id.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '../../../src/auth/AuthContext'
import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { Body, BodyStrong, Mono, Small } from '../../../src/ui'
import { chatApi, newClientMsgId, type ChatEvent, type ChatMessage } from '../../../src/api/chat'
import { supervisorApi } from '../../../src/api/supervisor'
import { isSlash, parseSlash, SLASH_USAGE, type SlashCommand } from '../../../src/capture/slash'
import { suggestCapture } from '../../../src/capture/suggest'
import { CalmEmpty, CaptureCard, ErrorState, Loading } from './_components'

/** A structured capture to ride the `capture_type`/`fields` fast path. */
type Capture = { capture_type: string; fields: Record<string, unknown> }

const STR = {
  en: {
    title: 'Crew chat',
    placeholder: 'Message your site team…',
    send: 'Send',
    noSite: 'No site assigned',
    noSiteBody: "You're not on a site yet — once you're assigned, the crew chat opens here.",
    emptyTitle: 'Say something',
    emptyBody: 'No messages yet. Anything you send here is logged to the site record.',
    err: 'Could not load the chat.',
    retry: 'Try again',
    sending: 'sending…',
    booked: 'booked ✓',
    failed: 'tap to retry',
    cmdHint: 'Command format',
  },
  hi: {
    title: 'टीम चैट',
    placeholder: 'अपनी साइट टीम को मैसेज करें…',
    send: 'भेजो',
    noSite: 'कोई साइट नहीं',
    noSiteBody: 'अभी आप किसी साइट पर नहीं हैं — असाइन होते ही यहाँ टीम चैट खुल जाएगी।',
    emptyTitle: 'कुछ लिखें',
    emptyBody: 'अभी कोई मैसेज नहीं। यहाँ जो भी भेजेंगे वो साइट रिकॉर्ड में दर्ज होगा।',
    err: 'चैट लोड नहीं हो सकी।',
    retry: 'फिर कोशिश करें',
    sending: 'भेज रहे…',
    booked: 'दर्ज ✓',
    failed: 'फिर भेजने के लिए दबाएँ',
    cmdHint: 'कमांड का तरीका',
  },
} as const

type Outgoing = {
  clientMsgId: string
  body: string
  status: 'sending' | 'failed'
  /** A structured-capture send (slash / chip) — shows a "booked ✓" receipt. */
  captured?: boolean
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function CrewChat() {
  const { lang } = useT()
  const str = STR[lang]
  const { theme } = useTheme()
  const c = theme.colors
  const { me } = useAuth()
  const insets = useSafeAreaInsets()
  const listRef = useRef<FlatList>(null)

  const [text, setText] = useState('')
  const [pending, setPending] = useState<Outgoing[]>([])

  // The supervisor's assigned site(s); v1 chats the first one.
  const sitesQ = useQuery({ queryKey: ['supervisor', 'sites'], queryFn: () => supervisorApi.sites() })
  const sites = sitesQ.data?.items ?? []
  const site = sites[0]

  const msgsQ = useQuery({
    queryKey: ['chat', site?.id],
    queryFn: () => chatApi.messages(site!.id),
    enabled: !!site,
    refetchInterval: 8000,
  })

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))
  }, [])

  const doSend = useCallback(
    async (clientMsgId: string, bodyText: string, capture?: Capture) => {
      if (!site) return
      try {
        await chatApi.send({
          site_id: site.id,
          client_msg_id: clientMsgId,
          body: bodyText,
          ...(capture ?? {}),
        })
        // Confirmed — drop the optimistic bubble and pull the server copy.
        setPending((p) => p.filter((m) => m.clientMsgId !== clientMsgId))
        await msgsQ.refetch()
        scrollToEnd()
      } catch {
        setPending((p) =>
          p.map((m) => (m.clientMsgId === clientMsgId ? { ...m, status: 'failed' } : m)),
        )
      }
    },
    [site, msgsQ, scrollToEnd],
  )

  // Optimistically enqueue a send (plain text or a structured capture) and clear
  // the composer. Shared by the Send button, slash-commands, and the chip.
  const dispatch = useCallback(
    (bodyText: string, capture?: Capture) => {
      if (!bodyText || !site) return
      const clientMsgId = newClientMsgId()
      setPending((p) => [...p, { clientMsgId, body: bodyText, status: 'sending', captured: !!capture }])
      setText('')
      scrollToEnd()
      void doSend(clientMsgId, bodyText, capture)
    },
    [site, doSend, scrollToEnd],
  )

  const onSend = useCallback(() => {
    const bodyText = text.trim()
    if (!bodyText || !site) return
    // Slash-commands book a card client-side (offline, no model) via the fast
    // path; a malformed one shows its usage instead of sending noise.
    if (isSlash(bodyText)) {
      const parsed = parseSlash(bodyText)
      if (parsed && 'error' in parsed) {
        Alert.alert(str.cmdHint, SLASH_USAGE[parsed.command as SlashCommand])
        return
      }
      if (parsed) {
        dispatch(bodyText, { capture_type: parsed.capture_type, fields: parsed.fields })
        return
      }
    }
    dispatch(bodyText)
  }, [text, site, dispatch, str])

  // A single live smart-suggest chip (never while typing a slash-command).
  const suggestion = useMemo(
    () => (isSlash(text) ? null : suggestCapture(text, lang)),
    [text, lang],
  )

  type Row =
    | { kind: 'server'; key: string; msg: ChatMessage }
    | { kind: 'pending'; key: string; out: Outgoing }

  const rows: Row[] = useMemo(() => {
    const server: Row[] = (msgsQ.data ?? []).map((m) => ({ kind: 'server', key: m.id, msg: m }))
    const out: Row[] = pending.map((o) => ({ kind: 'pending', key: o.clientMsgId, out: o }))
    return [...server, ...out]
  }, [msgsQ.data, pending])

  // --- guard states -------------------------------------------------------
  if (sitesQ.isLoading) return <Loading />
  if (sitesQ.isError)
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: SPACE.lg, justifyContent: 'center' }}>
        <ErrorState message={str.err} retryLabel={str.retry} onRetry={() => void sitesQ.refetch()} />
      </View>
    )
  if (!site) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: SPACE.lg, justifyContent: 'center' }}>
        <CalmEmpty title={str.noSite} body={str.noSiteBody} />
      </View>
    )
  }

  const ownBubble: ViewStyle = {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(242,161,0,0.16)',
    borderColor: 'rgba(242,161,0,0.45)',
    borderWidth: 1,
  }
  const otherBubble: ViewStyle = {
    alignSelf: 'flex-start',
    backgroundColor: c.card,
    borderColor: c.line,
    borderWidth: 1,
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
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
        }}
      >
        <BodyStrong>{str.title}</BodyStrong>
        <Small style={{ color: c.textMute }}>{site.name}</Small>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={{ padding: SPACE.lg, gap: SPACE.sm, flexGrow: 1 }}
        onContentSizeChange={scrollToEnd}
        ListEmptyComponent={
          msgsQ.isLoading ? null : (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <CalmEmpty title={str.emptyTitle} body={str.emptyBody} />
            </View>
          )
        }
        renderItem={({ item }) => {
          const mine =
            item.kind === 'pending' || (!!me && item.msg.sender_id === me.id)

          // A message that became structured capture renders as Card(s), not a
          // bubble — the thread is "capture with a conversation around it". An
          // `unknown` event isn't a confident capture (a greeting, a sticker),
          // so it stays a bubble rather than cluttering the feed with a Note.
          const cardEvents =
            item.kind === 'server'
              ? item.msg.events.filter((e: ChatEvent) => e.event_type !== 'unknown')
              : []
          if (item.kind === 'server' && cardEvents.length > 0) {
            return (
              <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '92%', gap: SPACE.sm }}>
                {cardEvents.map((ev: ChatEvent) => (
                  <CaptureCard
                    key={ev.id}
                    event={ev}
                    lang={lang}
                    sourceText={item.msg.body}
                    time={fmtTime(item.msg.created_at)}
                  />
                ))}
              </View>
            )
          }

          const body = item.kind === 'pending' ? item.out.body : (item.msg.body ?? '')
          return (
            <View
              style={[
                {
                  maxWidth: '82%',
                  borderRadius: theme.radii.card,
                  paddingVertical: SPACE.sm,
                  paddingHorizontal: SPACE.md,
                  gap: 2,
                },
                mine ? ownBubble : otherBubble,
              ]}
            >
              <Body style={{ color: c.text }}>{body}</Body>
              <Mono style={{ color: c.textMute, fontSize: 11 }}>
                {item.kind === 'pending'
                  ? item.out.status === 'failed'
                    ? str.failed
                    : item.out.captured
                      ? str.booked
                      : str.sending
                  : fmtTime(item.msg.created_at)}
              </Mono>
            </View>
          )
        }}
      />

      {/* Smart-suggest chip — one tap turns the free text into a typed Card.
          Ignore it and the text sends as a plain bubble (90% stays fast). */}
      {suggestion ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={suggestion.label}
          onPress={() => dispatch(text.trim(), { capture_type: suggestion.capture_type, fields: suggestion.fields })}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.sm,
            minHeight: 44,
            marginHorizontal: SPACE.lg,
            marginBottom: SPACE.xs,
            paddingHorizontal: SPACE.md,
            borderRadius: theme.radii.control,
            borderWidth: 1,
            borderColor: 'rgba(242,161,0,0.45)',
            backgroundColor: 'rgba(242,161,0,0.12)',
          }}
        >
          <Feather name="zap" size={15} color={c.accentDeep} />
          <Small style={{ flex: 1, fontWeight: '600', color: c.text }}>{suggestion.label}</Small>
          <Feather name="arrow-up-circle" size={20} color={c.accent} />
        </Pressable>
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
          onPress={onSend}
          disabled={!text.trim()}
          style={{
            minWidth: 64,
            minHeight: 48,
            paddingHorizontal: SPACE.lg,
            borderRadius: theme.radii.control,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: text.trim() ? c.accent : c.line,
          }}
        >
          <BodyStrong style={{ color: text.trim() ? c.onAccent : c.textMute }}>
            {str.send}
          </BodyStrong>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}
