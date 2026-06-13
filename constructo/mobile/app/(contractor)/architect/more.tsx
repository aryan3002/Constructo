/**
 * More — the designer's hub (Calm Cockpit). Studio shortcuts (briefs,
 * selections) + Account (profile).
 */
import { ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '../../../src/auth/AuthContext'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { siteChangesApi } from '../../../src/api/siteChanges'
import { Card, ListRow, Small, StatusPill } from '../../../src/ui'
import { SubHeader } from './_components'

export default function DesignerMore() {
  const { me } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()

  const newChangesQ = useQuery({
    queryKey: ['architect', 'changes', 'new'],
    queryFn: () => siteChangesApi.list({ status: 'new' }),
  })
  const newChanges = newChangesQ.data?.length ?? 0

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.lg }}
    >
      <SubHeader title="More" />

      <Small muted style={{ letterSpacing: 1 }}>STUDIO</Small>
      <Card padded={false}>
        <ListRow
          icon="feather"
          title="Homeowner briefs"
          subtitle="Taste, themes & room directions"
          onPress={() => router.push('/(contractor)/architect/brief')}
        />
        <ListRow
          icon="grid"
          title="All selections"
          subtitle="Materials & finishes"
          onPress={() => router.push('/(contractor)/architect/selections')}
        />
        <ListRow
          icon="alert-triangle"
          title="Site changes"
          subtitle="Conditions reported from the field"
          right={newChanges > 0 ? <StatusPill status="warn" size="sm" label={`${newChanges} new`} /> : undefined}
          onPress={() => router.push('/(contractor)/architect/changes')}
        />
      </Card>

      <Small muted style={{ letterSpacing: 1, marginTop: SPACE.xs }}>ACCOUNT</Small>
      <Card padded={false}>
        <ListRow
          icon="user"
          title="Profile"
          subtitle={me?.name ?? 'Designer'}
          onPress={() => router.push('/(contractor)/architect/profile')}
        />
      </Card>
    </ScrollView>
  )
}
