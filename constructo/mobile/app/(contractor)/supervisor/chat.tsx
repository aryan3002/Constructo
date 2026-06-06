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
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '../../../src/auth/AuthContext'
import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { Body, BodyStrong, Mono, Small } from '../../../src/ui'
import { chatApi, newClientMsgId, type ChatMessage } from '../../../src/api/chat'
import { supervisorApi } from '../../../src/api/supervisor'
import { CalmEmpty, ErrorState, Loading } from './_components'

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
    failed: 'tap to retry',
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
    failed: 'फिर भेजने के लिए दबाएँ',
  },
} as const

type Outgoing = {
  clientMsgId: string
  body: string
  status: 'sending' | 'failed'
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
    async (clientMsgId: string, bodyText: string) => {
      if (!site) return
      try {
        await chatApi.send({ site_id: site.id, client_msg_id: clientMsgId, body: bodyText })
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

  const onSend = useCallback(() => {
    const bodyText = text.trim()
    if (!bodyText || !site) return
    const clientMsgId = newClientMsgId()
    setPending((p) => [...p, { clientMsgId, body: bodyText, status: 'sending' }])
    setText('')
    scrollToEnd()
    void doSend(clientMsgId, bodyText)
  }, [text, site, doSend, scrollToEnd])

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
                    : str.sending
                  : fmtTime(item.msg.created_at)}
              </Mono>
            </View>
          )
        }}
      />

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
