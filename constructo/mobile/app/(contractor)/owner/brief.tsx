/**
 * Brief (Tab 1 — THE HERO). The 7am cross-site command screen.
 *
 * One screen, two altitudes (Owner.md §6.1):
 *   - Decide:   ≤3 highest-severity risks across all sites, each an EvidenceCard
 *               (proof on tap) with inline Approve / Hold / Assign chips that
 *               create a logged decision (optimistic collapse + refetch).
 *   - Scan:     a 2×2 Cash / Labor / Material / Progress pulse derived from the
 *               brief counts (calm, hide-empty).
 *   - Roll-up:  a worst-first per-site list.
 * Empty/first-run = a calm "connect a group" card. If today's brief is missing,
 * we POST /briefs/run as a fallback before showing empty.
 */
import { useMemo, useState } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '../../../src/auth/AuthContext'
import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, severityToStatus, type Status } from '../../../src/theme/tokens'
import { owner, type BriefSite, type OwnerBrief, type Risk } from '../../../src/api/owner'
import { Body, BodyStrong, Button, Card, Display, Mono, Small } from '../../../src/ui'
import {
  BriefCommandCard,
  ErrorBlock,
  LoadingBlock,
  PulseCard,
  SectionLabel,
  SiteRollupRow,
  formatWhen,
} from './_components'

const STR = {
  en: {
    greeting: 'Good morning',
    needToday: (n: number, s: number) => `${n} thing${n === 1 ? '' : 's'} need you today across ${s} site${s === 1 ? '' : 's'}.`,
    calmTitle: 'All sites are calm.',
    calmBody: 'Nothing needs you today. Numbers below are still confirmable.',
    moreInApprovals: (n: number) => `+${n} more in Approvals`,
    sites: 'Sites',
    seeAll: 'See all',
    pulse: 'Yesterday, at a glance',
    cash: 'Cash', labor: 'Labor', material: 'Material', progress: 'Progress',
    approve: 'Approve', hold: 'Hold', assign: 'Assign → PM',
    proof: 'Proof',
    heldBy: 'Held · team notified',
    approvedBy: 'Approved · logged',
    assignedBy: 'Assigned → PM · logged',
    risks: (n: number) => `${n} risk${n === 1 ? '' : 's'}`,
    ok: 'ok',
    connectTitle: 'Your brief lights up once your sites start talking.',
    connectBody: 'Connect a WhatsApp group to begin — every update flows here as one trustworthy source of truth.',
    connect: 'Connect a group',
    errorLine: 'We could not load your brief just now.',
    tryAgain: 'Try again',
    deliveries: 'deliveries', issues: 'issues', present: 'present',
  },
  hi: {
    greeting: 'सुप्रभात',
    needToday: (n: number, s: number) => `आज ${s} साइट पर ${n} चीज़ों को आपकी ज़रूरत है।`,
    calmTitle: 'सभी साइट शांत हैं।',
    calmBody: 'आज कुछ भी आपकी ज़रूरत नहीं। नीचे के आँकड़े फिर भी जाँचे जा सकते हैं।',
    moreInApprovals: (n: number) => `+${n} और मंज़ूरी में`,
    sites: 'साइट',
    seeAll: 'सभी देखें',
    pulse: 'कल, एक नज़र में',
    cash: 'नक़दी', labor: 'मज़दूर', material: 'सामग्री', progress: 'प्रगति',
    approve: 'मंज़ूर', hold: 'रोकें', assign: 'सौंपें → PM',
    proof: 'प्रमाण',
    heldBy: 'रोका गया · टीम को सूचित',
    approvedBy: 'मंज़ूर · दर्ज',
    assignedBy: 'सौंपा गया → PM · दर्ज',
    risks: (n: number) => `${n} जोखिम`,
    ok: 'ठीक',
    connectTitle: 'आपकी साइट बात करना शुरू करते ही ब्रीफ़ जीवंत हो जाएगा।',
    connectBody: 'शुरू करने के लिए एक WhatsApp ग्रुप जोड़ें — हर अपडेट यहाँ एक भरोसेमंद सत्य के रूप में आता है।',
    connect: 'ग्रुप जोड़ें',
    errorLine: 'अभी आपका ब्रीफ़ लोड नहीं हो सका।',
    tryAgain: 'फिर कोशिश करें',
    deliveries: 'डिलीवरी', issues: 'मुद्दे', present: 'उपस्थित',
  },
} as const

const SEV_RANK: Record<string, number> = { high: 0, med: 1, low: 2 }

/** Worst status across a site's risks. */
function siteStatus(site: BriefSite): Status {
  let worst: Status = 'ok'
  const order: Status[] = ['ok', 'info', 'warn', 'risk']
  for (const r of site.top_risks) {
    const s = severityToStatus(r.severity)
    if (order.indexOf(s) > order.indexOf(worst)) worst = s
  }
  return worst
}

export default function Brief() {
  const { lang } = useT()
  const { me } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()
  const qc = useQueryClient()
  const t = STR[lang]

  // resolved decisions (local optimistic state keyed by risk index).
  const [resolved, setResolved] = useState<Record<string, string>>({})

  const briefQ = useQuery<OwnerBrief | null>({
    queryKey: ['owner', 'brief'],
    queryFn: async () => {
      // The morning brief recaps the PREVIOUS day, so "today" is often empty.
      // Pick the most recent brief that actually carries risks (else the most
      // recent by date) — robust to timezone + an empty same-day brief. The
      // /briefs list isn't date-ordered, so we sort client-side.
      const byDateDesc = (a: OwnerBrief, b: OwnerBrief) =>
        (b.brief_date ?? '').localeCompare(a.brief_date ?? '')
      const hasRisk = (b: OwnerBrief) =>
        (b.payload?.sites ?? []).some((s) => (s.top_risks?.length ?? 0) > 0)
      const briefs = (await owner.briefs()).items
      if (briefs.length > 0) {
        const withRisks = briefs.filter(hasRisk).sort(byDateDesc)
        const chosen = withRisks[0] ?? [...briefs].sort(byDateDesc)[0]
        if (chosen) return chosen
      }
      // Nothing yet — ask the backend to generate the brief (defaults to yesterday).
      try {
        const run = await owner.runBrief({})
        return {
          id: run.brief_id,
          company_id: '',
          brief_date: run.payload.brief_date,
          payload: run.payload,
          text: run.text,
          sent_at: null,
        }
      } catch {
        return null
      }
    },
  })

  const decide = useMutation({
    mutationFn: ({ risk, site, action }: { risk: Risk; site: BriefSite; action: 'approve' | 'hold' | 'assign' }) =>
      owner.createDecision({
        site_id: risk.site_id || site.site_id || null,
        action,
        title: risk.message,
        detail: `${site.name} · ${risk.kind}`,
        evidence_event_ids: risk.evidence_event_ids,
      }),
  })

  const { sites, ranked } = useMemo(() => {
    const sites = briefQ.data?.payload.sites ?? []
    const ranked: { risk: Risk; site: BriefSite; key: string }[] = []
    for (const site of sites) {
      for (let i = 0; i < site.top_risks.length; i++) {
        const risk = site.top_risks[i]
        ranked.push({ risk, site, key: `${site.site_id}:${i}` })
      }
    }
    ranked.sort((a, b) => (SEV_RANK[a.risk.severity] ?? 9) - (SEV_RANK[b.risk.severity] ?? 9))
    return { sites, ranked }
  }, [briefQ.data])

  if (briefQ.isLoading) {
    return <Wrap><LoadingBlock /></Wrap>
  }
  if (briefQ.error) {
    return (
      <Wrap>
        <ErrorBlock message={t.errorLine} retryLabel={t.tryAgain} onRetry={() => void briefQ.refetch()} />
      </Wrap>
    )
  }

  // First-run / no data → calm connect card.
  if (!briefQ.data || sites.length === 0) {
    return (
      <Wrap>
        <Card>
          <Display style={{ fontSize: 22, lineHeight: 28 }}>{t.connectTitle}</Display>
          <Body muted style={{ marginTop: SPACE.sm }}>{t.connectBody}</Body>
          <Button title={t.connect} block size="lg" style={{ marginTop: SPACE.lg }} onPress={() => { /* connect-group flow (O5) — phased */ }} />
        </Card>
      </Wrap>
    )
  }

  const top = ranked.slice(0, 3)
  const overflow = Math.max(0, ranked.length - 3)
  const allCalm = ranked.length === 0

  // --- pulse (cross-site, derived from counts) ---
  const totals = sites.reduce(
    (acc, s) => {
      acc.attendance += s.counts.attendance
      acc.deliveries += s.counts.deliveries
      acc.issues += s.counts.issues
      return acc
    },
    { attendance: 0, deliveries: 0, issues: 0 },
  )
  const cashRisks = ranked.filter((r) => /cash|payment|invoice|bill|money/i.test(r.risk.kind)).length
  const laborRisks = ranked.filter((r) => /labor|labour|attendance|crew/i.test(r.risk.kind)).length
  const materialRisks = ranked.filter((r) => /material|cement|steel|delivery|stock/i.test(r.risk.kind)).length
  const onTrack = sites.filter((s) => siteStatus(s) === 'ok').length

  const greetName = me?.name ?? null

  return (
    <Wrap onRefresh={() => qc.invalidateQueries({ queryKey: ['owner', 'brief'] })} refreshing={briefQ.isRefetching}>
      {/* title row */}
      <View style={{ gap: SPACE.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Small muted>{greetName ? `${t.greeting}, ${greetName}` : t.greeting}</Small>
          <Mono muted style={{ fontSize: 12 }}>{formatWhen(briefQ.data.sent_at ?? new Date().toISOString())}</Mono>
        </View>
        <Display style={{ fontSize: 22, lineHeight: 28 }}>
          {allCalm ? t.calmTitle : t.needToday(ranked.length, sites.length)}
        </Display>
      </View>

      {/* exceptions */}
      {allCalm ? (
        <Card style={{ borderLeftWidth: 4, borderLeftColor: theme.colors.ok }}>
          <BodyStrong>{t.calmTitle}</BodyStrong>
          <Body muted style={{ marginTop: SPACE.xs }}>{t.calmBody}</Body>
        </Card>
      ) : (
        <View style={{ gap: SPACE.md }}>
          {top.map(({ risk, site, key }) => (
            <BriefCommandCard
              key={key}
              risk={risk}
              siteName={site.name}
              pending={decide.isPending}
              resolvedLabel={resolved[key]}
              proofLabel={t.proof}
              chips={{ approve: t.approve, hold: t.hold, assign: t.assign }}
              onChip={(action) => {
                const label = action === 'approve' ? t.approvedBy : action === 'hold' ? t.heldBy : t.assignedBy
                setResolved((m) => ({ ...m, [key]: label }))
                decide.mutate(
                  { risk, site, action },
                  { onError: () => setResolved((m) => { const n = { ...m }; delete n[key]; return n }) },
                )
              }}
            />
          ))}
          {overflow > 0 ? (
            <Button title={t.moreInApprovals(overflow)} variant="ghost" onPress={() => router.push('/(contractor)/owner/approvals')} />
          ) : null}
        </View>
      )}

      {/* sites roll-up */}
      <SectionLabel trailing={<Small color={theme.colors.accentDeep} onPress={() => router.push('/(contractor)/owner/sites')}>{t.seeAll}</Small>}>
        {t.sites}
      </SectionLabel>
      <View style={{ gap: SPACE.sm }}>
        {[...sites]
          .sort((a, b) => b.top_risks.length - a.top_risks.length)
          .map((s) => {
            const st = siteStatus(s)
            return (
              <SiteRollupRow
                key={s.site_id}
                name={s.name}
                status={st}
                riskLine={s.top_risks.length > 0 ? t.risks(s.top_risks.length) : t.ok}
                meta={`${s.counts.attendance} ${t.present} · ${s.counts.deliveries} ${t.deliveries} · ${s.counts.issues} ${t.issues}`}
                onPress={() => router.push(`/(contractor)/owner/site/${s.site_id}`)}
              />
            )
          })}
      </View>

      {/* pulse 2×2 */}
      <SectionLabel>{t.pulse}</SectionLabel>
      <View style={{ gap: SPACE.sm }}>
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          <PulseCard
            glyph="₹"
            label={t.cash}
            status={cashRisks > 0 ? 'risk' : 'ok'}
            headline={cashRisks > 0 ? t.risks(cashRisks) : t.ok}
          />
          <PulseCard
            glyph="◷"
            label={t.labor}
            status={laborRisks > 0 ? 'warn' : 'ok'}
            headline={String(totals.attendance)}
            supporting={`${totals.attendance} ${t.present}`}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          <PulseCard
            glyph="▢"
            label={t.material}
            status={materialRisks > 0 ? 'warn' : 'ok'}
            headline={materialRisks > 0 ? t.risks(materialRisks) : String(totals.deliveries)}
            supporting={`${totals.deliveries} ${t.deliveries}`}
          />
          <PulseCard
            glyph="↗"
            label={t.progress}
            status={onTrack === sites.length ? 'ok' : 'info'}
            headline={`${onTrack}/${sites.length}`}
            supporting={totals.issues > 0 ? `${totals.issues} ${t.issues}` : undefined}
          />
        </View>
      </View>
    </Wrap>
  )
}

// ---- small wrapper to keep the scroll/refresh consistent -------------------
function Wrap({
  children,
  onRefresh,
  refreshing,
}: {
  children: React.ReactNode
  onRefresh?: () => void
  refreshing?: boolean
}) {
  const { theme } = useTheme()
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.lg, paddingTop: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.md }}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} /> : undefined
      }
    >
      {children}
    </ScrollView>
  )
}
