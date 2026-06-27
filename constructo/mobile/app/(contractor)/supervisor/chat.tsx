/**
 * Crew chat (`/chat`) — the site's in-app thread. Every message also flows into
 * extraction server-side, so this is "capture with a conversation around it".
 * Neev theme: warm paper, amber for own messages + Send, ≥48px tap targets,
 * Hindi-first copy.
 *
 * Migrated onto the shared `src/chat` kit (useChatThread + MessageView): the
 * offline-first durable outbox (queued→sending→sent, survives app-kill), live
 * socket, incremental after_seq sync, delivery ticks (✓/✓✓/read), tap-to-retry,
 * system notices, and server-driven Nivaan rows/proposals — all the spine the
 * owner thread already runs on. The supervisor-only surfaces (the @ask grounded
 * one-liner, slash + smart-suggest capture, camera/voice, the long-press card
 * menu with dispute/to-do/vendor-confirm, the pinned brief, recap + radar) are
 * layered on top of the hook.
 */
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '../../../src/auth/AuthContext'
import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { FACES } from '../../../src/theme/fonts'
import { SPACE } from '../../../src/theme/tokens'
import { Body, BodyStrong, Mono, Small } from '../../../src/ui'
import {
  chatApi,
  type AskResult,
  type ChatEvent,
  type ChatMessage,
} from '../../../src/api/chat'
import { supervisorApi } from '../../../src/api/supervisor'
import { actionItemsApi } from '../../../src/api/actionItems'
import { vendorConfirmApi } from '../../../src/api/vendorConfirm'
import { WEB_BASE } from '../../../src/api/config'
import { HoldToTalk, type RecordedAudio } from '../../../src/audio'
import { isSlash, parseSlash, SLASH_USAGE, type SlashCommand } from '../../../src/capture/slash'
import { suggestCapture } from '../../../src/capture/suggest'
import { MessageFeed, useChatThread, type FeedRow } from '../../../src/chat'
import { takePhotoSend } from '../../../src/chat/markupHandoff'
import {
  CaptureCard,
  MessageBubble,
  NivaanProposalCard,
  SystemNotice,
} from '../../../src/chat/MessageView'
import { nivaanProposal, isNivaanAnswer } from '../../../src/chat/nivaanProposal'
import { systemNotice } from '../../../src/chat/systemNotice'
import { CalmEmpty, ErrorState, Loading } from './_components'
import { DisputeSheet } from './_dispute'

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
    replyingTo: 'Replying to',
    reply: 'Reply',
    dispute: 'Dispute',
    resolve: 'Resolve dispute',
    catchUp: 'Catch me up',
    recapTitle: 'Last 24 hours',
    recapNothing: 'Nothing logged in this window.',
    recapDisputes: 'open disputes',
    radar: 'Radar',
    radarTitle: 'What’s slipping',
    radarClear: 'All clear — nothing’s slipping.',
    todos: 'To-dos',
    makeTodo: 'Make a to-do',
    vendorConfirm: 'Ask vendor to confirm',
    vendorConfirmMsg: 'Please confirm this delivery:',
    cancel: 'Cancel',
    scanBill: 'Scan a bill',
    photo: '📷 Photo',
    uploadFailed: 'Upload failed — tap to retry',
    caption: 'Add a caption…',
    nivaan: 'Nivaan',
    askFailed: "Couldn't reach Nivaan — try again.",
    evidence: 'events',
    holdToTalk: 'Hold to talk',
    recording: 'Recording… release to send',
    tooShort: 'Too short — hold a bit longer',
    micPerm: 'Microphone access is needed to record',
    voiceHint: 'e.g. "barah mistri, pachaas bori cement"',
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
    replyingTo: 'जवाब:',
    reply: 'जवाब दें',
    dispute: 'आपत्ति',
    resolve: 'विवाद सुलझाएँ',
    catchUp: 'सार दिखाओ',
    recapTitle: 'पिछले 24 घंटे',
    recapNothing: 'इस अवधि में कुछ दर्ज नहीं।',
    recapDisputes: 'खुले विवाद',
    radar: 'रडार',
    radarTitle: 'क्या अटक रहा है',
    radarClear: 'सब ठीक — कुछ नहीं अटक रहा।',
    todos: 'काम',
    makeTodo: 'काम बनाएँ',
    vendorConfirm: 'वेंडर से पुष्टि कराएँ',
    vendorConfirmMsg: 'कृपया इस डिलीवरी की पुष्टि करें:',
    cancel: 'रद्द करें',
    scanBill: 'बिल स्कैन करें',
    photo: '📷 फ़ोटो',
    uploadFailed: 'अपलोड फेल — फिर दबाएँ',
    caption: 'कैप्शन जोड़ें…',
    nivaan: 'निवान',
    askFailed: 'निवान से जवाब नहीं मिला — फिर कोशिश करें।',
    evidence: 'इवेंट',
    holdToTalk: 'दबाकर बोलो',
    recording: 'रिकॉर्ड हो रहा… छोड़ें भेजने के लिए',
    tooShort: 'बहुत छोटा — थोड़ा और देर दबाएँ',
    micPerm: 'रिकॉर्ड के लिए माइक की अनुमति चाहिए',
    voiceHint: 'जैसे "बारह मिस्त्री, पचास बोरी सीमेंट"',
  },
} as const

/** A local @ask answer (grounded, not a persisted message). */
type LocalAnswer = { id: string; question: string; result: AskResult }

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
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

/** A one-line gist of a message — its card's summary, else its text. */
function msgSnippet(m: ChatMessage | undefined): string {
  if (!m) return ''
  const ev = m.events?.find((e) => e.event_type !== 'unknown')
  if (ev) return ev.summary || ev.event_type
  return m.body ?? ''
}

export default function CrewChat() {
  const { lang } = useT()
  const str = STR[lang]
  const { theme } = useTheme()
  const c = theme.colors
  const { me, role } = useAuth()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const canResolve = role === 'owner' || role === 'pm'

  const [text, setText] = useState('')
  // Local @ask answers from Nivaan — grounded, rendered in the footer.
  const [answers, setAnswers] = useState<LocalAnswer[]>([])
  // Long-press action menu over a card (Reply / Dispute / Resolve).
  const [cardMenu, setCardMenu] = useState<{ msg: ChatMessage; event: ChatEvent } | null>(null)
  const [disputeSheet, setDisputeSheet] = useState<{
    mode: 'raise' | 'resolve'
    event: ChatEvent
    summary: string
  } | null>(null)
  const [recapOpen, setRecapOpen] = useState(false)
  const [radarOpen, setRadarOpen] = useState(false)

  // The supervisor's assigned site(s). They're often on more than one, so the
  // crew chat lets them switch which site's thread they're in (chip row below
  // the header); we default to the first until they pick another.
  const sitesQ = useQuery({ queryKey: ['supervisor', 'sites'], queryFn: () => supervisorApi.sites() })
  const sites = sitesQ.data?.items ?? []
  const [activeSiteId, setActiveSiteId] = useState<string | undefined>(undefined)
  const site = sites.find((s) => s.id === activeSiteId) ?? sites[0]

  // The offline-first thread spine (durable outbox, live socket, ticks). Called
  // unconditionally (hooks rules); disabled until a site resolves (empty addr).
  const thread = useChatThread({ siteId: site?.id ?? '' }, { myUserId: me?.id })

  // The pinned owner brief — exceptions-first; hidden when all clear.
  const briefQ = useQuery({
    queryKey: ['chat', 'brief', site?.id],
    queryFn: () => chatApi.brief(site!.id),
    enabled: !!site,
    refetchInterval: 30000,
  })
  const recapQ = useQuery({
    queryKey: ['chat', 'recap', site?.id],
    queryFn: () => chatApi.recap(site!.id, 1),
    enabled: !!site && recapOpen,
  })
  const radarQ = useQuery({
    queryKey: ['chat', 'sentinel', site?.id],
    queryFn: () => chatApi.sentinel(site!.id),
    enabled: !!site && radarOpen,
  })

  // Lookup for rendering a quoted parent above a reply.
  const byId = useMemo(() => {
    const m = new Map<string, ChatMessage>()
    for (const x of thread.messages) m.set(x.id, x)
    return m
  }, [thread.messages])

  // The inverted MessageFeed auto-sticks to the bottom on new content / own send,
  // so no imperative scroll is needed. Kept as a no-op so the existing call sites
  // (onAsk / onSend / onVoice) stay valid without churn.
  const scrollToEnd = useCallback(() => {}, [])

  // Stable handlers/labelers so typing doesn't bust MessageFeed's memoized work.
  const onReply = useCallback((m: ChatMessage) => thread.setReply(m), [thread.setReply])
  const dayLabel = useCallback((iso: string) => dayLabelFor(iso, lang), [lang])
  const replySnippetFor = useCallback(
    (m: ChatMessage) => (m.reply_to_id ? msgSnippet(byId.get(m.reply_to_id)) || null : null),
    [byId],
  )

  // Build the feed: plain human messages become bubbles (WhatsApp grouping / day
  // separators / avatars / inverted scroll); capture cards (with their long-press
  // action menu), Nivaan proposals/answers, system notices, @ask answers, and
  // pending bubbles stay as custom rows — the contractor site ledger is kept inline.
  const items: FeedRow[] = useMemo(() => {
    const base: FeedRow[] = thread.messages.map((m): FeedRow => {
      const notice = systemNotice(m)
      if (notice !== null) return { kind: 'custom', key: m.id, node: <SystemNotice text={notice} /> }

      const proposal = nivaanProposal(m)
      if (proposal)
        return {
          kind: 'custom',
          key: m.id,
          node: (
            <View style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.xs }}>
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
              <MessageBubble body={m.body} mine={false} nivaan timestamp={fmtTime(m.created_at)} />
            </View>
          ),
        }

      const cardEvents = m.events?.filter((e: ChatEvent) => e.event_type !== 'unknown') ?? []
      if (cardEvents.length > 0) {
        const mine = !!me && m.sender_id === me.id
        const parentSnippet = m.reply_to_id ? msgSnippet(byId.get(m.reply_to_id)) : ''
        return {
          kind: 'custom',
          key: m.id,
          node: (
            <View style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.xs, gap: 2 }}>
              {parentSnippet ? (
                <View
                  style={{
                    alignSelf: mine ? 'flex-end' : 'flex-start',
                    maxWidth: '92%',
                    borderLeftWidth: 2,
                    borderLeftColor: c.accent,
                    paddingLeft: SPACE.sm,
                  }}
                >
                  <Small numberOfLines={1} style={{ color: c.textMute }}>↩ {parentSnippet}</Small>
                </View>
              ) : null}
              <Pressable
                onLongPress={() => setCardMenu({ msg: m, event: cardEvents[0] })}
                delayLongPress={250}
                style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '92%', gap: SPACE.sm }}
              >
                {cardEvents.map((ev: ChatEvent, i: number) => (
                  <CaptureCard
                    key={ev.id}
                    event={ev}
                    lang={lang}
                    sourceText={i === 0 ? m.body : undefined}
                    attachmentUrl={i === 0 ? m.attachment_url : undefined}
                    time={i === 0 ? fmtTime(m.created_at) : ''}
                  />
                ))}
              </Pressable>
            </View>
          ),
        }
      }

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
            <MessageBubble body={p.body || (p.mediaUri ? '' : str.photo)} attachmentUrl={p.mediaUri} mine timestamp={str.failed} />
          </Pressable>
        ) : (
          <View style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.md }}>
            <MessageBubble body={p.body || (p.mediaUri ? '' : str.photo)} attachmentUrl={p.mediaUri} mine timestamp={p.captured ? str.booked : str.sending} />
          </View>
        ),
    }))

    const answerRows: FeedRow[] = answers.map((a): FeedRow => ({
      kind: 'custom',
      key: a.id,
      node: (
        <View style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.sm }}>
          <View
            style={{
              alignSelf: 'flex-start',
              maxWidth: '92%',
              backgroundColor: c.card,
              borderRadius: theme.radii.card,
              borderWidth: 1,
              borderColor: c.line,
              borderLeftWidth: 3,
              borderLeftColor: c.info,
              padding: SPACE.md,
              gap: 4,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="zap" size={13} color={c.info} />
              <Small style={{ color: c.info, fontWeight: '600' }}>{str.nivaan}</Small>
            </View>
            <Small muted numberOfLines={1}>{a.question}</Small>
            <BodyStrong style={{ color: c.text }}>{a.result.answer}</BodyStrong>
            {a.result.evidence_event_ids.length > 0 ? (
              <Mono muted style={{ fontSize: 11 }}>
                {a.result.evidence_event_ids.length} {str.evidence}
              </Mono>
            ) : null}
          </View>
        </View>
      ),
    }))

    // Pending then @ask answers at the very bottom (matches the old footer order).
    return [...base, ...pendingRows, ...answerRows]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.messages, thread.pending, answers, byId, me, lang, str, c, theme])

  // @ask Nivaan: a grounded one-line answer, scoped, computed server-side. Kept
  // local (the deterministic @ask path); @nivaan goes through the live thread so
  // the server agent replies with a real Nivaan row/proposal (rendered by the kit).
  const onAsk = useCallback(
    async (question: string) => {
      if (!site || !question) return
      const id = `ask-${question}-${answers.length}`
      scrollToEnd()
      try {
        const result = await chatApi.ask(site.id, question)
        setAnswers((a) => [...a, { id, question, result }])
      } catch {
        setAnswers((a) => [
          ...a,
          {
            id,
            question,
            result: {
              answerable: false, answer: str.askFailed, total: null, unit: null,
              breakdown: {}, evidence_event_ids: [], contributors: 0, unconfirmed: 0,
            },
          },
        ])
      }
      scrollToEnd()
    },
    [site, scrollToEnd, str, answers.length],
  )

  const onSend = useCallback(() => {
    const bodyText = text.trim()
    if (!bodyText || !site) return
    setText('')
    // @nivaan → the live thread: the server summons the agent and posts a real
    // Nivaan row/proposal, which the kit renders (no local one-liner).
    if (/^@\s*nivaan\b/i.test(bodyText)) {
      void thread.send(bodyText)
      scrollToEnd()
      return
    }
    // @ / @ask → the deterministic grounded one-liner (local answer row).
    if (bodyText.startsWith('@')) {
      void onAsk(bodyText.replace(/^@\s*(ask)?\s*/i, '').trim())
      return
    }
    // Slash-commands book a card client-side via the fast path; a malformed one
    // shows its usage instead of sending noise.
    if (isSlash(bodyText)) {
      const parsed = parseSlash(bodyText)
      if (parsed && 'error' in parsed) {
        Alert.alert(str.cmdHint, SLASH_USAGE[parsed.command as SlashCommand])
        return
      }
      if (parsed) {
        void thread.sendProposal(parsed.capture_type, parsed.fields)
        scrollToEnd()
        return
      }
    }
    void thread.send(bodyText)
    scrollToEnd()
  }, [text, site, thread, str, onAsk, scrollToEnd])

  // A single live smart-suggest chip (never while typing a slash-command).
  const suggestion = useMemo(
    () => (isSlash(text) ? null : suggestCapture(text, lang)),
    [text, lang],
  )

  // Camera-as-Sensor: snap a challan → PREVIEW route (confirm + optional caption)
  // → on return, upload + send as a document; the worker OCRs it into a card.
  // Markup is off (bill scanner, not photo-sharing). Consume-once → no double-send.
  useFocusEffect(
    useCallback(() => {
      const s = takePhotoSend()
      if (!s || !site) return
      void (async () => {
        try {
          const uploaded = await chatApi.uploadMedia(
            { siteId: site.id },
            { uri: s.uri, name: 'challan.jpg', type: s.mime },
            'document',
          )
          await thread.sendMedia({
            attachmentKey: uploaded.key,
            mime: s.mime,
            sha256: uploaded.sha256,
            mediaType: 'document',
            ...(s.caption ? { body: s.caption } : {}),
          })
          scrollToEnd()
        } catch {
          Alert.alert(str.scanBill, str.uploadFailed)
        }
      })()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [site]),
  )

  const onCamera = useCallback(async () => {
    if (!site) return
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
        markup: '0',
        placeholder: str.caption,
      },
    })
  }, [site, router, str])

  // Voice-to-Card: hold-to-talk → upload the .m4a as voice media → send; the
  // worker runs STT + numeral-repair into a card.
  const onVoice = useCallback(
    async (audio: RecordedAudio) => {
      if (!site) return
      try {
        const uploaded = await chatApi.uploadMedia(
          { siteId: site.id },
          { uri: audio.uri, name: audio.name, type: audio.mime },
          'voice',
        )
        await thread.sendMedia({
          attachmentKey: uploaded.key, mime: audio.mime, sha256: uploaded.sha256, mediaType: 'voice',
        })
        scrollToEnd()
      } catch {
        Alert.alert(str.title, str.askFailed)
      }
    },
    [site, thread, str, scrollToEnd],
  )

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
        <View style={{ flex: 1 }}>
          <BodyStrong>{str.title}</BodyStrong>
          <Small style={{ color: c.textMute }}>{site.name}</Small>
        </View>
        {(
          [
            { key: 'radar', icon: 'radio' as const, label: str.radar, onPress: () => setRadarOpen(true) },
            {
              key: 'todos',
              icon: 'check-square' as const,
              label: str.todos,
              onPress: () =>
                router.push({
                  pathname: '/(contractor)/supervisor/action-items',
                  params: { site_id: site.id },
                }),
            },
            { key: 'recap', icon: 'sunrise' as const, label: str.catchUp, onPress: () => setRecapOpen(true) },
          ] as const
        ).map((tool) => (
          <Pressable
            key={tool.key}
            accessibilityRole="button"
            accessibilityLabel={tool.label}
            onPress={tool.onPress}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 9999,
              borderWidth: 1,
              borderColor: c.line,
              backgroundColor: pressed ? c.paper : c.card,
            })}
          >
            <Feather name={tool.icon} size={18} color={c.accentDeep} />
          </Pressable>
        ))}
      </View>

      {/* Site switcher — the engineer is often on more than one site, so let
          them flip which site's crew chat they're reading. Hidden when there's
          only one site (nothing to switch). */}
      {sites.length > 1 ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: SPACE.xs,
            paddingHorizontal: SPACE.lg,
            paddingTop: SPACE.sm,
            backgroundColor: c.card,
            borderBottomColor: c.line,
            borderBottomWidth: 1,
            paddingBottom: SPACE.sm,
          }}
        >
          {sites.map((s) => {
            const active = s.id === site.id
            return (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={s.name}
                onPress={() => setActiveSiteId(s.id)}
                style={{
                  paddingHorizontal: SPACE.md,
                  paddingVertical: 6,
                  borderRadius: 9999,
                  borderWidth: 1,
                  borderColor: active ? c.accentDeep : c.line,
                  backgroundColor: active ? c.accentDeep : c.card,
                }}
              >
                <Small style={{ color: active ? c.card : c.text }}>{s.name}</Small>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {/* Pinned brief — exceptions-first; shown only when something needs
          attention (empty = calm = good). */}
      {briefQ.data && briefQ.data.risk_count > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${briefQ.data.headline} — ${str.radar}`}
          onPress={() => setRadarOpen(true)}
          style={({ pressed }) => ({
            marginHorizontal: SPACE.lg,
            marginTop: SPACE.sm,
            padding: SPACE.md,
            borderRadius: theme.radii.card,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: pressed ? c.paper : c.card,
            gap: SPACE.xs,
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="sunrise" size={14} color={c.accentDeep} />
            <BodyStrong style={{ flex: 1 }}>{briefQ.data.headline}</BodyStrong>
            <Feather name="chevron-right" size={18} color={c.textMute} />
          </View>
          {briefQ.data.risks.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor:
                    r.severity === 'high' ? c.risk : r.severity === 'medium' ? c.warn : c.info,
                }}
              />
              <Small style={{ flex: 1, color: c.text }} numberOfLines={2}>
                {r.message}
              </Small>
            </View>
          ))}
        </Pressable>
      ) : null}

      {/* Messages — WhatsApp-style bubbles (grouping/day separators/avatars/
          inverted scroll) with the contractor's capture cards kept inline. */}
      <View style={{ flex: 1 }}>
        <MessageFeed
          items={items}
          mineSide="contractor"
          myUserId={me?.id}
          time={fmtTime}
          dayLabel={dayLabel}
          onLongPressMessage={onReply}
          deliveryStateFor={thread.deliveryState}
          replySnippetFor={replySnippetFor}
          emptyState={
            thread.isLoading ? null : (
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <CalmEmpty title={str.emptyTitle} body={str.emptyBody} />
              </View>
            )
          }
        />
      </View>

      {/* Long-press card menu — Reply / To-do / Vendor confirm / Dispute / Resolve. */}
      <Modal
        visible={!!cardMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setCardMenu(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(21,23,28,0.45)', justifyContent: 'flex-end' }}
          onPress={() => setCardMenu(null)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: theme.radii.sheet,
              borderTopRightRadius: theme.radii.sheet,
              padding: SPACE.sm,
              paddingBottom: insets.bottom + SPACE.md,
            }}
          >
            {[
              { key: 'reply', icon: 'corner-up-left' as const, label: str.reply, show: true },
              { key: 'todo', icon: 'check-square' as const, label: str.makeTodo, show: true },
              {
                key: 'vendorConfirm',
                icon: 'send' as const,
                label: str.vendorConfirm,
                show:
                  cardMenu?.event.event_type === 'material_delivery' ||
                  cardMenu?.event.event_type === 'invoice_received',
              },
              { key: 'dispute', icon: 'flag' as const, label: str.dispute, show: true },
              {
                key: 'resolve',
                icon: 'check-circle' as const,
                label: str.resolve,
                show: canResolve && !!cardMenu?.event.contested,
              },
            ]
              .filter((o) => o.show)
              .map((o) => (
                <Pressable
                  key={o.key}
                  accessibilityRole="button"
                  accessibilityLabel={o.label}
                  onPress={() => {
                    const cm = cardMenu
                    setCardMenu(null)
                    if (!cm) return
                    if (o.key === 'reply') {
                      thread.setReply(cm.msg)
                    } else if (o.key === 'todo') {
                      const title = cm.event.summary || msgSnippet(cm.msg)
                      if (site && title) {
                        actionItemsApi
                          .create({ site_id: site.id, title, source_message_id: cm.msg.id })
                          .then(() =>
                            router.push({
                              pathname: '/(contractor)/supervisor/action-items',
                              params: { site_id: site.id },
                            }),
                          )
                          .catch(() => Alert.alert(str.makeTodo, str.askFailed))
                      }
                    } else if (o.key === 'vendorConfirm') {
                      const f = cm.event.fields as {
                        vendor?: string
                        material?: string
                        quantity?: number
                        unit?: string
                      }
                      if (site && f.vendor) {
                        vendorConfirmApi
                          .create({
                            site_id: site.id,
                            vendor_name: String(f.vendor),
                            event_id: cm.event.id,
                            material: f.material ? String(f.material) : undefined,
                            claimed_qty: typeof f.quantity === 'number' ? f.quantity : undefined,
                            claimed_unit: f.unit ? String(f.unit) : undefined,
                          })
                          .then((conf) =>
                            Share.share({
                              message: `${str.vendorConfirmMsg} ${WEB_BASE}${conf.confirm_path}`,
                            }),
                          )
                          .catch(() => Alert.alert(str.vendorConfirm, str.askFailed))
                      } else {
                        Alert.alert(str.vendorConfirm, str.askFailed)
                      }
                    } else {
                      setDisputeSheet({
                        mode: o.key === 'resolve' ? 'resolve' : 'raise',
                        event: cm.event,
                        summary: cm.event.summary || msgSnippet(cm.msg),
                      })
                    }
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: SPACE.md,
                    minHeight: 52,
                    paddingHorizontal: SPACE.md,
                    borderRadius: theme.radii.control,
                    backgroundColor: pressed ? c.paper : 'transparent',
                  })}
                >
                  <Feather name={o.icon} size={20} color={c.text} />
                  <BodyStrong>{o.label}</BodyStrong>
                </Pressable>
              ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Catch-me-up recap sheet — deterministic totals, never a guess. */}
      <Modal visible={recapOpen} transparent animationType="slide" onRequestClose={() => setRecapOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(21,23,28,0.45)', justifyContent: 'flex-end' }}
          onPress={() => setRecapOpen(false)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: theme.radii.sheet,
              borderTopRightRadius: theme.radii.sheet,
              padding: SPACE.lg,
              paddingBottom: insets.bottom + SPACE.lg,
              gap: SPACE.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <Feather name="sunrise" size={18} color={c.accentDeep} />
              <BodyStrong style={{ flex: 1 }}>{str.recapTitle}</BodyStrong>
              <Pressable accessibilityRole="button" accessibilityLabel={str.cancel} hitSlop={10} onPress={() => setRecapOpen(false)}>
                <Feather name="x" size={22} color={c.textMute} />
              </Pressable>
            </View>

            {recapQ.isLoading ? (
              <View style={{ paddingVertical: SPACE.lg, alignItems: 'center' }}>
                <ActivityIndicator color={c.accent} />
              </View>
            ) : recapQ.data ? (
              <View style={{ gap: SPACE.sm }}>
                <Body style={{ color: c.text }}>{recapQ.data.summary || str.recapNothing}</Body>
                {Object.entries(recapQ.data.event_counts).map(([type, n]) => (
                  <View key={type} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Small style={{ color: c.textMute, textTransform: 'capitalize' }}>
                      {type.replace(/_/g, ' ')}
                    </Small>
                    <Mono style={{ color: c.text }}>{n}</Mono>
                  </View>
                ))}
                {recapQ.data.open_disputes > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <Feather name="flag" size={14} color={c.risk} />
                    <Small style={{ color: c.risk, fontWeight: '600' }}>
                      {recapQ.data.open_disputes} {str.recapDisputes}
                    </Small>
                  </View>
                ) : null}
              </View>
            ) : (
              <Small muted>{str.recapNothing}</Small>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Standing-Sentinel radar — what's slipping, deterministic. */}
      <Modal visible={radarOpen} transparent animationType="slide" onRequestClose={() => setRadarOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(21,23,28,0.45)', justifyContent: 'flex-end' }}
          onPress={() => setRadarOpen(false)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: theme.radii.sheet,
              borderTopRightRadius: theme.radii.sheet,
              padding: SPACE.lg,
              paddingBottom: insets.bottom + SPACE.lg,
              gap: SPACE.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <Feather name="radio" size={18} color={c.accentDeep} />
              <BodyStrong style={{ flex: 1 }}>{str.radarTitle}</BodyStrong>
              <Pressable accessibilityRole="button" accessibilityLabel={str.cancel} hitSlop={10} onPress={() => setRadarOpen(false)}>
                <Feather name="x" size={22} color={c.textMute} />
              </Pressable>
            </View>

            {radarQ.isLoading ? (
              <View style={{ paddingVertical: SPACE.lg, alignItems: 'center' }}>
                <ActivityIndicator color={c.accent} />
              </View>
            ) : radarQ.data && radarQ.data.signals.length > 0 ? (
              <View style={{ gap: SPACE.sm }}>
                {radarQ.data.signals.map((s, i) => {
                  const tone =
                    s.severity === 'high' ? c.risk : s.severity === 'medium' ? c.warn : c.info
                  return (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm }}>
                      <View
                        style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: tone }}
                      />
                      <Body style={{ flex: 1, color: c.text }}>{s.message}</Body>
                    </View>
                  )
                })}
              </View>
            ) : (
              <Body muted>{str.radarClear}</Body>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Contested-truth sheet (raise / resolve). */}
      <DisputeSheet
        visible={!!disputeSheet}
        mode={disputeSheet?.mode ?? 'raise'}
        event={disputeSheet?.event ?? null}
        eventSummary={disputeSheet?.summary ?? ''}
        lang={lang}
        meId={me?.id}
        onClose={() => setDisputeSheet(null)}
        onDone={() => {
          setDisputeSheet(null)
          // Refresh the thread so the card's contested/resolved state updates
          // (the kit owns the ['chat','thread',addrKey] query).
          thread.refetch()
        }}
      />

      {/* Quote-reply banner — the parent being replied to, with a cancel. */}
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

      {/* Smart-suggest chip — one tap turns the free text into a typed Card. */}
      {suggestion ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={suggestion.label}
          onPress={() => {
            void thread.sendProposal(suggestion.capture_type, suggestion.fields)
            setText('')
            scrollToEnd()
          }}
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

      {/* Voice-to-Card: hold-to-talk — the mukadam's primary input. */}
      <View style={{ marginHorizontal: SPACE.lg, marginBottom: SPACE.xs }}>
        <HoldToTalk
          label={str.holdToTalk}
          hint={str.voiceHint}
          recordingLabel={str.recording}
          tooShortLabel={str.tooShort}
          permLabel={str.micPerm}
          minHeight={72}
          onRecorded={(a) => void onVoice(a)}
        />
      </View>

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
          accessibilityLabel={str.scanBill}
          onPress={() => void onCamera()}
          style={{
            width: 48,
            height: 48,
            borderRadius: theme.radii.control,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="camera" size={22} color={c.accentDeep} />
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
            fontFamily: FACES[theme.name].body,
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
