/**
 * Brief (Tab 1 — the command-center home), Calm-Cockpit prototype composition.
 *
 *   - Clay "TODAY FOR OWNERS · <date>" eyebrow + the big "<N> decisions need your
 *     call." headline (the 3-second answer).
 *   - Up to 3 decision cards from the pending approvals inbox — red-edged when
 *     overdue, amber otherwise — each with a proof chip + Approve / Review.
 *   - "Sites at a glance" horizontal strip (status + "N for you").
 *   - Material spec summary (pending / approved / on-hold) + a recent decision log.
 *
 * Everything is real: decisions = /approvals, sites = /dashboard/home,
 * specs = /specs across sites, log = recently-resolved approvals.
 */
import { useMemo } from 'react'
import { Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '../../../src/auth/AuthContext'
import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { AP, SPACE, type Status } from '../../../src/theme/tokens'
import { request } from '../../../src/api/client'
import { owner, type Decision, type SiteCard } from '../../../src/api/owner'
import { Body, Button, Card, Eyebrow, H1, Micro, Mono, Small, StatusPill, Title } from '../../../src/ui'
import { ErrorBlock, LoadingBlock, SectionLabel, formatWhen } from './_components'

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function shortDate(d: Date): string {
  return `${WD[d.getDay()]}, ${d.getDate()} ${MO[d.getMonth()]}`
}

const STR = {
  en: {
    eyebrow: 'TODAY FOR OWNERS', needCall: (n: number) => `${n} decision${n === 1 ? '' : 's'} need your call.`,
    calm: 'No owner action needed today.', calmSub: 'Everything waiting on you is cleared.',
    moreApprovals: (n: number) => `${n} more in Approvals`,
    sitesGlance: 'Sites at a glance', seeAll: 'See all', forYou: 'for you', clear: 'Clear',
    specs: 'Material spec schedule', open: 'Open', pending: 'Pending', approved: 'Cleared', hold: 'On hold',
    log: 'Recent decisions', fullLog: 'All approvals',
    approve: 'Approve', review: 'Review & decide', proof: (n: number) => `${n} proof`,
    overdue: 'Overdue', dueToday: 'Due today',
    error: 'We could not load your brief just now.', tryAgain: 'Try again',
  },
  hi: {
    eyebrow: 'आज मालिक के लिए', needCall: (n: number) => `${n} फ़ैसलों को आपकी मंज़ूरी चाहिए।`,
    calm: 'आज मालिक की कोई कार्रवाई नहीं।', calmSub: 'आप पर निर्भर सब कुछ साफ़ है।',
    moreApprovals: (n: number) => `${n} और मंज़ूरी में`,
    sitesGlance: 'साइट एक नज़र में', seeAll: 'सभी देखें', forYou: 'आपके लिए', clear: 'साफ़',
    specs: 'सामग्री स्पेक सूची', open: 'खोलें', pending: 'लंबित', approved: 'मंज़ूर', hold: 'रोकी',
    log: 'हाल के फ़ैसले', fullLog: 'सभी मंज़ूरी',
    approve: 'मंज़ूर', review: 'देखें व तय करें', proof: (n: number) => `${n} प्रमाण`,
    overdue: 'बकाया', dueToday: 'आज देय',
    error: 'अभी आपका ब्रीफ़ लोड नहीं हो सका।', tryAgain: 'फिर कोशिश करें',
  },
} as const

type Txt = (typeof STR)['en'] | (typeof STR)['hi']

const KIND_EYEBROW: Record<string, string> = {
  approval: 'Material spec', hold_payment: 'Payment hold', homeowner_question: 'Client question', generic: 'Decision',
}

interface Row {
  spec: { id: string; site_id: string; approval_status: 'pending' | 'approved' | 'rejected' }
}

export default function Brief() {
  const { lang } = useT()
  const { me } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()
  const qc = useQueryClient()
  const t = STR[lang]

  const pendingQ = useQuery({ queryKey: ['owner', 'approvals', 'pending'], queryFn: () => owner.approvals('pending') })
  const homeQ = useQuery({ queryKey: ['owner', 'home'], queryFn: () => owner.home() })
  const logQ = useQuery({ queryKey: ['owner', 'approvals', 'resolved'], queryFn: () => owner.approvals('resolved') })
  const specsQ = useQuery({
    queryKey: ['owner', 'specs', 'summary'],
    queryFn: async () => {
      const sites = (await owner.sites()).items
      const per = await Promise.all(
        sites.map((s) => request<Row['spec'][]>(`/api/v1/specs?site_id=${s.id}`).catch(() => [])),
      )
      return per.flat()
    },
  })

  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      action === 'approve' ? owner.approve(id) : owner.reject(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['owner', 'approvals', 'pending'] })
      void qc.invalidateQueries({ queryKey: ['owner', 'approvals', 'resolved'] })
      void qc.invalidateQueries({ queryKey: ['owner', 'home'] })
    },
  })

  const now = Date.now()
  const decisions = pendingQ.data?.items ?? []
  const isOverdue = (d: Decision) => !!d.sla_due_at && new Date(d.sla_due_at).getTime() < now
  const ranked = useMemo(
    () => [...decisions].sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a))),
    [decisions],
  )
  const top = ranked.slice(0, 3)
  const overflow = Math.max(0, ranked.length - 3)

  const specCounts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 }
    for (const s of specsQ.data ?? []) c[s.approval_status] += 1
    return c
  }, [specsQ.data])

  const loading = pendingQ.isLoading || homeQ.isLoading
  if (loading) return <Wrap><LoadingBlock /></Wrap>
  if (pendingQ.error || homeQ.error) {
    return <Wrap><ErrorBlock message={t.error} retryLabel={t.tryAgain} onRetry={() => { void pendingQ.refetch(); void homeQ.refetch() }} /></Wrap>
  }

  const refreshing = pendingQ.isRefetching || homeQ.isRefetching
  const greetName = me?.name ?? 'Owner'

  return (
    <Wrap onRefresh={() => qc.invalidateQueries({ queryKey: ['owner'] })} refreshing={refreshing}>
      {/* Top bar — scope context + search + more + avatar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.text, borderRadius: theme.radii.pill, paddingVertical: 7, paddingHorizontal: 12 }}>
          <Ionicons name="layers-outline" size={14} color={theme.colors.onAccent} />
          <Micro style={{ color: theme.colors.onAccent }}>All sites</Micro>
        </View>
        <View style={{ flex: 1 }} />
        <HeaderIcon icon="search" onPress={() => router.push('/(contractor)/owner/search')} />
        <HeaderIcon icon="grid-outline" onPress={() => router.push('/(contractor)/owner/more')} />
        <Pressable
          accessibilityLabel="Account" onPress={() => router.push('/(contractor)/owner/more')}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.accentWarm, alignItems: 'center', justifyContent: 'center' }}
        >
          <Micro style={{ color: theme.colors.accentDeep, fontWeight: '700' }}>{greetName.slice(0, 2).toUpperCase()}</Micro>
        </Pressable>
      </View>

      {/* Hero */}
      <View style={{ gap: SPACE.xs, marginTop: SPACE.xs }}>
        <Eyebrow style={{ color: AP.clay }}>{`${t.eyebrow} · ${shortDate(new Date())}`}</Eyebrow>
        <H1 style={{ fontSize: 30, lineHeight: 38 }}>{ranked.length === 0 ? t.calm : t.needCall(ranked.length)}</H1>
      </View>

      {ranked.length === 0 ? (
        <Card variant="quiet">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <Ionicons name="checkmark-circle" size={20} color={theme.colors.ok} />
            <Small muted style={{ flex: 1 }}>{t.calmSub}</Small>
          </View>
        </Card>
      ) : (
        <View style={{ gap: SPACE.md }}>
          {top.map((d) => (
            <OwnerDecisionCard
              key={d.id}
              d={d}
              overdue={isOverdue(d)}
              t={t}
              pending={decide.isPending}
              onApprove={() => decide.mutate({ id: d.id, action: 'approve' })}
              onReview={() => router.push('/(contractor)/owner/approvals')}
            />
          ))}
          {overflow > 0 ? (
            <Button title={t.moreApprovals(overflow)} variant="ghost" onPress={() => router.push('/(contractor)/owner/approvals')} />
          ) : null}
        </View>
      )}

      {/* Sites at a glance */}
      <SectionLabel trailing={<Small color={theme.colors.accentDeep} onPress={() => router.push('/(contractor)/owner/sites')}>{t.seeAll}</Small>}>
        {t.sitesGlance}
      </SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.sm, paddingRight: SPACE.lg }}>
        {(homeQ.data?.sites ?? []).map((s) => (
          <SiteGlance key={s.site_id} s={s} t={t} onPress={() => router.push(`/(contractor)/owner/site/${s.site_id}`)} />
        ))}
      </ScrollView>

      {/* Spec summary */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md }}>
          <Ionicons name="color-palette-outline" size={18} color={theme.colors.text} />
          <Title style={{ fontSize: 15, flex: 1 }}>{t.specs}</Title>
          <Small color={theme.colors.accentDeep} onPress={() => router.push('/(contractor)/owner/specs')}>{t.open}</Small>
        </View>
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          <SpecTile label={t.pending} value={specCounts.pending} tone="warn" />
          <SpecTile label={t.hold} value={specCounts.rejected} tone="risk" />
          <SpecTile label={t.approved} value={specCounts.approved} tone="ok" />
        </View>
      </Card>

      {/* Recent decision log */}
      <SectionLabel trailing={<Small color={theme.colors.accentDeep} onPress={() => router.push('/(contractor)/owner/approvals')}>{t.fullLog}</Small>}>
        {t.log}
      </SectionLabel>
      <Card padded={false}>
        {(logQ.data?.items ?? []).slice(0, 4).map((d, i, arr) => (
          <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.lg, borderTopWidth: i ? 1 : 0, borderTopColor: theme.colors.line }}>
            <Ionicons
              name={d.state === 'resolved' ? 'checkmark-circle' : 'close-circle'}
              size={18}
              color={d.state === 'resolved' ? theme.colors.ok : theme.colors.risk}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Small numberOfLines={1}>{d.title}</Small>
              <Micro muted>{formatWhen(d.resolved_at ?? d.updated_at)}</Micro>
            </View>
          </View>
        ))}
        {(logQ.data?.items ?? []).length === 0 ? (
          <View style={{ padding: SPACE.lg }}><Small muted>No decisions logged yet.</Small></View>
        ) : null}
      </Card>
    </Wrap>
  )
}

function OwnerDecisionCard({
  d, overdue, t, pending, onApprove, onReview,
}: {
  d: Decision
  overdue: boolean
  t: Txt
  pending: boolean
  onApprove: () => void
  onReview: () => void
}) {
  const { theme } = useTheme()
  const tone: Status = overdue ? 'risk' : 'warn'
  const dueToday = !overdue && !!d.sla_due_at && new Date(d.sla_due_at).toDateString() === new Date().toDateString()
  const proofN = d.evidence_event_ids?.length ?? 0
  return (
    <Card flag={tone}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <StatusPill status={tone} size="sm" label={KIND_EYEBROW[d.kind] ?? 'Decision'} uppercase />
        {overdue ? (
          <Micro style={{ color: theme.colors.risk, marginLeft: 'auto' }}>{t.overdue}</Micro>
        ) : dueToday ? (
          <Micro style={{ color: theme.colors.warn, marginLeft: 'auto' }}>{t.dueToday}</Micro>
        ) : null}
      </View>
      <Title style={{ marginTop: SPACE.sm }}>{d.title}</Title>
      {d.detail ? <Body muted style={{ marginTop: 2 }}>{d.detail}</Body> : null}
      {proofN > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACE.sm }}>
          <Ionicons name="image-outline" size={14} color={theme.colors.textMute} />
          <Micro muted>{t.proof(proofN)}</Micro>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md }}>
        <Button title={t.approve} size="md" disabled={pending} onPress={onApprove} style={{ flex: 1 }} />
        <Button title={t.review} variant="secondary" size="md" onPress={onReview} style={{ flex: 1 }} />
      </View>
    </Card>
  )
}

function SiteGlance({ s, t, onPress }: { s: SiteCard; t: Txt; onPress: () => void }) {
  const { theme } = useTheme()
  const forYou = (s.top_risks?.length ?? 0) + (s.risk_overflow ?? 0)
  const st: Status = s.status === 'ok' || s.status === 'warn' || s.status === 'risk' ? s.status : 'info'
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ width: 168 }}>
      <Card style={{ gap: 6 }}>
        <Title style={{ fontSize: 14.5 }} numberOfLines={1}>{s.name}</Title>
        <StatusPill status={st} size="sm" />
        {forYou > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="flash" size={12} color={theme.colors.warn} />
            <Micro style={{ color: theme.colors.warn }}>{`${forYou} ${t.forYou}`}</Micro>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="checkmark" size={12} color={theme.colors.ok} />
            <Micro style={{ color: theme.colors.ok }}>{t.clear}</Micro>
          </View>
        )}
      </Card>
    </Pressable>
  )
}

function SpecTile({ label, value, tone }: { label: string; value: number; tone: Status }) {
  const { theme } = useTheme()
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.paper, borderRadius: theme.radii.chip, padding: SPACE.md, gap: 2 }}>
      <Mono style={{ fontSize: 18, color: theme.colors[tone] }}>{value}</Mono>
      <Micro muted>{label}</Micro>
    </View>
  )
}

function HeaderIcon({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const { theme } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.line, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name={icon} size={18} color={theme.colors.text} />
    </Pressable>
  )
}

function Wrap({ children, onRefresh, refreshing }: { children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean }) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: insets.top + SPACE.sm, paddingBottom: SPACE.xxl, gap: SPACE.lg }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} /> : undefined}
    >
      {children}
    </ScrollView>
  )
}
