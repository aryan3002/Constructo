/**
 * dp — the full design brief (designer view). For each area, the AI-drafted
 * theme directions (palette + materials + rationale) with the architect's commit
 * actions (approve / adjust / reject). Wired to /api/v1/design theme decisions.
 */
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE, type Status } from '../../../../src/theme/tokens'
import { design, type Area, type Theme, type ThemeAction } from '../../../../src/api/ownerDesign'
import { Body, Button, Card, Eyebrow, Mono, Small, StatusPill, Title } from '../../../../src/ui'
import { ErrorBlock, LoadingBlock, SectionLabel, SubHeader } from '../_components'

const cap = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

const THEME_TONE: Record<string, Status> = {
  suggested: 'info', approved: 'ok', adjusted: 'warn', rejected: 'risk',
}

export default function DesignerBriefDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ['architect', 'design', 'brief', id],
    queryFn: async () => {
      const profile = await design.profile(id)
      const themesByArea = await Promise.all(
        profile.areas.map((a) => design.themes(id, a.id).catch(() => [] as Theme[])),
      )
      return profile.areas.map((area, i) => ({ area, themes: themesByArea[i] }))
    },
    enabled: !!id,
  })

  const decide = useMutation({
    mutationFn: ({ themeId, action }: { themeId: string; action: ThemeAction }) =>
      design.decideTheme(themeId, action),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['architect', 'design', 'brief', id] }),
  })

  if (q.isLoading) return <Pad><LoadingBlock /></Pad>
  if (q.error || !q.data) {
    return <Pad><ErrorBlock message="We could not load the design brief." retryLabel="Try again" onRetry={() => void q.refetch()} /></Pad>
  }

  const groups = q.data
  const totalThemes = groups.reduce((n, g) => n + g.themes.length, 0)

  return (
    <Pad>
      <SubHeader title="Design brief" sub="AI-drafted directions · you commit" onBack={() => router.back()} />

      {totalThemes === 0 ? (
        <Card variant="quiet">
          <Small muted>No theme directions drafted yet. They appear once enough inspiration is ranked.</Small>
        </Card>
      ) : (
        groups.map(({ area, themes }) => (
          <AreaBlock key={area.id} area={area} themes={themes} pending={decide.isPending} onDecide={(themeId, action) => decide.mutate({ themeId, action })} />
        ))
      )}
    </Pad>
  )
}

function AreaBlock({ area, themes, pending, onDecide }: { area: Area; themes: Theme[]; pending: boolean; onDecide: (themeId: string, action: ThemeAction) => void }) {
  if (themes.length === 0) return null
  return (
    <View style={{ gap: SPACE.md }}>
      <SectionLabel>{cap(area.area_key)}</SectionLabel>
      {themes.map((t) => (
        <ThemeCard key={t.id} t={t} pending={pending} onDecide={onDecide} />
      ))}
    </View>
  )
}

function ThemeCard({ t, pending, onDecide }: { t: Theme; pending: boolean; onDecide: (themeId: string, action: ThemeAction) => void }) {
  const { theme } = useTheme()
  const tone = THEME_TONE[t.status] ?? 'info'
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <Title style={{ fontSize: 16, flex: 1 }}>{t.name}</Title>
        <StatusPill status={tone} size="sm" label={cap(t.status)} />
      </View>
      {typeof t.confidence === 'number' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <Ionicons name="sparkles" size={12} color={theme.colors.accentDeep} />
          <Mono style={{ fontSize: 12, color: theme.colors.textMute }}>{Math.round(t.confidence * 100)}% confidence</Mono>
        </View>
      ) : null}

      {t.palette?.length ? (
        <>
          <Eyebrow style={{ marginTop: SPACE.md }}>PALETTE</Eyebrow>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs, marginTop: 6 }}>
            {t.palette.map((p, i) => <PaletteChip key={i} label={p} />)}
          </View>
        </>
      ) : null}

      {t.materials?.length ? (
        <>
          <Eyebrow style={{ marginTop: SPACE.md }}>MATERIALS</Eyebrow>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs, marginTop: 6 }}>
            {t.materials.map((m, i) => <PaletteChip key={i} label={m} />)}
          </View>
        </>
      ) : null}

      {t.rationale ? <Body muted style={{ marginTop: SPACE.md }}>{t.rationale}</Body> : null}

      {t.status === 'suggested' ? (
        <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md }}>
          <Button title="Approve" size="md" disabled={pending} onPress={() => onDecide(t.id, 'approve')} style={{ flex: 1 }} />
          <Button title="Adjust" variant="secondary" size="md" disabled={pending} onPress={() => onDecide(t.id, 'adjust')} style={{ flex: 1 }} />
          <Button title="Reject" variant="ghost" size="md" disabled={pending} onPress={() => onDecide(t.id, 'reject')} style={{ flex: 1 }} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACE.md }}>
          <Ionicons name="checkmark-circle" size={15} color={theme.colors[tone]} />
          <Small style={{ color: theme.colors[tone] }}>{cap(t.status)}</Small>
        </View>
      )}
    </Card>
  )
}

function PaletteChip({ label }: { label: string }) {
  const { theme } = useTheme()
  return (
    <View style={{ paddingVertical: 5, paddingHorizontal: 11, borderRadius: theme.radii.pill, backgroundColor: theme.colors.paper, borderWidth: 1, borderColor: theme.colors.line }}>
      <Small style={{ fontSize: 12, textTransform: 'capitalize' }}>{label}</Small>
    </View>
  )
}

function Pad({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: insets.top + SPACE.sm, paddingBottom: SPACE.xxl, gap: SPACE.lg }}
    >
      {children}
    </ScrollView>
  )
}
