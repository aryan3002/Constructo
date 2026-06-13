/**
 * Designer Home (the studio). The 3-second answer for the architect: how many
 * selections need a call, how many are cleared. Then the selections waiting on a
 * decision, and a shortcut into the homeowner brief to build new selections from.
 *
 * Wired to /api/v1/specs (the real spec states: pending / approved / rejected).
 * The prototype's richer You→Owner→Client routing has no backend, so we present
 * the real states honestly rather than fabricate intermediate steps.
 */
import { useMemo } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '../../../src/auth/AuthContext'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { specsApi, type Spec } from '../../../src/api/specs'
import { supervisorApi } from '../../../src/api/supervisor'
import { Body, Card, Display, Eyebrow, Small, StatusPill, Title } from '../../../src/ui'
import { ErrorBlock, LoadingBlock, StatTile, SectionLabel } from './_components'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function DesignerHome() {
  const { me } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()

  const q = useQuery({
    queryKey: ['architect', 'specs'],
    queryFn: async () => {
      const sites = (await supervisorApi.sites()).items
      const perSite = await Promise.all(
        sites.map(async (s) => {
          const specs = await specsApi.list(s.id)
          return specs.map((sp) => ({ spec: sp, siteName: s.name }))
        }),
      )
      return perSite.flat()
    },
  })

  useFocusEffect(
    useCallback(() => {
      void q.refetch()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  )

  const rows = q.data ?? []
  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 }
    for (const r of rows) c[r.spec.approval_status] += 1
    return c
  }, [rows])
  const needsCall = rows.filter((r) => r.spec.approval_status === 'pending')

  const now = new Date()
  const firstName = me?.name?.split(' ')[0] ?? 'there'

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.lg }}
    >
      <View style={{ gap: SPACE.xs }}>
        <Eyebrow>{`STUDIO · ${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`}</Eyebrow>
        <Display style={{ fontSize: 30, lineHeight: 38 }}>{`Good day, ${firstName}.`}</Display>
        <Body muted>
          {counts.pending} selection{counts.pending === 1 ? '' : 's'} need your call · {counts.approved} cleared.
        </Body>
      </View>

      <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
        <StatTile value={counts.pending} label="Needs call" tone={counts.pending > 0 ? 'warn' : 'quiet'} />
        <StatTile value={counts.rejected} label="On hold" tone={counts.rejected > 0 ? 'risk' : 'quiet'} />
        <StatTile value={counts.approved} label="Approved" tone="ok" />
      </View>

      {/* Brief shortcut */}
      <Pressable accessibilityRole="button" onPress={() => router.push('/(contractor)/architect/brief')}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, backgroundColor: theme.colors.secondaryContainer }}>
          <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="sparkles" size={18} color={theme.colors.secondary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Title style={{ fontSize: 14.5, color: theme.colors.secondary }}>Work from the homeowner brief</Title>
            <Small muted>Taste, themes &amp; room directions</Small>
          </View>
          <Ionicons name="arrow-forward" size={18} color={theme.colors.secondary} />
        </Card>
      </Pressable>

      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error ? (
        <ErrorBlock message="We could not load your studio." retryLabel="Try again" onRetry={() => void q.refetch()} />
      ) : (
        <>
          <SectionLabel trailing={<Small style={{ color: theme.colors.accentDeep }} onPress={() => router.push('/(contractor)/architect/selections')}>All selections</Small>}>
            Needs your call
          </SectionLabel>
          {needsCall.length === 0 ? (
            <Card variant="quiet">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                <Ionicons name="checkmark-circle" size={18} color={theme.colors.ok} />
                <Small muted>Nothing waiting on a decision — all selections are routed.</Small>
              </View>
            </Card>
          ) : (
            <View style={{ gap: SPACE.sm }}>
              {needsCall.slice(0, 5).map(({ spec, siteName }) => (
                <NeedsCallRow
                  key={spec.id}
                  spec={spec}
                  siteName={siteName}
                  onPress={() => router.push(`/(contractor)/architect/selection/${spec.id}`)}
                />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  )
}

function NeedsCallRow({ spec, siteName, onPress }: { spec: Spec; siteName: string; onPress: () => void }) {
  const { theme } = useTheme()
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card flag="warn" style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
        <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: theme.colors.secondaryContainer, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="color-palette-outline" size={18} color={theme.colors.secondary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Title style={{ fontSize: 14.5 }} numberOfLines={1}>{spec.label}</Title>
          <Small muted numberOfLines={1}>{siteName}</Small>
        </View>
        <StatusPill status="warn" size="sm" label="Decide" />
      </Card>
    </Pressable>
  )
}
