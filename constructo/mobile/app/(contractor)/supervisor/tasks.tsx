/**
 * Tasks — "Asks for you". The clarifications owners + the designer point at the
 * engineer: confirm a figure, read a code off a sample, upload a test result.
 * Reads the asks-pointed-at-me feed (GET /api/v1/approvals?for=me) and lets him
 * filter Open / Answered / All; tapping one opens the reply screen.
 */
import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { supervisorApi, type Approval } from '../../../src/api/supervisor'
import { Body, BodyStrong, Card, EmptyState, SegmentedTabs, Small, StatusPill } from '../../../src/ui'
import { ErrorBlock, LoadingBlock, SubHeader, formatWhen } from './_eng.components'

type Filter = 'open' | 'answered' | 'all'

export default function EngTasks() {
  const { theme } = useTheme()
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('open')

  const sitesQ = useQuery({ queryKey: ['eng', 'sites'], queryFn: () => supervisorApi.sites() })
  const asksQ = useQuery({ queryKey: ['eng', 'asks'], queryFn: () => supervisorApi.asksForMe() })

  // Asks land in this feed; re-pull when the screen regains focus so a just-sent
  // reply drops off "Open" once the backend has settled it.
  useFocusEffect(
    useCallback(() => {
      void asksQ.refetch()
    }, [asksQ]),
  )

  const siteName = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of sitesQ.data?.items ?? []) m.set(s.id, s.name)
    return m
  }, [sitesQ.data])

  const all = asksQ.data?.items ?? []
  const open = all.filter((a) => a.state === 'pending')
  const answered = all.filter((a) => a.state !== 'pending')
  const rows = filter === 'open' ? open : filter === 'answered' ? answered : all

  const tabs = [
    { key: 'open', label: `Open${open.length ? ` · ${open.length}` : ''}` },
    { key: 'answered', label: 'Answered' },
    { key: 'all', label: 'All' },
  ]

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.lg }}
    >
      <SubHeader title="Asks for you" sub="Clarifications from owners & designer" />
      <SegmentedTabs tabs={tabs} active={filter} onChange={(k) => setFilter(k as Filter)} />

      {asksQ.isLoading ? (
        <LoadingBlock />
      ) : asksQ.error ? (
        <ErrorBlock message="Could not load your asks." retryLabel="Try again" onRetry={() => void asksQ.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          variant="clear"
          title="All caught up"
          body="No asks in this filter — no one is waiting on you."
        />
      ) : (
        <View style={{ gap: SPACE.md }}>
          {rows.map((a) => (
            <AskCard
              key={a.id}
              a={a}
              site={siteName.get(a.site_id ?? '') ?? ''}
              onPress={() => router.push(`/(contractor)/supervisor/task/${a.id}`)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  )
}

function AskCard({ a, site, onPress }: { a: Approval; site: string; onPress: () => void }) {
  const { theme } = useTheme()
  const answered = a.state !== 'pending'
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card flag={answered ? undefined : 'warn'} style={{ gap: SPACE.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          {answered ? (
            <StatusPill status="ok" size="sm" label="Answered" />
          ) : (
            <StatusPill status="warn" size="sm" label="Reply" />
          )}
          <Small muted style={{ marginLeft: 'auto' }}>
            {formatWhen(a.created_at)}
          </Small>
        </View>
        <BodyStrong>{a.title}</BodyStrong>
        {a.detail ? (
          <Body muted numberOfLines={2}>
            {a.detail}
          </Body>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="business-outline" size={13} color={theme.colors.textMute} />
          <Small muted>{site || 'Site'}</Small>
        </View>
      </Card>
    </Pressable>
  )
}
