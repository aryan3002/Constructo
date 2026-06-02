/**
 * Accountant · Payments — the TRACKING ledger (read-only).
 *
 * Constructo records money movements for visibility only; it NEVER moves money
 * (correction #1). This screen shows the running totals (in / out / net) and the
 * recorded rows, split into incoming (homeowner→contractor) and outgoing
 * (contractor→supplier). There is no "pay" / "release" action anywhere — the
 * Payments Rail is forbidden. Disputed rows are listed but excluded from totals.
 */
import { ScrollView, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import {
  accountant,
  type Payment,
  type PaymentLedger,
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

const inr = (s: string | number) => {
  const n = typeof s === 'string' ? Number(s) : s
  return '₹' + Math.round(Number.isFinite(n) ? n : 0).toLocaleString('en-IN')
}

export default function AccountantPayments() {
  const { t } = useT()
  const { theme } = useTheme()

  const q = useQuery<PaymentLedger>({
    queryKey: ['accountant', 'ledger'],
    queryFn: () => accountant.ledger(),
  })

  const data = q.data
  const incoming = (data?.items ?? []).filter(
    (p) => p.direction === 'homeowner_to_contractor',
  )
  const outgoing = (data?.items ?? []).filter(
    (p) => p.direction === 'contractor_to_supplier',
  )

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
      <View style={{ gap: SPACE.xs }}>
        <H1>{t('accountant.paymentsTitle')}</H1>
        <Body muted>{t('accountant.paymentsSubtitle')}</Body>
      </View>

      {/* tracking-only disclaimer — no money ever moves here */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Feather name="eye" size={16} color={theme.colors.textMute} />
          <Small muted style={{ flex: 1 }}>
            {t('accountant.trackingOnly')}
          </Small>
        </View>
      </Card>

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
          {/* totals */}
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Total label={t('accountant.inflow')} value={inr(data.totals.inflow)} tone="ok" />
              <Total label={t('accountant.outflow')} value={inr(data.totals.outflow)} tone="warn" />
              <Total label={t('accountant.net')} value={inr(data.totals.net)} tone="info" />
            </View>
          </Card>

          <PaymentGroup
            icon="arrow-down-left"
            title={t('accountant.incoming')}
            payments={incoming}
          />
          <PaymentGroup
            icon="arrow-up-right"
            title={t('accountant.outgoing')}
            payments={outgoing}
          />
        </>
      ) : null}
    </ScrollView>
  )
}

// ---------------------------------------------------------------------------

function Total({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'ok' | 'warn' | 'info'
}) {
  const { theme } = useTheme()
  return (
    <View style={{ gap: 2 }}>
      <Small muted style={{ letterSpacing: 1 }}>
        {label.toUpperCase()}
      </Small>
      <BodyStrong style={{ fontSize: 18, color: theme.colors[tone] }}>{value}</BodyStrong>
    </View>
  )
}

function PaymentGroup({
  icon,
  title,
  payments,
}: {
  icon: React.ComponentProps<typeof Feather>['name']
  title: string
  payments: Payment[]
}) {
  const { t } = useT()
  const { theme } = useTheme()
  return (
    <View style={{ gap: SPACE.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <Feather name={icon} size={16} color={theme.colors.textMute} />
        <Small muted style={{ letterSpacing: 1 }}>
          {title.toUpperCase()}
        </Small>
      </View>
      {payments.length === 0 ? (
        <Card>
          <Body muted>{t('accountant.noPayments')}</Body>
        </Card>
      ) : (
        payments.map((p) => <PaymentRow key={p.id} p={p} />)
      )}
    </View>
  )
}

function PaymentRow({ p }: { p: Payment }) {
  const { t } = useT()
  const { theme } = useTheme()
  const disputed = p.status === 'disputed'
  const statusTone: 'ok' | 'warn' | 'risk' | 'info' =
    p.status === 'confirmed' ? 'ok' : disputed ? 'risk' : 'info'
  return (
    <Card
      style={
        disputed
          ? { borderLeftWidth: 4, borderLeftColor: theme.colors.risk }
          : undefined
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <StatusDot status={statusTone} />
        <BodyStrong style={{ flex: 1 }}>{p.counterparty_name}</BodyStrong>
        <BodyStrong>{inr(p.amount)}</BodyStrong>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.xs }}>
        <Small muted>{p.paid_on}</Small>
        <Small muted>{t(`accountant.status_${p.status}`)}</Small>
      </View>
    </Card>
  )
}
