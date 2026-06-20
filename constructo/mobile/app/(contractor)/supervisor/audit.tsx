/**
 * Site Audit hub (engineer) — the inspections owners requested for the engineer
 * to RUN on site. Walk the site, mark each check pass/observe/fail; the backend
 * scores it deterministically and the findings go back to the owner.
 *
 *   - "To run"   → audits with status requested / in_progress (tap → run).
 *   - "Submitted" → completed audits (score sent).
 */
import { useCallback, useMemo } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { audit, type Audit } from '../../../src/api/ownerAudit'
import { supervisorApi } from '../../../src/api/supervisor'
import { Body, Card, Eyebrow, Small, StatusPill, Title } from '../../../src/ui'
import { ErrorBlock, LoadingBlock, ScoreDial, SectionLabel, SubHeader, formatWhen, scoreStatus } from './_eng.components'

export default function EngAuditHub() {
  const { theme } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const sitesQ = useQuery({ queryKey: ['eng', 'sites'], queryFn: () => supervisorApi.sites() })
  const auditsQ = useQuery({ queryKey: ['eng', 'audits'], queryFn: () => audit.list() })

  useFocusEffect(
    useCallback(() => {
      void auditsQ.refetch()
    }, [auditsQ]),
  )

  const siteName = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of sitesQ.data?.items ?? []) m.set(s.id, s.name)
    return m
  }, [sitesQ.data])

  const audits = auditsQ.data?.items ?? []
  const toRun = audits.filter((a) => a.status !== 'completed')
  const submitted = audits.filter((a) => a.status === 'completed')

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: insets.top + SPACE.sm, paddingBottom: SPACE.xxl, gap: SPACE.lg }}
    >
      <SubHeader title="Site audit" sub="Inspections requested by owners" onBack={() => router.replace('/(contractor)/supervisor/more')} />

      {/* Intro */}
      <Card style={{ gap: SPACE.sm, backgroundColor: theme.colors.accentWarm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Ionicons name="clipboard" size={19} color={theme.colors.accentDeep} />
          <Title style={{ color: theme.colors.accentDeep, fontSize: 16 }}>Audits to run</Title>
        </View>
        <Body style={{ color: theme.colors.accentDeep }}>
          Walk the site and mark each check pass / observe / fail. The AI scores it and the findings
          come back to the owner.
        </Body>
      </Card>

      {auditsQ.isLoading ? (
        <LoadingBlock />
      ) : auditsQ.error ? (
        <ErrorBlock message="Could not load audits." retryLabel="Try again" onRetry={() => void auditsQ.refetch()} />
      ) : (
        <>
          {toRun.length > 0 ? (
            <>
              <SectionLabel>{`Requested · ${toRun.length}`}</SectionLabel>
              <View style={{ gap: SPACE.md }}>
                {toRun.map((a) => (
                  <RunCard
                    key={a.id}
                    a={a}
                    name={siteName.get(a.site_id) ?? 'Site'}
                    onPress={() => router.push(`/(contractor)/supervisor/audit/${a.id}`)}
                  />
                ))}
              </View>
            </>
          ) : (
            <Card variant="quiet">
              <Small muted>No audits to run right now. Owners request them here.</Small>
            </Card>
          )}

          {submitted.length > 0 ? (
            <>
              <SectionLabel>Submitted</SectionLabel>
              <View style={{ gap: SPACE.md }}>
                {submitted.map((a) => (
                  <SubmittedCard key={a.id} a={a} name={siteName.get(a.site_id) ?? 'Site'} />
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  )
}

function RunCard({ a, name, onPress }: { a: Audit; name: string; onPress: () => void }) {
  const { theme } = useTheme()
  const today = a.scheduled_for === 'today'
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card flag="warn" style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: theme.colors.accentWarm,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="clipboard-outline" size={19} color={theme.colors.warn} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Title style={{ fontSize: 15 }} numberOfLines={1}>{name}</Title>
          <Small muted>
            {a.status === 'in_progress' ? 'In progress' : `Requested ${formatWhen(a.requested_at)}`}
          </Small>
        </View>
        <StatusPill status="warn" size="sm" label={today ? 'Today' : 'Requested'} />
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMute} />
      </Card>
    </Pressable>
  )
}

function SubmittedCard({ a, name }: { a: Audit; name: string }) {
  const tone = scoreStatus(a.score)
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
      <ScoreDial value={a.score} size={52} tone={tone} label="score" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Title style={{ fontSize: 15 }} numberOfLines={1}>{name}</Title>
        <Small muted>Sent {formatWhen(a.conducted_at ?? a.requested_at)}</Small>
      </View>
      <StatusPill status={tone} size="sm" label={`${a.score}/100`} />
    </Card>
  )
}
