/**
 * Tasks / Asks (`/tasks`) — the only place the supervisor is ASKED for
 * something: PM/bot questions, confirmations, drawing requests. Each item is
 * one-tap-answerable.
 *
 * We read the asks-pointed-at-me feed (GET /api/v1/approvals?for=me) and surface
 * the PENDING ones with a respond affordance. Responding ENQUEUES to the offline
 * outbox (optimistic, sync-tolerant) rather than blocking on network; the outbox
 * replays POST /api/v1/approvals/{id}/respond, which routes through the existing
 * idempotent decision state machine (C3 — this is the real endpoint, not a stub).
 */
import { useCallback, useState } from 'react'
import { Alert, Pressable, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import {
  Body,
  BodyStrong,
  Card,
  Display,
  Mono,
  Screen,
  Small,
  StatusPill,
  SyncStatus,
} from '../../../src/ui'
import { enqueue } from '../../../src/offline/outbox'
import { useOutbox } from '../../../src/offline/useOutbox'
import { supervisorApi, ASK_RESPOND_PATH, type Approval } from '../../../src/api/supervisor'
import { CalmEmpty, ErrorState, Loading, SPACE, TAP } from './_components'

const STR = {
  en: {
    title: 'Tasks / Asks',
    retry: 'Try again',
    err: 'Could not load your asks.',
    emptyTitle: 'All clear!',
    emptyBody: 'Nothing pending — no one is waiting on you.',
    respond: 'Confirm',
    sentToast: 'Response queued — will sync when online.',
    pending: 'Needs you',
  },
  hi: {
    title: 'काम / सवाल',
    retry: 'फिर कोशिश करें',
    err: 'सवाल लोड नहीं हो सके।',
    emptyTitle: 'सब क्लियर!',
    emptyBody: 'कोई पेंडिंग काम नहीं — कोई आपका इंतज़ार नहीं कर रहा।',
    respond: 'पक्का करो',
    sentToast: 'जवाब कतार में — ऑनलाइन होते ही भेज देंगे।',
    pending: 'आपका जवाब चाहिए',
  },
} as const

let respSeq = 0

export default function TasksAsks() {
  const { lang } = useT()
  const str = STR[lang]
  const { online, flush } = useOutbox()
  const [responded, setResponded] = useState<Set<string>>(new Set())

  const q = useQuery({
    queryKey: ['supervisor', 'asks', 'me'],
    queryFn: () => supervisorApi.asksForMe(),
  })

  const pending: Approval[] = (q.data?.items ?? []).filter(
    (a) => a.status === 'pending' && !responded.has(a.id),
  )

  const respond = useCallback(
    async (a: Approval) => {
      respSeq += 1
      // Respond to an ask by confirming it. The outbox replays this against the
      // real supervisor-respond endpoint, which is idempotent (CA8) so a retry
      // never double-settles the ledger row.
      await enqueue({
        label: `${str.respond}: ${a.title}`,
        path: ASK_RESPOND_PATH(a.id),
        method: 'POST',
        body: { action: 'confirm', client_response_id: `resp_${Date.now()}_${respSeq}` },
      })
      // Optimistically drop it from the list; nudge a drain if online.
      setResponded((prev) => new Set(prev).add(a.id))
      if (online) void flush()
      Alert.alert('✓', str.sentToast)
    },
    [str, online, flush],
  )

  return (
    <Screen>
      <View style={{ marginHorizontal: -SPACE.lg, marginTop: -SPACE.md }}>
        <SyncStatus />
      </View>

      <Display>{str.title}</Display>

      {q.isLoading ? <Loading /> : null}
      {q.isError ? (
        <ErrorState message={str.err} retryLabel={str.retry} onRetry={() => void q.refetch()} />
      ) : null}

      {q.isSuccess && pending.length === 0 ? (
        <CalmEmpty title={str.emptyTitle} body={str.emptyBody} />
      ) : null}

      {pending.map((a) => (
        <AskCard key={a.id} ask={a} respondLabel={str.respond} pendingLabel={str.pending} onRespond={() => void respond(a)} />
      ))}
    </Screen>
  )
}

function AskCard({
  ask,
  respondLabel,
  pendingLabel,
  onRespond,
}: {
  ask: Approval
  respondLabel: string
  pendingLabel: string
  onRespond: () => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <Card>
      <View style={{ gap: SPACE.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md }}>
          <BodyStrong style={{ flex: 1 }}>{ask.title}</BodyStrong>
          <StatusPill status="warn" label={pendingLabel} size="sm" />
        </View>
        {ask.detail ? <Body muted>{ask.detail}</Body> : null}
        <Mono muted style={{ fontSize: 12 }}>
          {ask.created_at}
        </Mono>
        <Pressable
          accessibilityRole="button"
          onPress={onRespond}
          style={({ pressed }) => ({
            minHeight: TAP,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radii.control,
            backgroundColor: c.accent,
            opacity: pressed ? 0.92 : 1,
            marginTop: SPACE.xs,
          })}
        >
          <BodyStrong color={c.onAccent}>✓ {respondLabel}</BodyStrong>
        </Pressable>
      </View>
    </Card>
  )
}
