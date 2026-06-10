/**
 * Accountant · one site's reconciliation (off-tab, pushed from Reconcile).
 *
 * Row-by-row delivery-vs-invoice matching, exceptions-first (worst status, then
 * biggest money-at-risk). Each row is evidence-anchored: a mismatch shows the
 * variance reasons, and a delivery row can pull its GRN (Goods Received Note)
 * proof on tap. READ-ONLY and tracking-only — there is no "hold" / "pay" action
 * here; the accountant sees the gap, the owner resolves it.
 *
 * Neev re-skin: MoneyCell for all ₹ (tabular, Indian-grouped), StatusPill for
 * row status, EvidenceChip / EvidenceCard-pattern inline GRN proof, EmptyState
 * for empty/offline. Dense 44px desk rows. Reasons use Small + warn colour.
 */
import { useState } from 'react'
import { ActivityIndicator, ScrollView, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../../src/i18n/I18nProvider'
import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE, type Status } from '../../../../src/theme/tokens'
import {
  accountant,
  type GrnDraft,
  type ReconcileItem,
  type ReconcileList,
  type ReconcileStatus,
} from '../../../../src/api/accountant'
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
  Mono,
  MonoSm,
  Small,
  StatusPill,
} from '../../../../src/ui'

const STATUS_TONE: Record<ReconcileStatus, Status> = {
  matched: 'ok',
  mismatch: 'risk',
  missing_proof: 'warn',
  needs_approval: 'warn',
}

const KNOWN_REASONS = new Set([
  'no_invoice',
  'no_delivery',
  'quantity_variance',
  'item_mismatch',
])

/** Map a machine-stable reason to a translated label; unknown reasons render raw. */
function reasonLabel(t: (k: string) => string, reason: string): string {
  return KNOWN_REASONS.has(reason) ? t(`accountant.reason_${reason}`) : reason
}

export default function AccountantSite() {
  const { t } = useT()
  const { theme } = useTheme()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()

  const q = useQuery<ReconcileList>({
    queryKey: ['accountant', 'reconcile', id],
    enabled: !!id,
    queryFn: () => accountant.reconcileSite(id as string),
  })

  const data = q.data

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
      <Stack.Screen options={{ headerShown: false }} />

      {/* back link — Neev: Body muted, no chevron */}
      <Body
        muted
        onPress={() => router.back()}
        style={{ marginBottom: SPACE.xs }}
      >
        ← {t('accountant.back')}
      </Body>
      <H1>{t('accountant.siteReconcileTitle')}</H1>

      {/* site-level summary strip */}
      {data ? (
        <Card padded={false}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.lg,
              paddingHorizontal: SPACE.lg,
              paddingVertical: SPACE.md,
            }}
          >
            <MoneyCell
              amount={data.summary.total_amount_at_risk}
              sign={data.summary.total_amount_at_risk > 0 ? 'out' : 'none'}
              size="sm"
              label={t('accountant.atRisk')}
            />
            <View style={{ flex: 1 }} />
            <Small muted>{t('accountant.matchedN', { count: data.summary.matched })}</Small>
            {data.summary.mismatch > 0 ? (
              <Small style={{ color: theme.colors.risk }}>
                {t('accountant.mismatchN', { count: data.summary.mismatch })}
              </Small>
            ) : null}
            {data.summary.missing_proof > 0 ? (
              <Small style={{ color: theme.colors.warn }}>
                {t('accountant.missingProofN', { count: data.summary.missing_proof })}
              </Small>
            ) : null}
          </View>
        </Card>
      ) : null}

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
        data.items.length === 0 ? (
          <EmptyState variant="clear" title={t('accountant.noRows')} />
        ) : (
          data.items.map((it) => <ReconcileRow key={it.key} item={it} />)
        )
      ) : null}
    </ScrollView>
  )
}

// ---------------------------------------------------------------------------

function ReconcileRow({ item }: { item: ReconcileItem }) {
  const { t } = useT()
  const { theme } = useTheme()
  const tone = STATUS_TONE[item.status]
  const [grn, setGrn] = useState<GrnDraft | null>(null)
  const [loadingGrn, setLoadingGrn] = useState(false)

  const deliveryId = item.delivery?.event_id

  async function loadGrn() {
    if (!deliveryId || loadingGrn) return
    if (grn) {
      setGrn(null)
      return
    }
    setLoadingGrn(true)
    try {
      setGrn(await accountant.grn(deliveryId))
    } finally {
      setLoadingGrn(false)
    }
  }

  return (
    <Card flag={tone !== 'ok' ? tone : undefined} padded={false}>
      {/* 44px desk row — vendor + at-risk amount */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
          minHeight: 44,
          paddingHorizontal: SPACE.lg,
          paddingTop: SPACE.sm,
          paddingBottom: SPACE.xs,
        }}
      >
        <StatusPill status={tone} size="sm" />
        <BodyStrong style={{ flex: 1 }} numberOfLines={1}>
          {item.vendor ?? t('accountant.unknownVendor')}
          {item.item ? ` · ${item.item}` : ''}
        </BodyStrong>
        {item.amount_at_risk > 0 ? (
          <MoneyCell amount={item.amount_at_risk} sign="out" size="sm" align="right" />
        ) : null}
      </View>

      {/* status sentence */}
      <View style={{ paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xs }}>
        <Small muted>{t(`accountant.status_${item.status}`)}</Small>
      </View>

      {/* delivery / invoice event summaries */}
      {(item.delivery || item.invoice) ? (
        <View
          style={{
            paddingHorizontal: SPACE.lg,
            paddingBottom: SPACE.xs,
            gap: 2,
          }}
        >
          {item.delivery ? (
            <Small muted numberOfLines={1}>
              {t('accountant.deliveryLine', { summary: item.delivery.summary })}
            </Small>
          ) : null}
          {item.invoice ? (
            <Small muted numberOfLines={1}>
              {t('accountant.invoiceLine', { summary: item.invoice.summary })}
            </Small>
          ) : null}
        </View>
      ) : null}

      {/* variance reasons as small chips */}
      {item.reasons.length > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: SPACE.xs,
            paddingHorizontal: SPACE.lg,
            paddingBottom: SPACE.sm,
          }}
        >
          {item.reasons.map((r) => (
            <View
              key={r}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: theme.radii.chip,
                backgroundColor: `${theme.colors.warn}22`,
                borderWidth: 1,
                borderColor: `${theme.colors.warn}55`,
              }}
            >
              <Small style={{ color: theme.colors.warn }}>{reasonLabel(t, r)}</Small>
            </View>
          ))}
        </View>
      ) : null}

      {/* GRN proof on tap — EvidenceChip as the trigger */}
      {deliveryId ? (
        <View style={{ paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md }}>
          {loadingGrn ? (
            <ActivityIndicator size="small" color={theme.colors.accent} />
          ) : (
            <EvidenceChip
              kind="slip"
              label={grn ? t('accountant.hideProof') : t('accountant.viewProof')}
              onPress={loadGrn}
            />
          )}
        </View>
      ) : null}

      {/* Inline GRN proof — expanded below the chip */}
      {grn ? (
        <View
          style={{
            marginHorizontal: SPACE.lg,
            marginBottom: SPACE.md,
            padding: SPACE.md,
            borderRadius: theme.radii.control,
            backgroundColor: theme.colors.paper,
            borderWidth: 1,
            borderColor: theme.colors.line,
            gap: SPACE.xs,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <Feather name="file-text" size={14} color={theme.colors.textMute} />
            <Eyebrow>{t('accountant.grn')} · {grn.reference}</Eyebrow>
          </View>
          <Body>
            {grn.quantity ?? '—'} {grn.unit ?? ''} {grn.material ?? ''}
          </Body>
          {grn.note ? <Small muted>{grn.note}</Small> : null}
          {grn.vendor ? (
            <MonoSm color={theme.colors.textMute}>{grn.vendor}</MonoSm>
          ) : null}
        </View>
      ) : null}
    </Card>
  )
}
