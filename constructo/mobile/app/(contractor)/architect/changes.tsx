/**
 * Site changes — conditions reported from site by the engineer, routed to the
 * designer to review / link to a revision / resolve. Wired to /api/v1/site-changes.
 */
import { useCallback, useMemo } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { siteChangesApi } from '../../../src/api/siteChanges'
import { supervisorApi } from '../../../src/api/supervisor'
import { Card, Small } from '../../../src/ui'
import { ErrorBlock, LoadingBlock, SiteChangeCard, SubHeader } from './_components'

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
      <SubHeader title="Site changes" sub="Conditions reported from site" onBack={() => router.replace('/(contractor)/architect/more')} />

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
          <SiteChangeCard
            key={c.id}
            change={c}
            site={siteName.get(c.site_id) ?? 'Site'}
            onPress={() => router.push(`/(contractor)/architect/change/${c.id}`)}
          />
        ))
      )}
    </ScrollView>
  )
}
