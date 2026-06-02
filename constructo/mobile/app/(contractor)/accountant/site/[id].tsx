/**
 * Accountant · one site's reconciliation (off-tab, pushed from Reconcile).
 *
 * Row-by-row delivery-vs-invoice matching, exceptions-first (worst status, then
 * biggest money-at-risk). Each row is evidence-anchored: a mismatch shows the
 * variance reasons, and a delivery row can pull its GRN (Goods Received Note)
 * proof on tap. READ-ONLY and tracking-only — there is no "hold" / "pay" action
 * here; the accountant sees the gap, the owner resolves it.
 */
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../../src/i18n/I18nProvider'
import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE } from '../../../../src/theme/tokens'
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
  H1,
  Small,
  StatusDot,
} from '../../../../src/ui'

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')

const STATUS_TONE: Record<ReconcileStatus, 'ok' | 'warn' | 'risk'> = {
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

      <Body
        muted
        onPress={() => router.back()}
        style={{ marginBottom: SPACE.xs }}
      >
        {t('accountant.back')}
      </Body>
      <H1>{t('accountant.siteReconcileTitle')}</H1>

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
        data.items.length === 0 ? (
          <Card>
            <Body muted>{t('accountant.noRows')}</Body>
          </Card>
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
    <Card
      style={
        tone !== 'ok'
          ? { borderLeftWidth: 4, borderLeftColor: theme.colors[tone] }
          : undefined
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <StatusDot status={tone} />
        <BodyStrong style={{ flex: 1 }}>
          {item.vendor ?? t('accountant.unknownVendor')}
          {item.item ? ` · ${item.item}` : ''}
        </BodyStrong>
        {item.amount_at_risk > 0 ? (
          <Small style={{ color: theme.colors.risk }}>{inr(item.amount_at_risk)}</Small>
        ) : null}
      </View>

      <Small muted style={{ marginTop: SPACE.xs }}>
        {t(`accountant.status_${item.status}`)}
      </Small>

      {item.delivery ? (
        <Small muted style={{ marginTop: SPACE.xs }}>
          {t('accountant.deliveryLine', { summary: item.delivery.summary })}
        </Small>
      ) : null}
      {item.invoice ? (
        <Small muted style={{ marginTop: 2 }}>
          {t('accountant.invoiceLine', { summary: item.invoice.summary })}
        </Small>
      ) : null}

      {/* variance reasons */}
      {item.reasons.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs, marginTop: SPACE.xs }}>
          {item.reasons.map((r) => (
            <Small key={r} style={{ color: theme.colors.warn }}>
              {reasonLabel(t, r)}
            </Small>
          ))}
        </View>
      ) : null}

      {/* GRN proof on tap */}
      {deliveryId ? (
        <Button
          title={grn ? t('accountant.hideProof') : t('accountant.viewProof')}
          variant="ghost"
          size="md"
          loading={loadingGrn}
          style={{ marginTop: SPACE.sm, alignSelf: 'flex-start' }}
          onPress={loadGrn}
        />
      ) : null}
      {grn ? (
        <View
          style={{
            marginTop: SPACE.xs,
            padding: SPACE.md,
            borderRadius: theme.radii.control,
            backgroundColor: theme.colors.bg,
            gap: 2,
          }}
        >
          <Small muted style={{ letterSpacing: 1 }}>
            {t('accountant.grn').toUpperCase()} · {grn.reference}
          </Small>
          <Body>
            {grn.quantity ?? '—'} {grn.unit ?? ''} {grn.material ?? ''}
          </Body>
          <Small muted>{grn.note}</Small>
        </View>
      ) : null}
    </Card>
  )
}
