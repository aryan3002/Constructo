/**
 * Owner conversation detail (doc 18 Phase 1) — read + send/reply + mark-read for
 * one site crew thread. Reuses the shared MessageView primitives (CaptureCard for
 * messages that minted a SiteEvent, MessageBubble otherwise) so it renders the
 * thread identically to the supervisor crew chat. Site-keyed chat API, no schema
 * change. Radar / dispute / recap / smart-suggest / voice are deferred (Phase 2).
 *
 * Neev theme: warm paper, amber Send fill with dark ink, ≥48px targets,
 * Hindi-first copy. A header cue + composer; the read cursor advances on the
 * newest seq and invalidates the inbox so its unread badge clears.
 */
import { useCallback, useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../../src/i18n/I18nProvider'
import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../../../src/theme/tokens'
import { BodyStrong, Small } from '../../../../src/ui'
import { CaptureCard, MessageBubble, NivaanProposalCard, SystemNotice } from '../../../../src/chat/MessageView'
import { nivaanProposal, isNivaanAnswer } from '../../../../src/chat/nivaanProposal'
import { MessageFeed, useChatThread, type FeedRow } from '../../../../src/chat'
import { enqueueChatSend } from '../../../../src/chat/outbox'
import { takePhotoSend } from '../../../../src/chat/markupHandoff'
import { systemNotice } from '../../../../src/chat/systemNotice'
import { newClientMsgId, type ChatEvent, type ChatMessage } from '../../../../src/api/chat'
import { groupsApi } from '../../../../src/api/groups'
import { useAuth } from '../../../../src/auth/AuthContext'
import { LoadingBlock, ErrorBlock } from '../_components'
import { ManageGroupSheet } from '../_group_sheets'

const STR = {
  en: {
    placeholder: 'Message your site team…',
    caption: 'Add a caption…',
    photo: 'Send a photo',
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
    tapRetry: 'Tap to retry',
  },
  hi: {
    placeholder: 'अपनी साइट टीम को मैसेज करें…',
    caption: 'कैप्शन जोड़ें…',
    photo: 'फ़ोटो भेजें',
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
    tapRetry: 'फिर भेजने के लिए टैप करें',
  },
} as const

/** A one-line gist of a message — its card's summary, else its text. */
function msgSnippet(m: ChatMessage | undefined | null): string {
  if (!m) return ''
  const ev = m.events?.find((e) => e.event_type !== 'unknown')
  if (ev) return ev.summary || ev.event_type
  return m.body ?? ''
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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

export default function OwnerConversation() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { me } = useAuth()
  const str = STR[lang]

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

  const onSend = async () => {
    const body = text.trim()
    if (!body || thread.sending) return
    setText('')
    try {
      // Durable: enqueues to the persisted outbox (reply target handled by the
      // hook), so the message is never lost on a flaky link or an app kill.
      // No manual scroll — the inverted MessageFeed sticks to the bottom on send.
      await thread.send(body)
    } catch {
      setText(body) // restore on a hard (non-transient) failure
    }
  }

  // Stable handlers/labelers so typing doesn't bust MessageFeed's memoized work.
  const onReply = useCallback((m: ChatMessage) => thread.setReply(m), [thread.setReply])
  const dayLabel = useCallback((iso: string) => dayLabelFor(iso, lang), [lang])

  // Quote-reply: render the parent message's snippet above a reply bubble (parity
  // with the supervisor/homeowner threads).
  const byId = useMemo(() => {
    const m = new Map<string, ChatMessage>()
    for (const x of messages) m.set(x.id, x)
    return m
  }, [messages])
  const replySnippetFor = useCallback(
    (m: ChatMessage) => (m.reply_to_id ? msgSnippet(byId.get(m.reply_to_id)) || null : null),
    [byId],
  )

  // Send a photo: pick → push the preview route (caption + markup) → on return,
  // enqueue with the local uri (the outbox uploads on drain) so the pending bubble
  // shows the photo immediately. Consume-once → no double-send.
  useFocusEffect(
    useCallback(() => {
      const s = takePhotoSend()
      if (!s) return
      void (async () => {
        try {
          await enqueueChatSend({
            clientMsgId: newClientMsgId(),
            address: addressByConv ? { conversation_id: id } : { site_id: siteId as string },
            ...(s.caption ? { body: s.caption } : {}),
            media: { kind: 'image', mime: s.mime, localUri: s.uri },
          })
          await thread.flush()
        } catch {
          /* the durable outbox retries; nothing to surface */
        }
      })()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, siteId, addressByConv]),
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
      params: { uri: asset.uri, mime: asset.mimeType ?? 'image/jpeg', markup: '1', placeholder: str.caption },
    })
  }

  // Build the feed: plain human messages become bubbles (so MessageFeed gives them
  // WhatsApp grouping / day separators / avatars / inverted scroll); system notices,
  // Nivaan proposals/answers, and capture cards stay as custom rows (the contractor
  // site-event ledger is kept inline). Pending outbox bubbles render at the bottom.
  const items: FeedRow[] = useMemo(() => {
    const base: FeedRow[] = messages.map((m): FeedRow => {
      const notice = systemNotice(m)
      if (notice !== null) return { kind: 'custom', key: m.id, node: <SystemNotice text={notice} /> }

      const proposal = nivaanProposal(m)
      if (proposal)
        return {
          kind: 'custom',
          key: m.id,
          node: (
            <View style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.md }}>
              <NivaanProposalCard
                view={proposal}
                onConfirm={() => void thread.sendProposal(proposal.captureType, proposal.fields)}
                onDismiss={() => {}}
              />
            </View>
          ),
        }

      if (isNivaanAnswer(m))
        return {
          kind: 'custom',
          key: m.id,
          node: (
            <View style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.md }}>
              <MessageBubble body={m.body} mine={false} nivaan timestamp={timeLabel(m.created_at)} />
            </View>
          ),
        }

      const cardEvents = m.events?.filter((e: ChatEvent) => e.event_type !== 'unknown') ?? []
      if (cardEvents.length > 0) {
        const mine = m.sender_side === 'contractor'
        return {
          kind: 'custom',
          key: m.id,
          node: (
            <View style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.xs }}>
              <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '92%', gap: SPACE.sm }}>
                {cardEvents.map((ev: ChatEvent, i: number) => (
                  <CaptureCard
                    key={ev.id}
                    event={ev}
                    lang={lang}
                    sourceText={i === 0 ? m.body : undefined}
                    attachmentUrl={i === 0 ? m.attachment_url : undefined}
                    time={i === 0 ? timeLabel(m.created_at) : ''}
                  />
                ))}
              </View>
            </View>
          ),
        }
      }

      // Plain human message → a real bubble (grouping / avatars / day separators).
      return { kind: 'bubble', key: m.id, message: m }
    })

    const pendingRows: FeedRow[] = thread.pending.map((p): FeedRow => ({
      kind: 'custom',
      key: `pending:${p.clientMsgId}`,
      node:
        p.state === 'failed_permanent' ? (
          <Pressable
            onPress={() => void thread.retry(p.clientMsgId)}
            style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.md }}
          >
            <MessageBubble body={p.body} attachmentUrl={p.mediaUri} mine timestamp={str.tapRetry} />
          </Pressable>
        ) : (
          <View style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.md }}>
            <MessageBubble body={p.body} attachmentUrl={p.mediaUri} mine timestamp={str.sendingHint} />
          </View>
        ),
    }))

    return [...base, ...pendingRows]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, thread.pending, lang, str])

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
          onPress={() => router.replace('/(contractor)/owner/chat')}
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
        <View style={{ flex: 1 }}>
          <MessageFeed
            items={items}
            mineSide="contractor"
            myUserId={me?.id}
            time={timeLabel}
            dayLabel={dayLabel}
            onLongPressMessage={onReply}
            deliveryStateFor={thread.deliveryState}
            replySnippetFor={replySnippetFor}
            emptyState={
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Small muted>{str.empty}</Small>
              </View>
            }
          />
        </View>
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={str.photo}
          onPress={() => void onCamera()}
          style={{
            width: 48,
            height: 48,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radii.control,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.bg,
          }}
        >
          <Feather name="camera" size={20} color={c.accent} />
        </Pressable>
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
