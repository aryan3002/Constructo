/**
 * Accountant · Reconcile (the hero). The exceptions-first money cockpit:
 *   - total ₹-at-risk across every visible site,
 *   - open MONEY EXCEPTIONS (hold_payment flags) worst-first,
 *   - per-site reconciliation status (matched / variance / mismatch), worst-first.
 *
 * Read-mostly and TRACKING-ONLY (correction #1): there is NO button here that
 * moves money or resolves a flag. The accountant *sees* the worst money risk;
 * the owner resolves it from the approvals inbox ("the accountant flags, the
 * owner pays"). Tapping a site opens its row-by-row reconciliation with the GRN
 * proof one tap away.
 *
 * Neev re-skin: MoneyCell for all ₹, StatusPill for status, EvidenceChip on
 * exception detail, EmptyState for no-flags / loading error / no-sites.
 * Dense desk rows — 44px rows, scannable, no big field targets.
 */
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, type Status } from '../../../src/theme/tokens'
import {
  accountant,
  type AccountantOverview,
  type ReconcileSiteSummary,
  type MoneyException,
} from '../../../src/api/accountant'
import {
  Body,
  BodyStrong,
  Button,
  Card,
  EmptyState,
  EvidenceChip,
  Eyebrow,
  H1,
  MoneyCell,
  Small,
  StatusPill,
} from '../../../src/ui'

export default function AccountantReconcile() {
  const { t } = useT()
  const { theme } = useTheme()
  const router = useRouter()

  const q = useQuery<AccountantOverview>({
    queryKey: ['accountant', 'overview'],
    queryFn: () => accountant.overview(),
  })

  const data = q.data
  const hasFlags = (data?.open_exception_count ?? 0) > 0

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{
        padding: SPACE.lg,
        paddingTop: SPACE.xl,
        paddingBottom: SPACE.xxl,
        gap: SPACE.md,
      }}
    >
      {/* header */}
      <View style={{ gap: SPACE.xs }}>
        <H1>{t('accountant.reconcileTitle')}</H1>
        <Body muted>{t('accountant.reconcileSubtitle')}</Body>
      </View>

      {/* states */}
      {q.isLoading ? (
        <View style={{ paddingVertical: SPACE.xl, alignItems: 'center', gap: SPACE.md }}>
          <ActivityIndicator color={theme.colors.accent} size="large" />
          <Small muted>{t('common.loading')}</Small>
        </View>
      ) : q.error ? (
        <EmptyState
          variant="offline"
          title={t('accountant.error')}
          action={
            <Button
              title={t('common.retry')}
              variant="secondary"
              onPress={() => void q.refetch()}
            />
          }
        />
      ) : data ? (
        <>
          {/* money-at-risk headline */}
          <Card
            flag={data.total_amount_at_risk > 0 ? 'risk' : undefined}
            padded
          >
            <Eyebrow>{t('accountant.atRisk')}</Eyebrow>
            <View style={{ marginTop: SPACE.xs, gap: SPACE.xs }}>
              <MoneyCell
                amount={data.total_amount_at_risk}
                sign={data.total_amount_at_risk > 0 ? 'out' : 'none'}
                size="xl"
              />
              <Small muted>
                {t('accountant.openFlags', { count: data.open_exception_count })}
              </Small>
            </View>
          </Card>

          {/* money exceptions (the flags) — worst-first */}
          <View style={{ gap: SPACE.sm }}>
            <SectionHeader icon="flag" title={t('accountant.exceptions')} />
            {hasFlags ? (
              data.exceptions.map((e) => <ExceptionCard key={e.decision_id} exc={e} />)
            ) : (
              <EmptyState variant="clear" title={t('accountant.noFlags')} />
            )}
          </View>

          {/* per-site reconciliation — worst-first */}
          <View style={{ gap: SPACE.sm }}>
            <SectionHeader icon="layers" title={t('accountant.sites')} />
            {data.sites.length === 0 ? (
              <EmptyState variant="empty" title={t('accountant.noSites')} />
            ) : (
              data.sites.map((s) => (
                <SiteRow
                  key={s.site_id}
                  site={s}
                  onPress={() =>
                    router.push(`/(contractor)/accountant/site/${s.site_id}`)
                  }
                />
              ))
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  )
}

// ---------------------------------------------------------------------------

function SectionHeader({
  icon,
  title,
}: {
  icon: React.ComponentProps<typeof Feather>['name']
  title: string
}) {
  const { theme } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
      <Feather name={icon} size={16} color={theme.colors.textMute} />
      <Eyebrow>{title}</Eyebrow>
    </View>
  )
}

function ExceptionCard({ exc }: { exc: MoneyException }) {
  const { t } = useT()
  return (
    <Card flag="risk">
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm }}>
        <StatusPill status="risk" size="sm" style={{ marginTop: 1 }} />
        <BodyStrong style={{ flex: 1 }}>{exc.title}</BodyStrong>
        {exc.amount_at_risk > 0 ? (
          <MoneyCell amount={exc.amount_at_risk} sign="out" size="sm" align="right" />
        ) : null}
      </View>
      {exc.detail ? (
        <Small muted style={{ marginTop: SPACE.xs }}>
          {exc.detail}
        </Small>
      ) : null}
      {/* Prompt to view proof — the site detail has the row-level GRN */}
      {exc.site_id ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs, marginTop: SPACE.sm }}>
          <EvidenceChip kind="doc" label={t('accountant.viewProof')} />
        </View>
      ) : null}
    </Card>
  )
}

function SiteRow({
  site,
  onPress,
}: {
  site: ReconcileSiteSummary
  onPress: () => void
}) {
  const { t } = useT()
  const { theme } = useTheme()
  const s = site.summary
  const bad = s.mismatch + s.missing_proof + s.needs_approval
  const tone: Status =
    s.mismatch > 0 ? 'risk' : bad > 0 ? 'warn' : 'ok'

  return (
    <Pressable onPress={onPress}>
      <Card flag={tone !== 'ok' ? tone : undefined} padded={false}>
        {/* 44-px desk-density row */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.sm,
            minHeight: 44,
            paddingHorizontal: SPACE.lg,
            paddingVertical: SPACE.sm,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.line,
          }}
        >
          <StatusPill status={tone} size="sm" style={{ marginRight: SPACE.xs }} />
          <BodyStrong style={{ flex: 1 }}>{site.site_name}</BodyStrong>
          <Feather name="chevron-right" size={18} color={theme.colors.textMute} />
        </View>

        {/* summary counts + at-risk amount */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: SPACE.md,
            paddingHorizontal: SPACE.lg,
            paddingVertical: SPACE.sm,
          }}
        >
          <Small muted>{t('accountant.matchedN', { count: s.matched })}</Small>
          {s.mismatch > 0 ? (
            <Small style={{ color: theme.colors.risk }}>
              {t('accountant.mismatchN', { count: s.mismatch })}
            </Small>
          ) : null}
          {s.missing_proof > 0 ? (
            <Small style={{ color: theme.colors.warn }}>
              {t('accountant.missingProofN', { count: s.missing_proof })}
            </Small>
          ) : null}
          {s.needs_approval > 0 ? (
            <Small style={{ color: theme.colors.warn }}>
              {t('accountant.needsApprovalN', { count: s.needs_approval })}
            </Small>
          ) : null}
          {s.total_amount_at_risk > 0 ? (
            <MoneyCell
              amount={s.total_amount_at_risk}
              sign="out"
              size="sm"
              label={t('accountant.atRisk')}
              align="right"
              style={{ marginLeft: 'auto' }}
            />
          ) : null}
        </View>
      </Card>
    </Pressable>
  )
}
