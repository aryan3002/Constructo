/**
 * More — the engineer's hub. Audit + Drawings as feature cards (the two big
 * off-tab tools), then an Account group (profile / assigned sites / asks).
 */
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '../../../src/auth/AuthContext'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { audit } from '../../../src/api/ownerAudit'
import { supervisorApi } from '../../../src/api/supervisor'
import { Card, ListRow, Small } from '../../../src/ui'
import { FeatureCard, SubHeader } from './_eng.components'

export default function EngMore() {
  const { me } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const sitesQ = useQuery({ queryKey: ['eng', 'sites'], queryFn: () => supervisorApi.sites() })
  const requestedQ = useQuery({
    queryKey: ['eng', 'audits', 'requested'],
    queryFn: () => audit.list(undefined, 'requested'),
  })
  const toRun = requestedQ.data?.items.length ?? 0
  const siteCount = sitesQ.data?.items.length ?? 0

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: insets.top + SPACE.sm, paddingBottom: SPACE.xxl, gap: SPACE.lg }}
    >
      <SubHeader title="More" />

      {/* Feature cards */}
      <View style={{ flexDirection: 'row', gap: SPACE.md }}>
        <FeatureCard
          icon="clipboard-outline"
          iconTone="ok"
          title="Site audit"
          sub="Run requested inspections"
          pill={toRun > 0 ? { status: 'warn', label: `${toRun} to run` } : undefined}
          onPress={() => router.push('/(contractor)/supervisor/audit')}
        />
        <FeatureCard
          icon="documents-outline"
          iconTone="info"
          title="Drawings"
          sub="Latest released revisions"
          pill={{ status: 'ok', label: 'Pull latest' }}
          onPress={() => router.push('/(contractor)/supervisor/drawings')}
        />
      </View>

      {/* Account */}
      <Small muted style={{ letterSpacing: 1, marginTop: SPACE.xs }}>
        ACCOUNT
      </Small>
      <Card padded={false}>
        <ListRow
          icon="user"
          title="Profile"
          subtitle={me?.name ?? 'Site Engineer'}
          onPress={() => router.push('/(contractor)/supervisor/profile')}
        />
        <ListRow
          icon="home"
          title="My assigned sites"
          subtitle={`${siteCount} site${siteCount === 1 ? '' : 's'}`}
          onPress={() => router.push('/(contractor)/supervisor/profile')}
        />
        <ListRow
          icon="list"
          title="Asks for you"
          subtitle="Clarifications to reply"
          onPress={() => router.push('/(contractor)/supervisor/tasks')}
        />
      </Card>
    </ScrollView>
  )
}
