/**
 * Site changes — conditions reported from site by the engineer, routed to the
 * designer to review / link to a revision / resolve. Wired to /api/v1/site-changes.
 */
import { useCallback, useMemo } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { siteChangesApi, type SiteChange } from '../../../src/api/siteChanges'
import { supervisorApi } from '../../../src/api/supervisor'
import { Card, Small, StatusPill, Title } from '../../../src/ui'
import { CHANGE_META, ErrorBlock, LoadingBlock, SubHeader, timeAgo } from './_components'

export default function SiteChanges() {
  const { theme } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const sitesQ = useQuery({ queryKey: ['architect', 'sites'], queryFn: () => supervisorApi.sites() })
  const changesQ = useQuery({ queryKey: ['architect', 'changes'], queryFn: () => siteChangesApi.list() })

  useFocusEffect(
    useCallback(() => {
      void changesQ.refetch()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  )

  const siteName = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of sitesQ.data?.items ?? []) m.set(s.id, s.name)
    return m
  }, [sitesQ.data])

  const rows = changesQ.data ?? []

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: insets.top + SPACE.sm, paddingBottom: SPACE.xxl, gap: SPACE.md }}
    >
      <SubHeader title="Site changes" sub="Conditions reported from site" onBack={() => router.back()} />

      {changesQ.isLoading ? (
        <LoadingBlock />
      ) : changesQ.error ? (
        <ErrorBlock message="Could not load site changes." retryLabel="Try again" onRetry={() => void changesQ.refetch()} />
      ) : rows.length === 0 ? (
        <Card variant="quiet">
          <Small muted>No site changes reported. They appear here when the field flags one.</Small>
        </Card>
      ) : (
        rows.map((c) => (
          <ChangeRow
            key={c.id}
            c={c}
            site={siteName.get(c.site_id) ?? 'Site'}
            onPress={() => router.push(`/(contractor)/architect/change/${c.id}`)}
          />
        ))
      )}
    </ScrollView>
  )
}

function ChangeRow({ c, site, onPress }: { c: SiteChange; site: string; onPress: () => void }) {
  const { theme } = useTheme()
  const meta = CHANGE_META[c.status]
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card flag={c.status === 'new' ? 'warn' : undefined} style={{ gap: SPACE.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="warning-outline" size={14} color={theme.colors.warn} />
          <Small style={{ color: theme.colors.warn, fontSize: 12, letterSpacing: 0.5 }}>SITE CHANGE</Small>
          <Small muted style={{ marginLeft: 'auto' }}>{timeAgo(c.created_at)}</Small>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Title style={{ fontSize: 15, flex: 1 }} numberOfLines={2}>{c.title}</Title>
          <StatusPill status={meta.status} size="sm" label={meta.label} />
        </View>
        <Small muted>{site}{c.room ? ` · ${c.room}` : ''}</Small>
      </Card>
    </Pressable>
  )
}
