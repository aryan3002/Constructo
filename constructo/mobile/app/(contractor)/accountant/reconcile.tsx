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
 * Strings come from the t() i18n catalog; icons are premium Feather glyphs.
 */
import { Pressable, ScrollView, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
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
  H1,
  Small,
  StatusDot,
} from '../../../src/ui'

const inr = (n: number) =>
  '₹' + Math.round(n).toLocaleString('en-IN')

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
        <Card>
          <Body muted>{t('common.loading')}</Body>
        </Card>
      ) : q.error ? (
        <Card>
          <Body>{t('accountant.error')}</Body>
          <Button
            title={t('common.retry')}
            variant="secondary"
            style={{ marginTop: SPACE.sm }}
            onPress={() => void q.refetch()}
          />
        </Card>
      ) : data ? (
        <>
          {/* money-at-risk headline */}
          <Card
            style={
              data.total_amount_at_risk > 0
                ? { borderLeftWidth: 4, borderLeftColor: theme.colors.risk }
                : undefined
            }
          >
            <Small muted style={{ letterSpacing: 1 }}>
              {t('accountant.atRisk').toUpperCase()}
            </Small>
            <BodyStrong style={{ marginTop: SPACE.xs, fontSize: 28, lineHeight: 34 }}>
              {inr(data.total_amount_at_risk)}
            </BodyStrong>
            <Small muted style={{ marginTop: 2 }}>
              {t('accountant.openFlags', { count: data.open_exception_count })}
            </Small>
          </Card>

          {/* money exceptions (the flags) — worst-first */}
          <View style={{ gap: SPACE.sm }}>
            <SectionHeader icon="flag" title={t('accountant.exceptions')} />
            {hasFlags ? (
              data.exceptions.map((e) => <ExceptionCard key={e.decision_id} exc={e} />)
            ) : (
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                  <Feather name="check-circle" size={18} color={theme.colors.ok} />
                  <Body muted>{t('accountant.noFlags')}</Body>
                </View>
              </Card>
            )}
          </View>

          {/* per-site reconciliation — worst-first */}
          <View style={{ gap: SPACE.sm }}>
            <SectionHeader icon="layers" title={t('accountant.sites')} />
            {data.sites.length === 0 ? (
              <Card>
                <Body muted>{t('accountant.noSites')}</Body>
              </Card>
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
      <Small muted style={{ letterSpacing: 1 }}>
        {title.toUpperCase()}
      </Small>
    </View>
  )
}

function ExceptionCard({ exc }: { exc: MoneyException }) {
  const { theme } = useTheme()
  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: theme.colors.risk }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <StatusDot status="risk" />
        <BodyStrong style={{ flex: 1 }}>{exc.title}</BodyStrong>
        {exc.amount_at_risk > 0 ? (
          <Small style={{ color: theme.colors.risk }}>{inr(exc.amount_at_risk)}</Small>
        ) : null}
      </View>
      {exc.detail ? (
        <Small muted style={{ marginTop: SPACE.xs }}>
          {exc.detail}
        </Small>
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
  const tone: 'ok' | 'warn' | 'risk' =
    s.mismatch > 0 ? 'risk' : bad > 0 ? 'warn' : 'ok'

  return (
    <Pressable onPress={onPress}>
      <Card
        style={
          tone !== 'ok'
            ? { borderLeftWidth: 4, borderLeftColor: theme.colors[tone] }
            : undefined
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <StatusDot status={tone} />
          <BodyStrong style={{ flex: 1 }}>{site.site_name}</BodyStrong>
          <Feather name="chevron-right" size={18} color={theme.colors.textMute} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md, marginTop: SPACE.xs }}>
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
        </View>
        {s.total_amount_at_risk > 0 ? (
          <Small style={{ color: theme.colors.risk, marginTop: SPACE.xs }}>
            {t('accountant.siteAtRisk', { amount: inr(s.total_amount_at_risk) })}
          </Small>
        ) : null}
      </Card>
    </Pressable>
  )
}
