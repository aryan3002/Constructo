/**
 * Accountant · Payments — the TRACKING ledger (read-only).
 *
 * Constructo records money movements for visibility only; it NEVER moves money
 * (correction #1). This screen shows the running totals (in / out / net) and the
 * recorded rows, split into incoming (homeowner→contractor) and outgoing
 * (contractor→supplier). There is no "pay" / "release" action anywhere — the
 * Payments Rail is forbidden. Disputed rows are listed but excluded from totals.
 *
 * Neev re-skin: MoneyCell for every ₹ (tabular, Indian-grouped), StatusPill for
 * row status, EmptyState for empty/offline, dense 44px desk rows in a Card list.
 * Totals use MoneyCell with an explicit sign so direction reads at a glance.
 */
import { ActivityIndicator, ScrollView, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, type Status } from '../../../src/theme/tokens'
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
  EmptyState,
  Eyebrow,
  H1,
  MoneyCell,
  Small,
  StatusPill,
} from '../../../src/ui'

function paymentStatus(s: string): Status {
  if (s === 'confirmed') return 'ok'
  if (s === 'disputed') return 'risk'
  return 'info'
}

function formatDate(iso: string, lang: 'en' | 'hi'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function AccountantPayments() {
  const { t, lang } = useT()
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
      <Card padded={false}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.sm,
            paddingHorizontal: SPACE.lg,
            paddingVertical: SPACE.md,
            minHeight: 44,
          }}
        >
          <Feather name="eye" size={16} color={theme.colors.textMute} />
          <Small muted style={{ flex: 1 }}>
            {t('accountant.trackingOnly')}
          </Small>
        </View>
      </Card>

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
          {/* totals — three MoneyCell side-by-side, each with a signed direction */}
          <Card padded={false}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingHorizontal: SPACE.lg,
                paddingVertical: SPACE.md,
              }}
            >
              <MoneyCell
                amount={Number(data.totals.inflow) || 0}
                sign="in"
                size="sm"
                label={t('accountant.inflow')}
              />
              <MoneyCell
                amount={Number(data.totals.outflow) || 0}
                sign="out"
                size="sm"
                label={t('accountant.outflow')}
              />
              <MoneyCell
                amount={Number(data.totals.net) || 0}
                sign={Number(data.totals.net) >= 0 ? 'in' : 'out'}
                size="sm"
                label={t('accountant.net')}
                align="right"
              />
            </View>
          </Card>

          <PaymentGroup
            icon="arrow-down-left"
            title={t('accountant.incoming')}
            payments={incoming}
            lang={lang}
          />
          <PaymentGroup
            icon="arrow-up-right"
            title={t('accountant.outgoing')}
            payments={outgoing}
            lang={lang}
          />
        </>
      ) : null}
    </ScrollView>
  )
}

// ---------------------------------------------------------------------------

function PaymentGroup({
  icon,
  title,
  payments,
  lang,
}: {
  icon: React.ComponentProps<typeof Feather>['name']
  title: string
  payments: Payment[]
  lang: 'en' | 'hi'
}) {
  const { t } = useT()
  const { theme } = useTheme()
  return (
    <View style={{ gap: SPACE.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <Feather name={icon} size={16} color={theme.colors.textMute} />
        <Eyebrow>{title}</Eyebrow>
      </View>
      {payments.length === 0 ? (
        <EmptyState variant="empty" title={t('accountant.noPayments')} />
      ) : (
        <Card padded={false}>
          {payments.map((p, i) => (
            <PaymentRow key={p.id} p={p} lang={lang} last={i === payments.length - 1} />
          ))}
        </Card>
      )}
    </View>
  )
}

function PaymentRow({ p, lang, last }: { p: Payment; lang: 'en' | 'hi'; last: boolean }) {
  const { t } = useT()
  const { theme } = useTheme()
  const disputed = p.status === 'disputed'
  const statusTone = paymentStatus(p.status)
  const isOutgoing = p.direction === 'contractor_to_supplier'

  return (
    <View
      style={{
        borderTopWidth: last ? 0 : 0,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.colors.line,
      }}
    >
      {/* dense desk row: 44px min-height */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
          minHeight: 44,
          paddingHorizontal: SPACE.lg,
          paddingTop: SPACE.sm,
          paddingBottom: disputed ? SPACE.xs : SPACE.sm,
        }}
      >
        <View style={{ flex: 1 }}>
          <BodyStrong numberOfLines={1}>{p.counterparty_name}</BodyStrong>
          <Small muted numberOfLines={1}>
            {formatDate(p.paid_on, lang)}
            {p.method ? ` · ${p.method}` : ''}
          </Small>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <MoneyCell
            amount={Number(p.amount) || 0}
            sign={isOutgoing ? 'out' : 'in'}
            size="sm"
            align="right"
          />
          <StatusPill status={statusTone} label={t(`accountant.status_${p.status}`)} size="sm" />
        </View>
      </View>
      {/* dispute detail note */}
      {disputed ? (
        <View
          style={{
            paddingHorizontal: SPACE.lg,
            paddingBottom: SPACE.sm,
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.xs,
          }}
        >
          <Feather name="alert-triangle" size={13} color={theme.colors.risk} />
          <Small style={{ color: theme.colors.risk }} numberOfLines={1}>
            {p.notes ?? t('accountant.status_disputed')}
          </Small>
        </View>
      ) : null}
    </View>
  )
}
