/**
 * Profile — the engineer's identity, sync state, assigned sites, sign-out.
 * Sync is automatic (NetInfo + the offline outbox) so we SHOW the live sync
 * status rather than a fake toggle. Assigned sites are read server-side scoped.
 */
import { ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'

import { useAuth } from '../../../src/auth/AuthContext'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { useQuery } from '@tanstack/react-query'
import { supervisorApi } from '../../../src/api/supervisor'
import { Avatar, Body, Button, Card, H2, ListRow, Small, StatusPill, SyncStatus, Title } from '../../../src/ui'
import { LoadingBlock, SubHeader } from './_eng.components'

export default function EngProfile() {
  const { me, signOut } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()

  const sitesQ = useQuery({ queryKey: ['eng', 'sites'], queryFn: () => supervisorApi.sites() })
  const sites = sitesQ.data?.items ?? []

  const onSignOut = async () => {
    await signOut()
    router.replace('/(auth)/login')
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.lg }}
    >
      <SubHeader title="Profile" onBack={() => router.back()} />

      {/* Identity */}
      <Card style={{ gap: SPACE.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
          <Avatar name={me?.name ?? 'Lokesh'} size={50} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <H2 numberOfLines={1}>{me?.name ?? 'Site Engineer'}</H2>
            <Small muted numberOfLines={1}>
              Site Engineer{me?.company_name ? ` · ${me.company_name}` : ''}
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
          <StatusPill status="ok" size="sm" label="Assigned sites only" />
          <Small muted style={{ marginLeft: 'auto' }}>
            {sites.length} site{sites.length === 1 ? '' : 's'}
          </Small>
        </View>
      </Card>

      {/* Live sync state (replaces the prototype's mock toggle). */}
      <Card padded={false} style={{ overflow: 'hidden' }}>
        <SyncStatus />
      </Card>

      {/* Assigned sites */}
      <Small muted style={{ letterSpacing: 1, marginTop: SPACE.xs }}>
        ASSIGNED SITES
      </Small>
      {sitesQ.isLoading ? (
        <LoadingBlock />
      ) : sites.length === 0 ? (
        <Card variant="quiet">
          <Small muted>No sites assigned yet — ask your PM.</Small>
        </Card>
      ) : (
        <Card padded={false}>
          {sites.map((s) => (
            <ListRow
              key={s.id}
              icon="home"
              title={s.name}
              subtitle={s.location || s.type || 'Site'}
            />
          ))}
        </Card>
      )}

      <Button title="Sign out" variant="secondary" block onPress={() => void onSignOut()} />
    </ScrollView>
  )
}
