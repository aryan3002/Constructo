/**
 * Reply to an ask. The engineer answers a clarification an owner/designer pointed
 * at him. The answer routes through the EXISTING idempotent decision state
 * machine via the offline outbox (POST /api/v1/approvals/{id}/respond), so a
 * retry never double-settles the ledger row. "Send reply" = confirm (+ optional
 * note); "Can't confirm" = reject (+ note).
 */
import { useMemo, useState } from 'react'
import { Alert, ScrollView, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE } from '../../../../src/theme/tokens'
import { supervisorApi, ASK_RESPOND_PATH, type Approval } from '../../../../src/api/supervisor'
import { enqueue } from '../../../../src/offline/outbox'
import { useOutbox } from '../../../../src/offline/useOutbox'
import { Body, BodyStrong, Button, Card, Small, StatusPill, Title } from '../../../../src/ui'
import { ErrorBlock, LoadingBlock, SubHeader } from '../_eng.components'

let respSeq = 0

export default function TaskReply() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { theme } = useTheme()
  const router = useRouter()
  const { online, flush } = useOutbox()
  const insets = useSafeAreaInsets()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const asksQ = useQuery({ queryKey: ['eng', 'asks'], queryFn: () => supervisorApi.asksForMe() })
  const sitesQ = useQuery({ queryKey: ['eng', 'sites'], queryFn: () => supervisorApi.sites() })

  const ask = useMemo<Approval | undefined>(
    () => (asksQ.data?.items ?? []).find((a) => a.id === id),
    [asksQ.data, id],
  )
  const site = useMemo(
    () => (sitesQ.data?.items ?? []).find((s) => s.id === ask?.site_id)?.name ?? '',
    [sitesQ.data, ask],
  )

  const respond = async (action: 'confirm' | 'reject') => {
    if (!ask) return
    setBusy(true)
    respSeq += 1
    await enqueue({
      label: `${action === 'confirm' ? 'Reply' : 'Flag'}: ${ask.title}`,
      path: ASK_RESPOND_PATH(ask.id),
      method: 'POST',
      body: {
        action,
        note: note.trim() || null,
        client_response_id: `resp_${Date.now()}_${respSeq}`,
      },
    })
    if (online) void flush()
    Alert.alert('✓', 'Reply queued — will sync when online.')
    router.replace('/(contractor)/supervisor/tasks')
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: insets.top + SPACE.sm, paddingBottom: SPACE.xxl, gap: SPACE.lg }}
    >
      <SubHeader title="Reply" sub={site || undefined} onBack={() => router.replace('/(contractor)/supervisor/tasks')} />

      {asksQ.isLoading ? (
        <LoadingBlock />
      ) : asksQ.error ? (
        <ErrorBlock message="Could not load this ask." retryLabel="Try again" onRetry={() => void asksQ.refetch()} />
      ) : !ask ? (
        <Card variant="quiet">
          <Small muted>This ask is no longer open — it may already be answered.</Small>
        </Card>
      ) : ask.state !== 'pending' ? (
        <>
          <QuestionCard title={ask.title} detail={ask.detail} site={site} />
          <Card flag="ok" style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <Ionicons name="checkmark-circle" size={20} color={theme.colors.ok} />
            <Small style={{ color: theme.colors.ok }}>You’ve already answered this.</Small>
          </Card>
        </>
      ) : (
        <>
          <QuestionCard title={ask.title} detail={ask.detail} site={site} />
          <Card style={{ gap: SPACE.sm }}>
            <Small muted style={{ letterSpacing: 1 }}>
              YOUR REPLY
            </Small>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Type your answer (optional)…"
              placeholderTextColor={theme.colors.textMute}
              multiline
              style={{
                minHeight: 88,
                textAlignVertical: 'top',
                padding: SPACE.md,
                borderRadius: theme.radii.control,
                borderWidth: 1,
                borderColor: theme.colors.line,
                backgroundColor: theme.colors.paper,
                color: theme.colors.text,
                fontSize: 16,
              }}
            />
            <Button
              title="Send reply"
              variant="accent"
              block
              size="lg"
              disabled={busy}
              onPress={() => void respond('confirm')}
            />
            <Button
              title="Can’t confirm"
              variant="secondary"
              size="md"
              disabled={busy}
              onPress={() => void respond('reject')}
            />
            <Small muted style={{ textAlign: 'center' }}>
              Updates the linked record and notifies whoever asked.
            </Small>
          </Card>
        </>
      )}
    </ScrollView>
  )
}

function QuestionCard({
  title,
  detail,
  site,
}: {
  title: string
  detail: string | null
  site: string
}) {
  const { theme } = useTheme()
  return (
    <Card style={{ gap: SPACE.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <StatusPill status="warn" size="sm" label="Asked of you" />
        {site ? <Small muted style={{ marginLeft: 'auto' }}>{site}</Small> : null}
      </View>
      <Title style={{ fontSize: 17 }}>{title}</Title>
      {detail ? <Body muted>{detail}</Body> : null}
    </Card>
  )
}
