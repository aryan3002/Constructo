/**
 * Requests & Decisions (homeowner, H2) — a ROOT route reachable via
 * `router.push('/requests')`. Because it lives outside the (homeowner) group it
 * self-provides the Daylight theme and self-guards auth.
 *
 * A top segmented control toggles two tabs:
 *   • Requests — a prominent "Flag an issue" form (title, detail, room chips,
 *     urgency chips, an add-photo button + a voice stub) plus the lifecycle
 *     list (sent→seen→in_progress→done) as status-chipped cards.
 *   • Decisions — pending items as calm warn-cards with Approve / Comment /
 *     Request change actions; resolved items drop out after acting.
 *
 * Photo + voice are captured in the UI only — there is no attachment endpoint
 * yet, so they are noted as TODOs rather than invented.
 */
import { useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  TextInput,
  View,
  type TextStyle,
} from 'react-native'
import { Link, Redirect } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'

import { useT } from '../src/i18n/I18nProvider'
import { useAuth } from '../src/auth/AuthContext'
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider'
import { SPACE, TAP, type Status } from '../src/theme/tokens'
import { homeowner, ApiError } from '../src/api/client'
import type { HomeownerRequest, HomeownerDecision } from '../src/api/types'
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
  StatusPill,
} from '../src/ui'
import {
  REQUEST_STATUS_META,
  ROOM_PRESETS,
  URGENCY_PRESETS,
  buildRequestDetail,
  formatDate,
  isDecisionResolved,
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
  voice: string
  submit: string
  submitting: string
  titleRequired: string
  submitError: string
  listEmpty: string
  decisionsEmpty: string
  approve: string
  comment: string
  requestChange: string
  notePlaceholder: string
  send: string
  cancel: string
  loadError: string
  retry: string
  raised: string
}

const STR: Record<Lang, Strings> = {
  en: {
    title: 'Requests & Decisions',
    back: '‹ Home',
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
    photoAdded: 'Photo added ✓',
    voice: 'Voice note',
    submit: 'Send to your team',
    submitting: 'Sending…',
    titleRequired: 'Please add a short title first.',
    submitError: 'Could not send. Please try again.',
    listEmpty: 'No requests yet. Anything you flag will appear here.',
    decisionsEmpty: 'Nothing needs your decision right now ✓',
    approve: 'Approve',
    comment: 'Comment',
    requestChange: 'Request change',
    notePlaceholder: 'Add a short note…',
    send: 'Send',
    cancel: 'Cancel',
    loadError: 'Could not load. Please retry.',
    retry: 'Retry',
    raised: 'Raised',
  },
  hi: {
    title: 'अनुरोध और निर्णय',
    back: '‹ होम',
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
    photoAdded: 'फ़ोटो जोड़ी गई ✓',
    voice: 'आवाज़ नोट',
    submit: 'अपनी टीम को भेजें',
    submitting: 'भेजा जा रहा है…',
    titleRequired: 'कृपया पहले एक छोटा शीर्षक जोड़ें।',
    submitError: 'भेजा नहीं जा सका। कृपया पुनः प्रयास करें।',
    listEmpty: 'अभी कोई अनुरोध नहीं। आप जो दर्ज करेंगे वह यहाँ दिखेगा।',
    decisionsEmpty: 'अभी आपके किसी निर्णय की आवश्यकता नहीं है ✓',
    approve: 'स्वीकृत करें',
    comment: 'टिप्पणी',
    requestChange: 'बदलाव माँगें',
    notePlaceholder: 'एक छोटा नोट जोड़ें…',
    send: 'भेजें',
    cancel: 'रद्द करें',
    loadError: 'लोड नहीं हो सका। कृपया पुनः प्रयास करें।',
    retry: 'पुनः प्रयास',
    raised: 'दर्ज किया',
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
        <ActivityIndicator color={theme.colors.accent} />
      </Screen>
    )
  }

  return (
    <Screen>
      <Link href="/(homeowner)/home" replace asChild>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          style={{ minHeight: TAP, justifyContent: 'center', alignSelf: 'flex-start' }}
        >
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
// Segmented control.
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
  const opts: { key: Tab; label: string }[] = [
    { key: 'requests', label: t.tabRequests },
    { key: 'decisions', label: t.tabDecisions },
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
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.key)}
            style={{
              flex: 1,
              minHeight: TAP,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radii.control - 2,
              backgroundColor: active ? theme.colors.card : 'transparent',
            }}
          >
            <BodyStrong color={active ? theme.colors.accent : theme.colors.textMute}>
              {o.label}
            </BodyStrong>
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
  return (
    <Card>
      <Small color="#e5484d">{message}</Small>
      <View style={{ marginTop: SPACE.md }}>
        <Button title={retryLabel} variant="secondary" onPress={onRetry} />
      </View>
    </Card>
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
  const accent = status ? undefined : theme.colors.accent
  const border = active ? accent ?? theme.colors.accent : theme.colors.line
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
        backgroundColor: active ? theme.colors.paper : 'transparent',
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
        detail: buildRequestDetail({ detail, roomKey, urgency, hasPhoto: !!photoUri, lang }),
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

  return (
    <View style={{ gap: SPACE.lg }}>
      {/* Flag an issue form */}
      <Card>
        <H2>{t.flag}</H2>
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
          <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm }}>
            <Button
              title={photoUri ? t.photoAdded : t.addPhoto}
              variant="secondary"
              onPress={pickPhoto}
            />
            {/* VOICE stub — no audio capture endpoint yet. */}
            <Button
              title={`🎤 ${t.voice}`}
              variant="secondary"
              onPress={() => {
                // TODO: wire up voice capture once an audio attachment flow exists.
              }}
            />
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

          {formError ? <Small color="#e5484d">{formError}</Small> : null}

          <Button
            title={create.isPending ? t.submitting : t.submit}
            onPress={onSubmit}
            loading={create.isPending}
            block
            style={{ marginTop: SPACE.sm }}
          />
        </View>
      </Card>

      {/* List */}
      {list.isLoading ? (
        <ActivityIndicator color={theme.colors.accent} />
      ) : list.isError ? (
        <ErrorRetry message={t.loadError} retryLabel={t.retry} onRetry={() => list.refetch()} />
      ) : !list.data || list.data.length === 0 ? (
        <CalmCard title={t.tabRequests} body={t.listEmpty} status="info" />
      ) : (
        <View style={{ gap: SPACE.md }}>
          {list.data.map((r) => {
            const meta = REQUEST_STATUS_META[r.status]
            return (
              <Card key={r.id}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: SPACE.md,
                  }}
                >
                  <BodyStrong style={{ flex: 1 }}>{r.title}</BodyStrong>
                  <StatusPill
                    status={meta.status}
                    label={lang === 'hi' ? meta.hi : meta.en}
                    size="sm"
                  />
                </View>
                {r.detail ? (
                  <Body muted style={{ marginTop: SPACE.xs }}>
                    {r.detail}
                  </Body>
                ) : null}
                <Small muted style={{ marginTop: SPACE.sm }}>
                  {t.raised} · {formatDate(r.created_at, lang)}
                </Small>
              </Card>
            )
          })}
        </View>
      )}
    </View>
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

  if (list.isLoading) return <ActivityIndicator color={theme.colors.accent} />
  if (list.isError)
    return <ErrorRetry message={t.loadError} retryLabel={t.retry} onRetry={() => list.refetch()} />

  const pending = (list.data ?? []).filter((d) => !isDecisionResolved(d.state))

  if (pending.length === 0) {
    return <CalmCard title={t.tabDecisions} body={t.decisionsEmpty} status="ok" />
  }

  return (
    <View style={{ gap: SPACE.md }}>
      {pending.map((d) => (
        <DecisionCard key={d.id} decision={d} t={t} />
      ))}
    </View>
  )
}

type DecisionAction = 'comment' | 'request_change'

function DecisionCard({
  decision,
  t,
}: {
  decision: HomeownerDecision
  t: Strings
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

  return (
    <CalmCard title={decision.title} status="warn">
      {decision.detail ? <Body muted>{decision.detail}</Body> : null}

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
          {error ? <Small color="#e5484d">{error}</Small> : null}
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            <Button
              title={t.send}
              onPress={submitNote}
              loading={respond.isPending}
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
          {error ? <Small color="#e5484d">{error}</Small> : null}
          <Button
            title={t.approve}
            onPress={() => respond.mutate({ action: 'approve' })}
            loading={respond.isPending}
            block
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
            />
            <Button
              title={t.requestChange}
              variant="secondary"
              disabled={respond.isPending}
              onPress={() => {
                setError(null)
                setNoteFor('request_change')
              }}
            />
          </View>
        </View>
      )}
    </CalmCard>
  )
}
