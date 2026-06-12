/**
 * Brief (Tab 1 — THE HERO). The 7am cross-site command screen.
 *
 * One screen, two altitudes (Owner.md §6.1):
 *   - Decide:   ≤3 highest-severity risks across all sites, each a NeedsYouCard
 *               (proof on tap) with inline Approve / Hold / Assign actions that
 *               create a logged decision (optimistic collapse + refetch).
 *   - Scan:     a 2×2 Cash / Labor / Material / Progress pulse derived from the
 *               brief counts (calm, hide-empty).
 *   - Roll-up:  a worst-first per-site list.
 * Empty/first-run = a calm "connect a group" card. If today's brief is missing,
 * we POST /briefs/run as a fallback before showing empty.
 *
 * Slice B adds:
 *   - Sticky header with SiteSwitcher (All sites ▾) + bell + avatar initials.
 *   - Client-side site scope: selecting a site filters risk list + roll-up strip.
 *   - Risk cards are NeedsYouCard (with Hold wired as secondaryLabel + Assign button).
 *   - Premium EmptyState for first-run.
 */
import React, { useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '../../../src/auth/AuthContext'
import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, severityToStatus } from '../../../src/theme/tokens'
import { owner, type BriefSite, type OwnerBrief, type Risk } from '../../../src/api/owner'
import { Button, Display, EmptyState, Micro, Mono, NeedsYouCard, Small, StatusPill } from '../../../src/ui'
import {
  ErrorBlock,
  LoadingBlock,
  PulseCard,
  SectionLabel,
  SiteRollupRow,
  SiteSwitcher,
  type SiteSwitcherItem,
  formatWhen,
  idsToEvidence,
} from './_components'
import { buildRanked, scopeRanked, scopeSites, siteWorstStatus } from './_brief.util'

const STR = {
  en: {
    greeting: 'Good morning',
    needToday: (n: number, s: number) => `${n} thing${n === 1 ? '' : 's'} need you today across ${s} site${s === 1 ? '' : 's'}.`,
    needTodaySite: (n: number) => `${n} thing${n === 1 ? '' : 's'} need you today at this site.`,
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
    connectTitle: 'Your brief lights up as your sites get going.',
    connectBody: 'Open a site chat and capture the day — deliveries, attendance and decisions land here as one source of truth.',
    connect: 'Open a site chat',
    errorLine: 'We could not load your brief just now.',
    tryAgain: 'Try again',
    deliveries: 'deliveries', issues: 'issues', present: 'present',
    // Site switcher
    allSites: 'All sites',
  },
  hi: {
    greeting: 'सुप्रभात',
    needToday: (n: number, s: number) => `आज ${s} साइट पर ${n} चीज़ों को आपकी ज़रूरत है।`,
    needTodaySite: (n: number) => `इस साइट पर आज ${n} चीज़ों को आपकी ज़रूरत है।`,
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
    connectTitle: 'जैसे-जैसे आपकी साइटें चलती हैं, आपका ब्रीफ़ यहाँ रोशन होगा।',
    connectBody: 'एक साइट चैट खोलें और दिन दर्ज करें — डिलीवरी, हाज़िरी और फ़ैसले यहाँ एक भरोसेमंद सत्य के रूप में आते हैं।',
    connect: 'साइट चैट खोलें',
    errorLine: 'अभी आपका ब्रीफ़ लोड नहो सका।',
    tryAgain: 'फिर कोशिश करें',
    deliveries: 'डिलीवरी', issues: 'मुद्दे', present: 'उपस्थित',
    // Site switcher
    allSites: 'सभी साइट',
  },
} as const

export default function Brief() {
  const { lang } = useT()
  const { me } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()
  const qc = useQueryClient()
  const t = STR[lang]

  // resolved decisions (local optimistic state keyed by risk index).
  const [resolved, setResolved] = useState<Record<string, string>>({})

  // Site switcher — client-side scope filter (null = All sites).
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)

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
    return { sites, ranked: buildRanked(sites) }
  }, [briefQ.data])

  // --- Client-side site scope (no new backend call) ---
  const scopedRanked = useMemo(() => scopeRanked(ranked, selectedSiteId), [ranked, selectedSiteId])
  const scopedSites = useMemo(() => scopeSites(sites, selectedSiteId), [sites, selectedSiteId])

  // SiteSwitcher items — one entry per site with worst status dot.
  const switcherItems: SiteSwitcherItem[] = useMemo(
    () => sites.map((s) => ({ id: s.site_id, name: s.name, status: siteWorstStatus(s) })),
    [sites],
  )

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

  // First-run / no data → calm connect empty state.
  if (!briefQ.data || sites.length === 0) {
    return (
      <Wrap>
        <EmptyState
          variant="empty"
          icon="message-circle"
          title={t.connectTitle}
          body={t.connectBody}
          action={
            <Button
              title={t.connect}
              size="lg"
              onPress={() => router.push('/(contractor)/owner/chat')}
            />
          }
        />
      </Wrap>
    )
  }

  const top = scopedRanked.slice(0, 3)
  const overflow = Math.max(0, scopedRanked.length - 3)
  const allCalm = scopedRanked.length === 0

  // --- pulse (scoped, derived from counts) ---
  const totals = scopedSites.reduce(
    (acc, s) => {
      acc.attendance += s.counts.attendance
      acc.deliveries += s.counts.deliveries
      acc.issues += s.counts.issues
      return acc
    },
    { attendance: 0, deliveries: 0, issues: 0 },
  )
  const cashRisks = scopedRanked.filter((r) => /cash|payment|invoice|bill|money/i.test(r.risk.kind)).length
  const laborRisks = scopedRanked.filter((r) => /labor|labour|attendance|crew/i.test(r.risk.kind)).length
  const materialRisks = scopedRanked.filter((r) => /material|cement|steel|delivery|stock/i.test(r.risk.kind)).length
  const onTrack = scopedSites.filter((s) => siteWorstStatus(s) === 'ok').length

  const greetName = me?.name ?? null

  return (
    <Wrap onRefresh={() => qc.invalidateQueries({ queryKey: ['owner', 'brief'] })} refreshing={briefQ.isRefetching}>
      {/* ── Sticky header row: site switcher pill + avatar ─────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SiteSwitcher
          sites={switcherItems}
          selectedId={selectedSiteId}
          onSelect={setSelectedSiteId}
          allLabel={t.allSites}
          totalCount={sites.length}
        />
        {/* Owner avatar — initials pill */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={greetName ?? 'Account'}
          onPress={() => router.push('/(contractor)/owner/more')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.colors.accentWarm,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Micro color={theme.colors.accentDeep} style={{ fontWeight: '700' }}>
            {(greetName ?? 'O').slice(0, 2).toUpperCase()}
          </Micro>
        </Pressable>
      </View>

      {/* ── Title row ───────────────────────────────────────────────────────── */}
      <View style={{ gap: SPACE.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Small muted>{greetName ? `${t.greeting}, ${greetName}` : t.greeting}</Small>
          <Mono muted style={{ fontSize: 12 }}>{formatWhen(briefQ.data.sent_at ?? new Date().toISOString())}</Mono>
        </View>
        <Display style={{ fontSize: 22, lineHeight: 28 }}>
          {allCalm
            ? t.calmTitle
            : selectedSiteId != null
              ? t.needTodaySite(scopedRanked.length)
              : t.needToday(ranked.length, sites.length)}
        </Display>
      </View>

      {/* ── Exceptions (risk cards) ─────────────────────────────────────────── */}
      {allCalm ? (
        <EmptyState variant="clear" title={t.calmTitle} body={t.calmBody} />
      ) : (
        <View style={{ gap: SPACE.md }}>
          {top.map(({ risk, site, key }, idx) => {
            const status = severityToStatus(risk.severity)
            const domain = risk.kind.replace(/_/g, ' ')
            const evidenceChips = idsToEvidence(risk.evidence_event_ids, t.proof).map(
              (item) => ({ kind: 'message' as const, label: item.label ?? t.proof }),
            )

            // Resolved → collapsed confirmation pill
            if (resolved[key]) {
              return (
                <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.sm }}>
                  <StatusPill status="ok" size="sm" label={resolved[key]} />
                </View>
              )
            }

            return (
              <View key={key} style={{ gap: SPACE.sm }}>
                <NeedsYouCard
                  rank={idx + 1}
                  status={status}
                  statusLabel={domain}
                  title={risk.message}
                  detail={site.name}
                  evidence={evidenceChips}
                  primaryLabel={t.approve}
                  secondaryLabel={t.hold}
                  tone={status === 'risk' ? 'cautionary' : 'affirmative'}
                  canApprove={true}
                  onPrimary={decide.isPending ? undefined : () => {
                    setResolved((m) => ({ ...m, [key]: t.approvedBy }))
                    decide.mutate(
                      { risk, site, action: 'approve' },
                      { onError: () => setResolved((m) => { const n = { ...m }; delete n[key]; return n }) },
                    )
                  }}
                  onSecondary={decide.isPending ? undefined : () => {
                    setResolved((m) => ({ ...m, [key]: t.heldBy }))
                    decide.mutate(
                      { risk, site, action: 'hold' },
                      { onError: () => setResolved((m) => { const n = { ...m }; delete n[key]; return n }) },
                    )
                  }}
                />
                {/* Assign — tertiary action below the card (owner-assigns-to-PM) */}
                <Button
                  title={t.assign}
                  variant="secondary"
                  size="md"
                  disabled={decide.isPending}
                  onPress={() => {
                    setResolved((m) => ({ ...m, [key]: t.assignedBy }))
                    decide.mutate(
                      { risk, site, action: 'assign' },
                      { onError: () => setResolved((m) => { const n = { ...m }; delete n[key]; return n }) },
                    )
                  }}
                />
              </View>
            )
          })}
          {overflow > 0 ? (
            <Button title={t.moreInApprovals(overflow)} variant="ghost" onPress={() => router.push('/(contractor)/owner/approvals')} />
          ) : null}
        </View>
      )}

      {/* ── Sites roll-up ──────────────────────────────────────────────────── */}
      <SectionLabel trailing={<Small color={theme.colors.accentDeep} onPress={() => router.push('/(contractor)/owner/sites')}>{t.seeAll}</Small>}>
        {t.sites}
      </SectionLabel>
      <View style={{ gap: SPACE.sm }}>
        {[...scopedSites]
          .sort((a, b) => b.top_risks.length - a.top_risks.length)
          .map((s) => {
            const st = siteWorstStatus(s)
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

      {/* ── Pulse 2×2 ────────────────────────────────────────────────────── */}
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
            status={onTrack === scopedSites.length ? 'ok' : 'info'}
            headline={`${onTrack}/${scopedSites.length}`}
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
