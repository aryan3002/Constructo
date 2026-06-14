/**
 * My Requests & Decisions (homeowner, H2) — a ROOT route reachable via
 * `router.push('/requests')`. Because it lives outside the (homeowner) group it
 * self-provides the Daylight theme and self-guards auth.
 *
 * Calm Cockpit (§5 "My Requests" + "Decision detail"):
 *   • Requests — a calm "Flag an issue" form (title, detail, room chips,
 *     urgency chips, an add-photo button + an honest voice "coming soon" stub),
 *     then the thread split into OPEN and RESOLVED sections. Open items carry a
 *     StatusPill + an SLA promise line ("reply expected by…").
 *   • Decisions — pending items as DecisionCards (pre-brief: why-now, the
 *     reversible-until reassurance, never a bare "Approve?"). The
 *     capabilities-gated approve/comment logic is PRESERVED verbatim (owners
 *     approve; family/advisor get a comment box, never a grey lock).
 *
 * Photo + voice are captured in the UI only — there is no attachment endpoint
 * yet, so they are noted honestly rather than invented. Backend calls and the
 * authority/change-story logic are unchanged; this is a visual pass only.
 */
import type * as React from 'react'
import { useState } from 'react'
import {
  Image,
  Pressable,
  TextInput,
  View,
  type TextStyle,
} from 'react-native'
import { Link, Redirect } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'

import { useT } from '../src/i18n/I18nProvider'
import { useAuth } from '../src/auth/AuthContext'
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider'
import { SPACE, STATUS, TAP, type Status } from '../src/theme/tokens'
import { homeowner, ApiError } from '../src/api/client'
import type { Capabilities, HomeownerRequest, HomeownerDecision } from '../src/api/types'
import {
  Body,
  BodyStrong,
  Button,
  CalmCard,
  Card,
  Display,
  H2,
  Small,
  Screen,
  ScreenLoader,
  StatusPill,
} from '../src/ui'
import {
  REQUEST_STATUS_META,
  ROOM_PRESETS,
  URGENCY_PRESETS,
  buildRequestDetail,
  formatDate,
  isDecisionResolved,
  isRequestResolved,
  slaPromise,
  type Urgency,
} from './_requests.util'

type Tab = 'requests' | 'decisions'
type Lang = 'en' | 'hi'

// ---- local strings (bilingual; Hindi in Devanagari) ----
interface Strings {
  title: string
  back: string
  tabRequests: string
  tabDecisions: string
  flag: string
  flagHint: string
  fieldTitle: string
  titlePlaceholder: string
  fieldDetail: string
  detailPlaceholder: string
  room: string
  urgency: string
  addPhoto: string
  photoAdded: string
  voiceSoon: string
  submit: string
  submitting: string
  titleRequired: string
  submitError: string
  listEmpty: string
  sectionOpen: string
  sectionResolved: string
  decisionsEmpty: string
  needsYou: string
  whyNow: string
  reversible: string
  approve: string
  comment: string
  requestChange: string
  notePlaceholder: string
  send: string
  cancel: string
  loadError: string
  retry: string
  raised: string
  onlyOwnerApprove: string
}

const STR: Record<Lang, Strings> = {
  en: {
    title: 'Requests & Decisions',
    back: 'Home',
    tabRequests: 'Requests',
    tabDecisions: 'Decisions',
    flag: 'Flag an issue',
    flagHint: 'Raise something in under 30 seconds.',
    fieldTitle: 'What is the issue?',
    titlePlaceholder: 'e.g. Leaking tap in kitchen',
    fieldDetail: 'Add details (optional)',
    detailPlaceholder: 'Describe what you noticed…',
    room: 'Room',
    urgency: 'Urgency',
    addPhoto: 'Add photo',
    photoAdded: 'Photo added',
    voiceSoon: 'Voice note — coming soon',
    submit: 'Send to your team',
    submitting: 'Sending…',
    titleRequired: 'Please add a short title first.',
    submitError: 'Could not send. Please try again.',
    listEmpty: 'No requests yet. Anything you flag will appear here.',
    sectionOpen: 'Open',
    sectionResolved: 'Resolved',
    decisionsEmpty: 'Nothing needs your decision right now.',
    needsYou: 'NEEDS YOU',
    whyNow: 'Why this is coming up now',
    reversible: 'You can change your mind — nothing is final until work starts.',
    approve: 'Approve',
    comment: 'Comment',
    requestChange: 'Request change',
    notePlaceholder: 'Add a short note…',
    send: 'Send',
    cancel: 'Cancel',
    loadError: 'Could not load. Please retry.',
    retry: 'Retry',
    raised: 'Raised',
    onlyOwnerApprove: 'Only a property owner can approve this. You can leave a comment.',
  },
  hi: {
    title: 'अनुरोध और निर्णय',
    back: 'होम',
    tabRequests: 'अनुरोध',
    tabDecisions: 'निर्णय',
    flag: 'समस्या दर्ज करें',
    flagHint: '30 सेकंड से कम में कुछ भी दर्ज करें।',
    fieldTitle: 'क्या समस्या है?',
    titlePlaceholder: 'जैसे रसोई में टपकता नल',
    fieldDetail: 'विवरण जोड़ें (वैकल्पिक)',
    detailPlaceholder: 'आपने जो देखा उसका वर्णन करें…',
    room: 'कमरा',
    urgency: 'अत्यावश्यकता',
    addPhoto: 'फ़ोटो जोड़ें',
    photoAdded: 'फ़ोटो जोड़ी गई',
    voiceSoon: 'आवाज़ नोट — जल्द आ रहा है',
    submit: 'अपनी टीम को भेजें',
    submitting: 'भेजा जा रहा है…',
    titleRequired: 'कृपया पहले एक छोटा शीर्षक जोड़ें।',
    submitError: 'भेजा नहीं जा सका। कृपया पुनः प्रयास करें।',
    listEmpty: 'अभी कोई अनुरोध नहीं। आप जो दर्ज करेंगे वह यहाँ दिखेगा।',
    sectionOpen: 'खुले',
    sectionResolved: 'हल हुए',
    decisionsEmpty: 'अभी आपके किसी निर्णय की आवश्यकता नहीं है।',
    needsYou: 'आपकी ज़रूरत है',
    whyNow: 'यह अभी क्यों आ रहा है',
    reversible: 'आप अपना मन बदल सकते हैं — काम शुरू होने तक कुछ भी अंतिम नहीं है।',
    approve: 'स्वीकृत करें',
    comment: 'टिप्पणी',
    requestChange: 'बदलाव माँगें',
    notePlaceholder: 'एक छोटा नोट जोड़ें…',
    send: 'भेजें',
    cancel: 'रद्द करें',
    loadError: 'लोड नहीं हो सका। कृपया पुनः प्रयास करें।',
    retry: 'पुनः प्रयास',
    raised: 'दर्ज किया',
    onlyOwnerApprove: 'केवल संपत्ति के मालिक इसे मंज़ूर कर सकते हैं। आप एक टिप्पणी छोड़ सकते हैं।',
  },
} as const

// ---------------------------------------------------------------------------
// Root: theme + auth guard wrapper.
// ---------------------------------------------------------------------------
export default function RequestsRoute() {
  const { status } = useAuth()
  if (status === 'guest') return <Redirect href="/(auth)/login" />
  return (
    <ThemeProvider initial="daylight">
      <RequestsScreen authLoading={status === 'loading'} />
    </ThemeProvider>
  )
}

function RequestsScreen({ authLoading }: { authLoading: boolean }) {
  const { theme } = useTheme()
  const { lang } = useT()
  const t = STR[lang as Lang] ?? STR.en
  const [tab, setTab] = useState<Tab>('requests')

  if (authLoading) {
    return (
      <Screen>
        <ScreenLoader fill={false} />
      </Screen>
    )
  }

  return (
    <Screen>
      <Link href="/(homeowner)/home" replace asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          hitSlop={8}
          style={{
            minHeight: TAP,
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.xs,
            alignSelf: 'flex-start',
          }}
        >
          <Feather name="chevron-left" size={20} color={theme.colors.accent} />
          <BodyStrong color={theme.colors.accent}>{t.back}</BodyStrong>
        </Pressable>
      </Link>

      <Display>{t.title}</Display>

      <Segmented tab={tab} onChange={setTab} t={t} />

      {tab === 'requests' ? <RequestsTab t={t} lang={lang as Lang} /> : <DecisionsTab t={t} lang={lang as Lang} />}
    </Screen>
  )
}

// ---------------------------------------------------------------------------
// Segmented control — Calm Cockpit pills with Feather icons.
// ---------------------------------------------------------------------------
function Segmented({
  tab,
  onChange,
  t,
}: {
  tab: Tab
  onChange: (t: Tab) => void
  t: Strings
}) {
  const { theme } = useTheme()
  const opts: { key: Tab; label: string; icon: React.ComponentProps<typeof Feather>['name'] }[] = [
    { key: 'requests', label: t.tabRequests, icon: 'message-square' },
    { key: 'decisions', label: t.tabDecisions, icon: 'check-circle' },
  ]
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.paper,
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: theme.radii.control,
        padding: SPACE.xs,
        gap: SPACE.xs,
      }}
    >
      {opts.map((o) => {
        const active = o.key === tab
        const fg = active ? theme.colors.accent : theme.colors.textMute
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.key)}
            style={{
              flex: 1,
              minHeight: TAP,
              flexDirection: 'row',
              gap: SPACE.sm,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radii.control - 2,
              backgroundColor: active ? theme.colors.card : 'transparent',
            }}
          >
            <Feather name={o.icon} size={16} color={fg} />
            <BodyStrong color={fg}>{o.label}</BodyStrong>
          </Pressable>
        )
      })}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Shared bits.
// ---------------------------------------------------------------------------
function ErrorRetry({
  message,
  retryLabel,
  onRetry,
}: {
  message: string
  retryLabel: string
  onRetry: () => void
}) {
  const { theme } = useTheme()
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <Feather name="alert-octagon" size={16} color={theme.colors.risk} />
        <Small color={theme.colors.risk} style={{ flex: 1 }}>
          {message}
        </Small>
      </View>
      <View style={{ marginTop: SPACE.md }}>
        <Button title={retryLabel} variant="secondary" onPress={onRetry} />
      </View>
    </Card>
  )
}

/** A small caps section header with a leading Feather glyph. */
function SectionHeader({
  label,
  icon,
  color,
}: {
  label: string
  icon: React.ComponentProps<typeof Feather>['name']
  color?: string
}) {
  const { theme } = useTheme()
  const tint = color ?? theme.colors.textMute
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.xs }}>
      <Feather name={icon} size={14} color={tint} />
      <Small style={{ color: tint, letterSpacing: 1, fontWeight: '600' }}>{label.toUpperCase()}</Small>
    </View>
  )
}

function Chip({
  label,
  active,
  status,
  onPress,
}: {
  label: string
  active: boolean
  status?: Status
  onPress: () => void
}) {
  const { theme } = useTheme()
  const accent = status ? STATUS[status] : theme.colors.accent
  const border = active ? accent : theme.colors.line
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        minHeight: TAP,
        paddingHorizontal: SPACE.lg,
        justifyContent: 'center',
        borderRadius: theme.radii.pill,
        borderWidth: active ? 2 : 1,
        borderColor: border,
        backgroundColor: active ? theme.colors.accentWarm : 'transparent',
      }}
    >
      <BodyStrong color={active ? theme.colors.text : theme.colors.textMute}>{label}</BodyStrong>
    </Pressable>
  )
}

const noteInputStyle = (theme: ReturnType<typeof useTheme>['theme']): TextStyle => ({
  borderWidth: 1,
  borderColor: theme.colors.line,
  borderRadius: theme.radii.control,
  backgroundColor: theme.colors.paper,
  paddingHorizontal: SPACE.md,
  paddingVertical: SPACE.md,
  minHeight: TAP,
  color: theme.colors.text,
  letterSpacing: 0, // prevent iOS custom-font tracking from leaking into placeholder
})

// ---------------------------------------------------------------------------
// REQUESTS tab.
// ---------------------------------------------------------------------------
function RequestsTab({ t, lang }: { t: Strings; lang: Lang }) {
  const { theme } = useTheme()
  const qc = useQueryClient()

  const list = useQuery<HomeownerRequest[]>({
    queryKey: ['homeowner', 'requests'],
    queryFn: () => homeowner.requests(),
  })

  // ---- form state ----
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [roomKey, setRoomKey] = useState<string | null>(null)
  const [urgency, setUrgency] = useState<Urgency>('normal')
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () =>
      homeowner.createRequest({
        title: title.trim(),
        detail: buildRequestDetail({ detail, roomKey, urgency, photoCount: photoUri ? 1 : 0, lang }),
      }),
    onSuccess: () => {
      setTitle('')
      setDetail('')
      setRoomKey(null)
      setUrgency('normal')
      setPhotoUri(null)
      setFormError(null)
      void qc.invalidateQueries({ queryKey: ['homeowner', 'requests'] })
    },
    onError: () => setFormError(t.submitError),
  })

  const pickPhoto = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
      })
      if (!res.canceled && res.assets?.[0]?.uri) setPhotoUri(res.assets[0].uri)
    } catch {
      /* permission denied / cancelled — silent, photo is optional */
    }
  }

  const onSubmit = () => {
    if (!title.trim()) {
      setFormError(t.titleRequired)
      return
    }
    create.mutate()
  }

  const open = (list.data ?? []).filter((r) => !isRequestResolved(r.status))
  const resolved = (list.data ?? []).filter((r) => isRequestResolved(r.status))

  return (
    <View style={{ gap: SPACE.lg }}>
      {/* Flag an issue form */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Feather name="flag" size={18} color={theme.colors.accent} />
          <H2>{t.flag}</H2>
        </View>
        <Small muted style={{ marginTop: 2 }}>
          {t.flagHint}
        </Small>

        <View style={{ marginTop: SPACE.md, gap: SPACE.sm }}>
          <BodyStrong>{t.fieldTitle}</BodyStrong>
          <TextInput
            value={title}
            onChangeText={(v) => {
              setTitle(v)
              if (formError) setFormError(null)
            }}
            placeholder={t.titlePlaceholder}
            placeholderTextColor={theme.colors.textMute}
            style={noteInputStyle(theme)}
          />

          <BodyStrong style={{ marginTop: SPACE.sm }}>{t.fieldDetail}</BodyStrong>
          <TextInput
            value={detail}
            onChangeText={setDetail}
            placeholder={t.detailPlaceholder}
            placeholderTextColor={theme.colors.textMute}
            multiline
            style={[noteInputStyle(theme), { minHeight: 88, textAlignVertical: 'top' }]}
          />

          {/* Room chips */}
          <BodyStrong style={{ marginTop: SPACE.sm }}>{t.room}</BodyStrong>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
            {ROOM_PRESETS.map((r) => (
              <Chip
                key={r.key}
                label={lang === 'hi' ? r.hi : r.en}
                active={roomKey === r.key}
                onPress={() => setRoomKey(roomKey === r.key ? null : r.key)}
              />
            ))}
          </View>

          {/* Urgency chips */}
          <BodyStrong style={{ marginTop: SPACE.sm }}>{t.urgency}</BodyStrong>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
            {URGENCY_PRESETS.map((u) => (
              <Chip
                key={u.key}
                label={lang === 'hi' ? u.hi : u.en}
                active={urgency === u.key}
                status={u.status}
                onPress={() => setUrgency(u.key)}
              />
            ))}
          </View>

          {/* Photo + voice */}
          <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm, alignItems: 'center' }}>
            <Button
              title={photoUri ? t.photoAdded : t.addPhoto}
              variant="secondary"
              onPress={pickPhoto}
              leading={
                <Feather
                  name={photoUri ? 'check' : 'camera'}
                  size={16}
                  color={photoUri ? theme.colors.ok : theme.colors.text}
                />
              }
            />
            {/* Voice note — coming soon; non-interactive chip (no false affordance). */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.xs,
                paddingHorizontal: SPACE.md,
                paddingVertical: SPACE.sm,
                borderRadius: theme.radii.pill,
                borderWidth: 1,
                borderColor: theme.colors.line,
                opacity: 0.5,
              }}
            >
              <Feather name="mic" size={14} color={theme.colors.textMute} />
              <Small muted>{t.voiceSoon}</Small>
            </View>
          </View>
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={{
                width: '100%',
                height: 160,
                borderRadius: theme.radii.card,
                marginTop: SPACE.sm,
              }}
              resizeMode="cover"
            />
          ) : null}

          {formError ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
              <Feather name="alert-triangle" size={14} color={theme.colors.warn} />
              <Small color={theme.colors.warn} style={{ flex: 1 }}>
                {formError}
              </Small>
            </View>
          ) : null}

          <Button
            title={create.isPending ? t.submitting : t.submit}
            onPress={onSubmit}
            loading={create.isPending}
            block
            style={{ marginTop: SPACE.sm }}
            leading={
              create.isPending ? undefined : (
                <Feather name="send" size={16} color={theme.colors.onAccent} />
              )
            }
          />
        </View>
      </Card>

      {/* List — split into Open / Resolved */}
      {list.isLoading ? (
        <ScreenLoader fill={false} />
      ) : list.isError ? (
        <ErrorRetry message={t.loadError} retryLabel={t.retry} onRetry={() => list.refetch()} />
      ) : !list.data || list.data.length === 0 ? (
        <CalmCard title={t.tabRequests} body={t.listEmpty} status="info" />
      ) : (
        <View style={{ gap: SPACE.md }}>
          {open.length > 0 ? (
            <>
              <SectionHeader label={t.sectionOpen} icon="inbox" color={theme.colors.warn} />
              {open.map((r) => (
                <RequestRow key={r.id} req={r} t={t} lang={lang} showSla />
              ))}
            </>
          ) : null}

          {resolved.length > 0 ? (
            <>
              <SectionHeader label={t.sectionResolved} icon="check-circle" color={theme.colors.ok} />
              {resolved.map((r) => (
                <RequestRow key={r.id} req={r} t={t} lang={lang} />
              ))}
            </>
          ) : null}
        </View>
      )}
    </View>
  )
}

/** A single request card with StatusPill + (when open) an SLA promise line. */
function RequestRow({
  req,
  t,
  lang,
  showSla,
}: {
  req: HomeownerRequest
  t: Strings
  lang: Lang
  showSla?: boolean
}) {
  const { theme } = useTheme()
  const meta = REQUEST_STATUS_META[req.status]
  return (
    <Card>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: SPACE.md,
        }}
      >
        <BodyStrong style={{ flex: 1 }}>{req.title}</BodyStrong>
        <StatusPill status={meta.status} label={lang === 'hi' ? meta.hi : meta.en} size="sm" />
      </View>
      {req.detail ? (
        <Body muted style={{ marginTop: SPACE.xs }}>
          {req.detail}
        </Body>
      ) : null}
      {showSla ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: SPACE.xs,
            marginTop: SPACE.sm,
          }}
        >
          <Feather name="clock" size={13} color={theme.colors.accent} style={{ marginTop: 2 }} />
          <Small style={{ flex: 1, color: theme.colors.accentDeep }}>{slaPromise(req, lang)}</Small>
        </View>
      ) : null}
      <Small muted style={{ marginTop: SPACE.sm }}>
        {t.raised} · {formatDate(req.created_at, lang)}
      </Small>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// DECISIONS tab.
// ---------------------------------------------------------------------------
function DecisionsTab({ t, lang }: { t: Strings; lang: Lang }) {
  const { theme } = useTheme()
  const list = useQuery<HomeownerDecision[]>({
    queryKey: ['homeowner', 'decisions'],
    queryFn: () => homeowner.decisions(),
  })

  // Capabilities query — drives authority-aware Approve UX in DecisionCard.
  // Fallback: can_approve=false, can_comment=true so the screen never crashes.
  const capQ = useQuery<Capabilities>({
    queryKey: ['homeowner', 'capabilities'],
    queryFn: () => homeowner.capabilities(),
  })
  const canApprove = capQ.data?.can_approve ?? false
  const canComment = capQ.data?.can_comment ?? true

  if (list.isLoading) return <ScreenLoader fill={false} />
  if (list.isError)
    return <ErrorRetry message={t.loadError} retryLabel={t.retry} onRetry={() => list.refetch()} />

  const pending = (list.data ?? []).filter((d) => !isDecisionResolved(d.state))

  if (pending.length === 0) {
    return <CalmCard title={t.tabDecisions} body={t.decisionsEmpty} status="ok" />
  }

  return (
    <View style={{ gap: SPACE.md }}>
      <SectionHeader label={`${t.needsYou} · ${pending.length}`} icon="bell" color={theme.colors.warn} />
      {pending.map((d) => (
        <DecisionCard key={d.id} decision={d} t={t} canApprove={canApprove} canComment={canComment} />
      ))}
    </View>
  )
}

type DecisionAction = 'comment' | 'request_change'

function DecisionCard({
  decision,
  t,
  canApprove,
  canComment,
}: {
  decision: HomeownerDecision
  t: Strings
  canApprove: boolean
  canComment: boolean
}) {
  const { theme } = useTheme()
  const qc = useQueryClient()
  const [noteFor, setNoteFor] = useState<DecisionAction | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const respond = useMutation({
    mutationFn: (vars: { action: 'approve' | 'comment' | 'request_change'; note?: string }) =>
      homeowner.respondDecision(decision.id, vars.action, vars.note),
    onSuccess: () => {
      setNoteFor(null)
      setNote('')
      setError(null)
      void qc.invalidateQueries({ queryKey: ['homeowner', 'decisions'] })
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : t.submitError),
  })

  const submitNote = () => {
    if (!noteFor) return
    respond.mutate({ action: noteFor, note: note.trim() || undefined })
  }

  // Pre-brief card (§4 DecisionCard): NEEDS YOU eyebrow + title, a why-now line
  // (honestly from the decision's own detail — never invented), a reversible-
  // until reassurance, then the authority-gated choices (never a bare Approve?).
  return (
    <CalmCard title={decision.title} status="warn" eyebrow={t.needsYou}>
      {decision.detail ? (
        <View style={{ gap: SPACE.xs }}>
          <Small style={{ color: theme.colors.textMute, letterSpacing: 0.5 }}>
            {t.whyNow.toUpperCase()}
          </Small>
          <Body muted>{decision.detail}</Body>
        </View>
      ) : null}

      {/* Reversible-until reassurance — never a bare "Approve?" */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: SPACE.sm,
          marginTop: SPACE.md,
          backgroundColor: theme.colors.accentWarm,
          borderRadius: theme.radii.chip,
          paddingHorizontal: SPACE.md,
          paddingVertical: SPACE.sm,
        }}
      >
        <Feather name="rotate-ccw" size={15} color={theme.colors.accentDeep} style={{ marginTop: 2 }} />
        <Small style={{ flex: 1, color: theme.colors.accentDeep }}>{t.reversible}</Small>
      </View>

      {noteFor ? (
        <View style={{ marginTop: SPACE.md, gap: SPACE.sm }}>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t.notePlaceholder}
            placeholderTextColor={theme.colors.textMute}
            multiline
            autoFocus
            style={[noteInputStyle(theme), { minHeight: 72, textAlignVertical: 'top' }]}
          />
          {error ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
              <Feather name="alert-octagon" size={14} color={theme.colors.risk} />
              <Small color={theme.colors.risk} style={{ flex: 1 }}>
                {error}
              </Small>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            <Button
              title={t.send}
              onPress={submitNote}
              loading={respond.isPending}
              leading={<Feather name="send" size={16} color={theme.colors.onAccent} />}
            />
            <Button
              title={t.cancel}
              variant="ghost"
              disabled={respond.isPending}
              onPress={() => {
                setNoteFor(null)
                setNote('')
                setError(null)
              }}
            />
          </View>
        </View>
      ) : (
        <View style={{ marginTop: SPACE.md, gap: SPACE.sm }}>
          {error ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
              <Feather name="alert-octagon" size={14} color={theme.colors.risk} />
              <Small color={theme.colors.risk} style={{ flex: 1 }}>
                {error}
              </Small>
            </View>
          ) : null}
          {canApprove ? (
            // Owner path: show Approve button + secondary actions.
            <>
              <Button
                title={t.approve}
                onPress={() => respond.mutate({ action: 'approve' })}
                loading={respond.isPending}
                block
                leading={<Feather name="check" size={18} color={theme.colors.onAccent} />}
              />
              <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                <Button
                  title={t.comment}
                  variant="secondary"
                  disabled={respond.isPending}
                  onPress={() => {
                    setError(null)
                    setNoteFor('comment')
                  }}
                  leading={
                    <Feather name="message-circle" size={16} color={theme.colors.text} />
                  }
                />
                <Button
                  title={t.requestChange}
                  variant="secondary"
                  disabled={respond.isPending}
                  onPress={() => {
                    setError(null)
                    setNoteFor('request_change')
                  }}
                  leading={<Feather name="edit-3" size={16} color={theme.colors.text} />}
                />
              </View>
            </>
          ) : (
            // Non-owner path (family/advisor): advise, never gatekeep.
            <View style={{ gap: SPACE.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.xs }}>
                <Feather name="info" size={14} color={theme.colors.info} style={{ marginTop: 2 }} />
                <Small muted style={{ flex: 1 }}>
                  {t.onlyOwnerApprove}
                </Small>
              </View>
              {canComment ? (
                <Button
                  title={t.comment}
                  variant="secondary"
                  disabled={respond.isPending}
                  onPress={() => {
                    setError(null)
                    setNoteFor('comment')
                  }}
                  leading={
                    <Feather name="message-circle" size={16} color={theme.colors.text} />
                  }
                />
              ) : null}
            </View>
          )}
        </View>
      )}
    </CalmCard>
  )
}
