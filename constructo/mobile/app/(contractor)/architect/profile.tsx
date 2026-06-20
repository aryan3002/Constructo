/**
 * Profile — the designer's identity + projects + sign-out.
 */
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '../../../src/auth/AuthContext'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { supervisorApi } from '../../../src/api/supervisor'
import { Avatar, Button, Card, H2, ListRow, Small, StatusPill } from '../../../src/ui'
import { LoadingBlock, SubHeader } from './_components'

export default function DesignerProfile() {
  const { me, signOut } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const sitesQ = useQuery({ queryKey: ['architect', 'sites'], queryFn: () => supervisorApi.sites() })
  const sites = sitesQ.data?.items ?? []

  const onSignOut = async () => {
    await signOut()
    router.replace('/(auth)/login')
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: insets.top + SPACE.sm, paddingBottom: SPACE.xxl, gap: SPACE.lg }}
    >
      <SubHeader title="Profile" onBack={() => router.back()} />

      <Card style={{ gap: SPACE.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
          <Avatar name={me?.name ?? 'Anamika'} size={50} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <H2 numberOfLines={1}>{me?.name ?? 'Designer'}</H2>
            <Small muted numberOfLines={1}>
              Designer{me?.company_name ? ` · ${me.company_name}` : ''}
            </Small>
          </View>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.sm,
            paddingTop: SPACE.md,
            borderTopWidth: 1,
            borderTopColor: theme.colors.line,
          }}
        >
          <StatusPill status="ok" size="sm" label="Design / spec records" />
          <Small muted style={{ marginLeft: 'auto' }}>
            {sites.length} project{sites.length === 1 ? '' : 's'}
          </Small>
        </View>
      </Card>

      <Small muted style={{ letterSpacing: 1, marginTop: SPACE.xs }}>PROJECTS</Small>
      {sitesQ.isLoading ? (
        <LoadingBlock />
      ) : sites.length === 0 ? (
        <Card variant="quiet">
          <Small muted>No projects yet.</Small>
        </Card>
      ) : (
        <Card padded={false}>
          {sites.map((s) => (
            <ListRow key={s.id} icon="home" title={s.name} subtitle={s.location || s.type || 'Project'} />
          ))}
        </Card>
      )}

      <Button title="Sign out" variant="secondary" block onPress={() => void onSignOut()} />
    </ScrollView>
  )
}
