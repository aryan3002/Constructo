/**
 * Decision detail — homeowner pushed screen (Calm Cockpit §5 "Decision detail").
 *
 * Reads the decision from `homeowner.decisions()` list by `id`.
 * Shows the contractor's note (decision.detail), an AI "your style leans…"
 * hint from `homeowner.designProfile()`, and
 * capability-gated actions:
 *   - Approve → `homeowner.respondDecision(id, 'approve')`
 *   - Comment → `homeowner.respondDecision(id, 'comment', note)`
 *   - Request change → `homeowner.respondDecision(id, 'request_change', note)`
 *
 * Optimistic confirm via `useToast`. Shows the "reversible until the
 * contractor acts" reassurance. Authority-gated: owners can approve; other
 * roles can comment only (never a grey lock — always give them a voice).
 *
 * Route: (homeowner)/decisions/[id] — registered `href: null` in _layout.tsx.
 */
import { useState } from 'react'
import { ActivityIndicator, TextInput, View, type TextStyle } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { homeowner, ApiError } from '../../../src/api/client'
import type { Capabilities, DesignProfile, HomeownerDecision } from '../../../src/api/types'
import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  CalmCard,
  Card,
  Screen,
  Small,
  StatusPill,
  SubHeader,
  useInputStyle,
  useToast,
} from '../../../src/ui'

type Lang = 'en' | 'hi'
type RespondAction = 'approve' | 'comment' | 'request_change'

// ---- localised copy ----
interface Strings {
  title: string
  loadError: string
  notFound: string
  retry: string
  back: string
  status: string
  contractorNote: string
  whyNow: string
  reversible: string
  styleLeans: string
  approve: string
  comment: string
  requestChange: string
  notePlaceholder: string
  send: string
  cancel: string
  approveSuccess: string
  commentSuccess: string
  changeSuccess: string
  respondError: string
  onlyOwnerApprove: string
  pendingState: string
  acknowledgedState: string
  resolvedState: string
  rejectedState: string
  escalatedState: string
}

const STR: Record<Lang, Strings> = {
  en: {
    title: 'Decision',
    loadError: 'Could not load. Please retry.',
    notFound: 'This decision could not be found.',
    retry: 'Retry',
    back: 'Back',
    status: 'Status',
    contractorNote: 'From your team',
    whyNow: 'WHY THIS IS COMING UP NOW',
    reversible: 'You can change your mind — nothing is final until work starts.',
    styleLeans: 'Your style leans',
    approve: 'Approve',
    comment: 'Comment',
    requestChange: 'Request change',
    notePlaceholder: 'Add a short note…',
    send: 'Send',
    cancel: 'Cancel',
    approveSuccess: 'Approved',
    commentSuccess: 'Comment sent',
    changeSuccess: 'Change requested',
    respondError: 'Could not send. Please try again.',
    onlyOwnerApprove: 'Only a property owner can approve this. You can leave a comment.',
    pendingState: 'Needs you',
    acknowledgedState: 'Acknowledged',
    resolvedState: 'Resolved',
    rejectedState: 'Rejected',
    escalatedState: 'Escalated',
  },
  hi: {
    title: 'निर्णय',
    loadError: 'लोड नहीं हो सका। कृपया पुनः प्रयास करें।',
    notFound: 'यह निर्णय नहीं मिला।',
    retry: 'पुनः प्रयास',
    back: 'वापस',
    status: 'स्थिति',
    contractorNote: 'आपकी टीम से',
    whyNow: 'यह अभी क्यों आ रहा है',
    reversible: 'आप अपना मन बदल सकते हैं — काम शुरू होने तक कुछ भी अंतिम नहीं है।',
    styleLeans: 'आपकी पसंद',
    approve: 'स्वीकृत करें',
    comment: 'टिप्पणी',
    requestChange: 'बदलाव माँगें',
    notePlaceholder: 'एक छोटा नोट जोड़ें…',
    send: 'भेजें',
    cancel: 'रद्द करें',
    approveSuccess: 'स्वीकृत',
    commentSuccess: 'टिप्पणी भेजी',
    changeSuccess: 'बदलाव माँगा',
    respondError: 'भेजा नहीं जा सका। कृपया पुनः प्रयास करें।',
    onlyOwnerApprove: 'केवल संपत्ति के मालिक इसे मंज़ूर कर सकते हैं। आप एक टिप्पणी छोड़ सकते हैं।',
    pendingState: 'आपकी ज़रूरत है',
    acknowledgedState: 'संज्ञान लिया',
    resolvedState: 'हल हुआ',
    rejectedState: 'अस्वीकृत',
    escalatedState: 'एस्केलेट किया',
  },
} as const

/** Map decision.state → Status tone for the StatusPill. */
function stateStatus(state: string): 'warn' | 'ok' | 'risk' | 'info' {
  switch (state) {
    case 'pending':
      return 'warn'
    case 'acknowledged':
      return 'info'
    case 'resolved':
      return 'ok'
    case 'rejected':
      return 'risk'
    case 'escalated':
      return 'risk'
    default:
      return 'info'
  }
}

function stateLabel(state: string, t: Strings): string {
  switch (state) {
    case 'pending':
      return t.pendingState
    case 'acknowledged':
      return t.acknowledgedState
    case 'resolved':
      return t.resolvedState
    case 'rejected':
      return t.rejectedState
    case 'escalated':
      return t.escalatedState
    default:
      return state
  }
}

/** Extract a prose "style leans" hint from the DesignProfile if one exists. */
function styleLeanText(profile: DesignProfile | undefined): string | null {
  if (!profile?.profile) return null
  const p = profile.profile
  // The profile blob shape (from profile.tsx): { text: string, tone: string[] }
  const text = typeof p['text'] === 'string' ? (p['text'] as string) : null
  const tone = Array.isArray(p['tone']) ? (p['tone'] as string[]) : []
  if (text && text.length > 0) {
    // Return first sentence or the tone words — whatever is available.
    const first = text.split(/[.।]/)[0]?.trim()
    if (first && first.length > 0) return first
  }
  if (tone.length > 0) return tone.slice(0, 3).join(', ')
  return null
}

export default function DecisionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { lang } = useT()
  const t = STR[lang as Lang] ?? STR.en
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const qc = useQueryClient()
  const toast = useToast()
  const inputStyle = useInputStyle()

  const [noteFor, setNoteFor] = useState<RespondAction | null>(null)
  const [note, setNote] = useState('')
  const [respondError, setRespondError] = useState<string | null>(null)

  // ---- queries ----
  const decisionsQ = useQuery<HomeownerDecision[]>({
    queryKey: ['homeowner', 'decisions'],
    queryFn: () => homeowner.decisions(),
  })

  const capQ = useQuery<Capabilities>({
    queryKey: ['homeowner', 'capabilities'],
    queryFn: () => homeowner.capabilities(),
  })

  const profileQ = useQuery<DesignProfile>({
    queryKey: ['design', 'profile'],
    queryFn: () => homeowner.designProfile(),
    // Non-blocking — failure is silent (AI hint is advisory only)
    retry: false,
  })

  const canApprove = capQ.data?.can_approve ?? false
  const canComment = capQ.data?.can_comment ?? true

  // ---- respond mutation ----
  const respondMut = useMutation({
    mutationFn: (vars: { action: RespondAction; note?: string }) =>
      homeowner.respondDecision(id, vars.action, vars.note),
    onSuccess: (_, vars) => {
      setNoteFor(null)
      setNote('')
      setRespondError(null)
      void qc.invalidateQueries({ queryKey: ['homeowner', 'decisions'] })
      const msg =
        vars.action === 'approve'
          ? t.approveSuccess
          : vars.action === 'comment'
            ? t.commentSuccess
            : t.changeSuccess
      toast(msg)
      // A comment is upward voice — the decision stays open, so keep the user on
      // this screen instead of popping back to Home. Only terminal actions
      // (approve / request_change) navigate away.
      if (vars.action !== 'comment') {
        router.back()
      }
    },
    onError: (e) =>
      setRespondError(e instanceof ApiError ? e.message : t.respondError),
  })

  const submitNote = () => {
    if (!noteFor) return
    respondMut.mutate({ action: noteFor, note: note.trim() || undefined })
  }

  // ---- loading / error state ----
  if (decisionsQ.isLoading || capQ.isLoading) {
    return (
      <Screen>
        <SubHeader title={t.title} onBack={() => router.back()} />
        <ActivityIndicator color={c.accent} style={{ marginTop: SPACE.xl }} />
      </Screen>
    )
  }

  if (decisionsQ.isError) {
    return (
      <Screen>
        <SubHeader title={t.title} onBack={() => router.back()} />
        <CalmCard title={t.loadError} status="risk">
          <Button
            title={t.retry}
            variant="ghost"
            size="md"
            onPress={() => void decisionsQ.refetch()}
          />
        </CalmCard>
      </Screen>
    )
  }

  const decision = decisionsQ.data?.find((d) => d.id === id)

  if (!decision) {
    return (
      <Screen>
        <SubHeader title={t.title} onBack={() => router.back()} />
        <CalmCard title={t.notFound} status="info" />
      </Screen>
    )
  }

  const isPending = decision.state === 'pending'
  const multilineStyle: TextStyle = {
    ...(inputStyle as TextStyle),
    minHeight: 80,
    textAlignVertical: 'top',
    paddingVertical: SPACE.md,
  }

  // AI style hint (advisory, from profile — never mandatory)
  const styleHint = styleLeanText(profileQ.data)

  return (
    <Screen floatingNav>
      <SubHeader title={t.title} onBack={() => router.back()} />

      <View style={{ gap: SPACE.lg, marginTop: SPACE.md }}>
        {/* Title + Status */}
        <View style={{ gap: SPACE.sm }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: SPACE.md,
            }}
          >
            <BodyStrong style={{ flex: 1, fontSize: 18 }}>
              {decision.title}
            </BodyStrong>
            <StatusPill
              status={stateStatus(decision.state)}
              label={stateLabel(decision.state, t)}
              size="sm"
            />
          </View>
        </View>

        {/* Contractor note / detail */}
        {decision.detail ? (
          <Card>
            <Small style={{ color: c.textMute, letterSpacing: 0.8, marginBottom: SPACE.xs }}>
              {t.whyNow}
            </Small>
            <Body>{decision.detail}</Body>
          </Card>
        ) : null}

        {/* AI style hint — advisory, never mandatory */}
        {styleHint ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: SPACE.sm,
              backgroundColor: c.accentWarm,
              borderRadius: theme.radii.chip,
              paddingHorizontal: SPACE.md,
              paddingVertical: SPACE.sm,
            }}
          >
            <Feather name="feather" size={15} color={c.accentDeep} style={{ marginTop: 2 }} />
            <Small style={{ flex: 1, color: c.accentDeep }}>
              {t.styleLeans}: {styleHint}
            </Small>
          </View>
        ) : null}

        {/* Reversible-until reassurance — never a bare "Approve?" */}
        {isPending ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: SPACE.sm,
              backgroundColor: c.paper,
              borderRadius: theme.radii.chip,
              paddingHorizontal: SPACE.md,
              paddingVertical: SPACE.sm,
              borderWidth: 1,
              borderColor: c.line,
            }}
          >
            <Feather name="rotate-ccw" size={15} color={c.textMute} style={{ marginTop: 2 }} />
            <Small muted style={{ flex: 1 }}>{t.reversible}</Small>
          </View>
        ) : null}

        {/* Actions — only visible for pending decisions */}
        {isPending ? (
          noteFor ? (
            /* Note input */
            <View style={{ gap: SPACE.sm }}>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={t.notePlaceholder}
                placeholderTextColor={c.textMute}
                multiline
                autoFocus
                style={multilineStyle}
              />
              {respondError ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
                  <Feather name="alert-triangle" size={14} color={c.risk} />
                  <Small color={c.risk} style={{ flex: 1 }}>
                    {respondError}
                  </Small>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                <Button
                  title={t.send}
                  onPress={submitNote}
                  loading={respondMut.isPending}
                  style={{ minHeight: TAP }}
                  leading={<Feather name="send" size={16} color={c.onAccent} />}
                />
                <Button
                  title={t.cancel}
                  variant="ghost"
                  disabled={respondMut.isPending}
                  onPress={() => {
                    setNoteFor(null)
                    setNote('')
                    setRespondError(null)
                  }}
                />
              </View>
            </View>
          ) : (
            /* Action buttons */
            <View style={{ gap: SPACE.sm }}>
              {respondError ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
                  <Feather name="alert-triangle" size={14} color={c.risk} />
                  <Small color={c.risk} style={{ flex: 1 }}>
                    {respondError}
                  </Small>
                </View>
              ) : null}

              {canApprove ? (
                /* Owner path: Approve primary + Comment + Request change */
                <>
                  <Button
                    title={t.approve}
                    onPress={() => respondMut.mutate({ action: 'approve' })}
                    loading={respondMut.isPending}
                    block
                    style={{ minHeight: TAP }}
                    leading={<Feather name="check" size={18} color={c.onAccent} />}
                  />
                  <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                    <Button
                      title={t.comment}
                      variant="secondary"
                      disabled={respondMut.isPending}
                      onPress={() => {
                        setRespondError(null)
                        setNoteFor('comment')
                      }}
                      leading={
                        <Feather name="message-circle" size={16} color={c.accentDeep} />
                      }
                    />
                    <Button
                      title={t.requestChange}
                      variant="secondary"
                      disabled={respondMut.isPending}
                      onPress={() => {
                        setRespondError(null)
                        setNoteFor('request_change')
                      }}
                      leading={<Feather name="edit-3" size={16} color={c.accentDeep} />}
                    />
                  </View>
                </>
              ) : (
                /* Non-owner: advise, never gatekeep */
                <View style={{ gap: SPACE.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.xs }}>
                    <Feather name="info" size={14} color={c.info} style={{ marginTop: 2 }} />
                    <Small muted style={{ flex: 1 }}>
                      {t.onlyOwnerApprove}
                    </Small>
                  </View>
                  {canComment ? (
                    <Button
                      title={t.comment}
                      variant="secondary"
                      disabled={respondMut.isPending}
                      onPress={() => {
                        setRespondError(null)
                        setNoteFor('comment')
                      }}
                      leading={
                        <Feather name="message-circle" size={16} color={c.accentDeep} />
                      }
                    />
                  ) : null}
                </View>
              )}
            </View>
          )
        ) : null}
      </View>
    </Screen>
  )
}
