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
import { useRef, useState } from 'react'
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
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../../src/i18n/I18nProvider'
import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../../../src/theme/tokens'
import { BodyStrong, Small } from '../../../../src/ui'
import { CaptureCard, MessageBubble } from '../../../../src/chat/MessageView'
import { useChatThread } from '../../../../src/chat'
import { type ChatEvent, type ChatMessage } from '../../../../src/api/chat'
import { groupsApi } from '../../../../src/api/groups'
import { useAuth } from '../../../../src/auth/AuthContext'
import { LoadingBlock, ErrorBlock } from '../_components'
import { ManageGroupSheet } from '../_group_sheets'

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
    manage: 'Manage',
    homeowner: 'Homeowner',
    sendingHint: 'sending…',
    sendFailed: "couldn't send",
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
    manage: 'प्रबंधन',
    homeowner: 'गृहस्वामी',
    sendingHint: 'भेजा जा रहा…',
    sendFailed: 'नहीं भेजा गया',
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
  const { me } = useAuth()
  const str = STR[lang]
  const listRef = useRef<FlatList>(null)

  const { id, siteId, kind, title, hasHomeowner } = useLocalSearchParams<{
    id: string
    siteId: string
    kind: string
    title: string
    hasHomeowner: string
  }>()
  // A group thread has no site_id — it's addressed by its conversation id.
  const isGroup = kind === 'group' // used by the group Manage UI (PR 6)
  // Homeowner channel (Phase 3): curated thread for the homeowner counterparty.
  const isHomeowner = kind === 'homeowner'
  // Any non-site thread (group OR homeowner, Phase 3) is addressed by conv id.
  const addressByConv = kind !== 'site'

  const [text, setText] = useState('')
  const [manageOpen, setManageOpen] = useState(false)

  // For group threads, learn the roster to gate the "Manage" action on the
  // caller actually being an admin (the sheet's mutations are admin-only).
  const membersQ = useQuery({
    queryKey: ['groups', 'members', id],
    queryFn: () => groupsApi.members(id),
    enabled: isGroup && !!id,
  })
  const isAdmin = (membersQ.data?.members ?? []).some(
    (m) => m.user_id === me?.id && m.role === 'admin',
  )

  // Cache-first thread — the SAME offline-first hook the homeowner thread uses:
  // seeds instantly from the persisted cache (so reopening a thread offline shows
  // cached messages instead of "could not load"), syncs incrementally via
  // after_seq, sends through the durable outbox (survives offline / app-kill),
  // rides the live socket, and advances the read cursor + clears the owner inbox
  // badge. A group/homeowner thread is addressed by conv id; a site thread by site.
  const address = addressByConv
    ? { conversationId: id }
    : { siteId: siteId as string }
  const thread = useChatThread(address, { myUserId: me?.id })
  const messages = thread.messages

  const scrollToEnd = () =>
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))

  const onSend = async () => {
    const body = text.trim()
    if (!body || thread.sending) return
    setText('')
    try {
      // Durable: enqueues to the persisted outbox (reply target handled by the
      // hook), so the message is never lost on a flaky link or an app kill.
      await thread.send(body)
      scrollToEnd()
    } catch {
      setText(body) // restore on a hard (non-transient) failure
    }
  }

  // A group thread is valid with no site_id — it's addressed by `id`. Only
  // dead-end when the thread is wholly unaddressable (neither id nor siteId),
  // showing a calm bilingual line instead of a blank screen.
  if (!siteId && !id) {
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
          {isHomeowner
            ? `${str.homeowner} · ${title || str.site}`
            : (title || str.site)}
        </BodyStrong>
        {isGroup && isAdmin ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={str.manage}
            onPress={() => setManageOpen(true)}
            style={({ pressed }) => ({
              minHeight: TAP,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: SPACE.md,
              borderRadius: theme.radii.control,
              borderWidth: 1,
              borderColor: c.line,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Feather name="settings" size={16} color={c.text} />
            <Small style={{ color: c.text }}>{str.manage}</Small>
          </Pressable>
        ) : null}
      </View>

      {/* Client-present banner (shape + --info tint, never color alone).
          Suppressed for homeowner kind: the homeowner IS the counterparty —
          the banner is redundant and would confuse rather than inform. */}
      {hasHomeowner === '1' && !isHomeowner ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: SPACE.xs,
            paddingHorizontal: SPACE.lg,
            backgroundColor: c.infoTint,
            borderBottomColor: c.line,
            borderBottomWidth: 1,
          }}
        >
          <Small style={{ color: c.info }}>◆</Small>
          <Small style={{ color: c.info, flex: 1 }}>{str.client}</Small>
        </View>
      ) : null}

      {/* Messages. Only show the hard error when there is genuinely nothing to
          render — once the persisted cache (or a prior fetch) has seeded
          messages, an offline refetch failure must NOT replace the thread with
          "could not load". */}
      {thread.isLoading && messages.length === 0 ? (
        <LoadingBlock />
      ) : thread.error && messages.length === 0 ? (
        <View style={{ flex: 1, padding: SPACE.lg, justifyContent: 'center' }}>
          <ErrorBlock message={str.err} retryLabel={str.retry} onRetry={() => thread.refetch()} />
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
          ListFooterComponent={
            thread.pending.length ? (
              <View style={{ gap: SPACE.sm, marginTop: SPACE.sm }}>
                {thread.pending.map((p) => (
                  <MessageBubble
                    key={p.clientMsgId}
                    body={p.body || (p.captured ? '📎' : '')}
                    mine
                    timestamp={p.state === 'failed_permanent' ? str.sendFailed : str.sendingHint}
                  />
                ))}
              </View>
            ) : null
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
                deliveryState={thread.deliveryState(item)}
                onLongPress={() => thread.setReply(item)}
              />
            )
          }}
        />
      )}

      {/* Quote-reply banner */}
      {thread.reply ? (
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
              {msgSnippet(thread.reply)}
            </Small>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={str.cancel}
            onPress={() => thread.setReply(null)}
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
          disabled={!text.trim() || thread.sending}
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

      {isGroup && isAdmin ? (
        <ManageGroupSheet
          visible={manageOpen}
          onClose={() => setManageOpen(false)}
          groupId={id}
          siteId={siteId ?? ''}
        />
      ) : null}
    </KeyboardAvoidingView>
  )
}
