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
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '../../../src/auth/AuthContext'
import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { Body, BodyStrong, Mono, Small } from '../../../src/ui'
import {
  chatApi,
  newClientMsgId,
  type AskResult,
  type ChatEvent,
  type ChatMessage,
} from '../../../src/api/chat'
import { supervisorApi } from '../../../src/api/supervisor'
import { HoldToTalk, type RecordedAudio } from '../../../src/audio'
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
    replyingTo: 'Replying to',
    reply: 'Reply',
    cancel: 'Cancel',
    scanBill: 'Scan a bill',
    photo: '📷 Photo',
    uploadFailed: 'Upload failed — tap to retry',
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
    cancel: 'रद्द करें',
    scanBill: 'बिल स्कैन करें',
    photo: '📷 फ़ोटो',
    uploadFailed: 'अपलोड फेल — फिर दबाएँ',
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
  const { me } = useAuth()
  const insets = useSafeAreaInsets()
  const listRef = useRef<FlatList>(null)

  const [text, setText] = useState('')
  const [pending, setPending] = useState<Outgoing[]>([])
  // Local @ask answers from Nivaan (2.2) — grounded, not persisted messages.
  const [answers, setAnswers] = useState<{ id: string; question: string; result: AskResult }[]>([])
  // The message being quote-replied to (1.5 threading), or null.
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)

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

  // The pinned owner brief (1.8) — exceptions-first; hidden when all clear.
  const briefQ = useQuery({
    queryKey: ['chat', 'brief', site?.id],
    queryFn: () => chatApi.brief(site!.id),
    enabled: !!site,
    refetchInterval: 30000,
  })

  // Lookup for rendering a quoted parent above a reply (1.5 threading).
  const byId = useMemo(() => {
    const m = new Map<string, ChatMessage>()
    for (const x of msgsQ.data ?? []) m.set(x.id, x)
    return m
  }, [msgsQ.data])

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))
  }, [])

  const doSend = useCallback(
    async (clientMsgId: string, bodyText: string, capture?: Capture, replyToId?: string) => {
      if (!site) return
      try {
        await chatApi.send({
          site_id: site.id,
          client_msg_id: clientMsgId,
          body: bodyText,
          ...(replyToId ? { reply_to_id: replyToId } : {}),
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
      const replyToId = replyTo?.id
      setPending((p) => [...p, { clientMsgId, body: bodyText, status: 'sending', captured: !!capture }])
      setText('')
      setReplyTo(null)
      scrollToEnd()
      void doSend(clientMsgId, bodyText, capture, replyToId)
    },
    [site, doSend, scrollToEnd, replyTo],
  )

  // @ask Nivaan (2.2): a grounded one-line answer, scoped, computed server-side.
  const onAsk = useCallback(
    async (question: string) => {
      if (!site || !question) return
      const id = newClientMsgId()
      setText('')
      scrollToEnd()
      try {
        const result = await chatApi.ask(site.id, question)
        setAnswers((a) => [...a, { id, question, result }])
      } catch {
        setAnswers((a) => [
          ...a,
          { id, question, result: { answerable: false, answer: str.askFailed, total: null, unit: null, breakdown: {}, evidence_event_ids: [], contributors: 0, unconfirmed: 0 } },
        ])
      }
      scrollToEnd()
    },
    [site, scrollToEnd, str],
  )

  const onSend = useCallback(() => {
    const bodyText = text.trim()
    if (!bodyText || !site) return
    // "@ ..." asks Nivaan a grounded question instead of posting a message.
    if (bodyText.startsWith('@')) {
      void onAsk(bodyText.replace(/^@\s*(ask|nivaan)?\s*/i, '').trim())
      return
    }
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
  }, [text, site, dispatch, str, onAsk])

  // A single live smart-suggest chip (never while typing a slash-command).
  const suggestion = useMemo(
    () => (isSlash(text) ? null : suggestCapture(text, lang)),
    [text, lang],
  )

  // Camera-as-Sensor (1.2): snap a challan → presign → direct-upload to R2 →
  // send as a document message; the worker OCRs it into a card.
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
    const mime = asset.mimeType ?? 'image/jpeg'
    const clientMsgId = newClientMsgId()
    setPending((p) => [...p, { clientMsgId, body: str.photo, status: 'sending', captured: true }])
    scrollToEnd()
    try {
      const uploaded = await chatApi.uploadMedia(
        site.id,
        { uri: asset.uri, name: asset.fileName ?? 'challan.jpg', type: mime },
        'document',
      )
      await chatApi.send({
        site_id: site.id,
        client_msg_id: clientMsgId,
        media_type: 'document',
        attachment_key: uploaded.key,
        attachment_mime: mime,
        attachment_sha256: uploaded.sha256,
      })
      setPending((p) => p.filter((m) => m.clientMsgId !== clientMsgId))
      await msgsQ.refetch()
      scrollToEnd()
    } catch {
      setPending((p) =>
        p.map((m) => (m.clientMsgId === clientMsgId ? { ...m, status: 'failed' } : m)),
      )
    }
  }, [site, msgsQ, scrollToEnd, str])

  // Voice-to-Card (1.3): hold-to-talk → upload the .m4a as voice media → send;
  // the worker runs STT + numeral-repair into a card (the mukadam's primary input).
  const onVoice = useCallback(
    async (audio: RecordedAudio) => {
      if (!site) return
      const clientMsgId = newClientMsgId()
      setPending((p) => [...p, { clientMsgId, body: '🎙', status: 'sending', captured: true }])
      scrollToEnd()
      try {
        const uploaded = await chatApi.uploadMedia(
          site.id,
          { uri: audio.uri, name: audio.name, type: audio.mime },
          'voice',
        )
        await chatApi.send({
          site_id: site.id,
          client_msg_id: clientMsgId,
          media_type: 'voice',
          attachment_key: uploaded.key,
          attachment_mime: audio.mime,
          attachment_sha256: uploaded.sha256,
        })
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

  type Row =
    | { kind: 'server'; key: string; msg: ChatMessage }
    | { kind: 'pending'; key: string; out: Outgoing }
    | { kind: 'nivaan'; key: string; question: string; result: AskResult }

  const rows: Row[] = useMemo(() => {
    const server: Row[] = (msgsQ.data ?? []).map((m) => ({ kind: 'server', key: m.id, msg: m }))
    const out: Row[] = pending.map((o) => ({ kind: 'pending', key: o.clientMsgId, out: o }))
    const ans: Row[] = answers.map((a) => ({
      kind: 'nivaan', key: a.id, question: a.question, result: a.result,
    }))
    return [...server, ...out, ...ans]
  }, [msgsQ.data, pending, answers])

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

      {/* Pinned brief (1.8) — exceptions-first; shown only when something needs
          attention (empty = calm = good). */}
      {briefQ.data && briefQ.data.risk_count > 0 ? (
        <View
          style={{
            marginHorizontal: SPACE.lg,
            marginTop: SPACE.sm,
            padding: SPACE.md,
            borderRadius: theme.radii.card,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.card,
            gap: SPACE.xs,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="sunrise" size={14} color={c.accentDeep} />
            <BodyStrong>{briefQ.data.headline}</BodyStrong>
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
        </View>
      ) : null}

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
          // A Nivaan @ask answer — info-toned, grounded, with an evidence count.
          if (item.kind === 'nivaan') {
            const r = item.result
            return (
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
                <Small muted numberOfLines={1}>{item.question}</Small>
                <BodyStrong style={{ color: c.text }}>{r.answer}</BodyStrong>
                {r.evidence_event_ids.length > 0 ? (
                  <Mono muted style={{ fontSize: 11 }}>
                    {r.evidence_event_ids.length} {str.evidence}
                  </Mono>
                ) : null}
              </View>
            )
          }

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

          // A quoted-parent strip shown above a reply (server messages only).
          const parentSnippet =
            item.kind === 'server' && item.msg.reply_to_id
              ? msgSnippet(byId.get(item.msg.reply_to_id))
              : ''
          const quoted = parentSnippet ? (
            <View
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '92%',
                borderLeftWidth: 2,
                borderLeftColor: c.accent,
                paddingLeft: SPACE.sm,
              }}
            >
              <Small numberOfLines={1} style={{ color: c.textMute }}>
                ↩ {parentSnippet}
              </Small>
            </View>
          ) : null

          if (item.kind === 'server' && cardEvents.length > 0) {
            const msg = item.msg
            return (
              <View style={{ gap: 2 }}>
                {quoted}
                <Pressable
                  onLongPress={() => setReplyTo(msg)}
                  delayLongPress={250}
                  style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '92%', gap: SPACE.sm }}
                >
                  {cardEvents.map((ev: ChatEvent) => (
                    <CaptureCard
                      key={ev.id}
                      event={ev}
                      lang={lang}
                      sourceText={msg.body}
                      attachmentUrl={msg.attachment_url}
                      time={fmtTime(msg.created_at)}
                    />
                  ))}
                </Pressable>
              </View>
            )
          }

          const body = item.kind === 'pending' ? item.out.body : (item.msg.body ?? '')
          const serverMsg = item.kind === 'server' ? item.msg : null
          return (
            <View style={{ gap: 2 }}>
              {quoted}
              <Pressable
                onLongPress={serverMsg ? () => setReplyTo(serverMsg) : undefined}
                delayLongPress={250}
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
                {serverMsg?.attachment_url ? (
                  <Image
                    source={{ uri: serverMsg.attachment_url }}
                    style={{ width: 200, height: 150, borderRadius: 8, marginBottom: 4 }}
                    resizeMode="cover"
                  />
                ) : null}
                {body ? <Body style={{ color: c.text }}>{body}</Body> : null}
                <Mono style={{ color: c.textMute, fontSize: 11 }}>
                  {item.kind === 'pending'
                    ? item.out.status === 'failed'
                      ? str.failed
                      : item.out.captured
                        ? str.booked
                        : str.sending
                    : fmtTime(item.msg.created_at)}
                </Mono>
              </Pressable>
            </View>
          )
        }}
      />

      {/* Quote-reply banner — the parent being replied to, with a cancel. */}
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

      {/* Voice-to-Card (1.3): hold-to-talk — the mukadam's primary input. */}
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
