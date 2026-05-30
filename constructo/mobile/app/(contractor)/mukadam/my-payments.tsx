/**
 * My Payments — the MOTIVATOR. A read-only payment-status view (TRACKING only,
 * never moves money). Big ₹ amount rows + a clear status pill, the
 * "proof = faster payment" tie-in, and 🔊 voice-out as the headline
 * accessibility affordance for a non-reader.
 *
 * Data: GET /api/v1/me/payments → Page<MyPayment>. Scoped server-side to the
 * caller. Loading / empty / error states all covered.
 */
import { ActivityIndicator, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, STATUS, type Status } from '../../../src/theme/tokens'
import { Body, BodyStrong, Button, Card, Display, H2, Mono, Screen, Small, StatusPill } from '../../../src/ui'
import { mukadamApi, formatRupees, type MyPayment } from '../../../src/api/mukadam'
import { VoiceOutButton } from './_voice'

const STR = {
  en: {
    title: 'My Pay',
    proof: 'Clear proof = faster payment 💰',
    voiceOut: 'Sun lo',
    loading: 'Loading your payments…',
    error: 'Could not load your payments.',
    retry: 'Try again',
    empty: 'Your pay history shows here once the first cycle closes.',
    paidOn: 'Paid on',
    statusPaid: 'Paid',
    statusConfirmed: 'Confirmed',
    statusPending: 'Pending',
    statusDisputed: 'Disputed',
  },
  hi: {
    title: 'मेरी पेमेंट',
    proof: 'साफ़ proof = जल्दी payment 💰',
    voiceOut: 'सुन लो',
    loading: 'आपकी पेमेंट लोड हो रही है…',
    error: 'पेमेंट लोड नहीं हो सकी।',
    retry: 'फिर कोशिश करें',
    empty: 'पहला cycle बंद होते ही आपकी पेमेंट यहाँ दिखेगी।',
    paidOn: 'मिली',
    statusPaid: 'मिल गई',
    statusConfirmed: 'पक्की',
    statusPending: 'बाकी',
    statusDisputed: 'सवाल',
  },
} as const

type Str = (typeof STR)[keyof typeof STR]

/** Map a payment status onto the shared spine + a human label. */
function statusMeta(s: string, str: Str): { status: Status; label: string } {
  switch (s) {
    case 'confirmed':
      return { status: 'ok', label: str.statusConfirmed }
    case 'recorded':
      return { status: 'info', label: str.statusPaid }
    case 'disputed':
      return { status: 'risk', label: str.statusDisputed }
    default:
      return { status: 'warn', label: str.statusPending }
  }
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

export default function MyPayments() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const str = STR[lang]

  const q = useQuery({
    queryKey: ['mukadam', 'myPayments'],
    queryFn: () => mukadamApi.myPayments(),
  })

  const payments = q.data?.items ?? []

  // What the 🔊 voice-out reads aloud — a non-reader must HEAR their status.
  const readAloud = payments.length
    ? `${str.title}. ${payments
        .map((p) => `${formatRupees(p.amount)}, ${statusMeta(p.status, str).label}`)
        .join('. ')}`
    : `${str.title}. ${str.empty}`

  return (
    <Screen>
      <Display>{str.title}</Display>
      <BodyStrong color={c.accentDeep}>{str.proof}</BodyStrong>
      <VoiceOutButton text={readAloud} label={str.voiceOut} lang={lang} />

      {q.isLoading ? (
        <View style={{ paddingVertical: SPACE.xl, alignItems: 'center', gap: SPACE.md }}>
          <ActivityIndicator color={c.accent} size="large" />
          <Small muted>{str.loading}</Small>
        </View>
      ) : q.isError ? (
        <Card>
          <View style={{ gap: SPACE.md }}>
            <Body color={STATUS.risk}>{str.error}</Body>
            <Button title={str.retry} variant="secondary" onPress={() => void q.refetch()} />
          </View>
        </Card>
      ) : payments.length === 0 ? (
        <Card>
          <Body muted>{str.empty}</Body>
        </Card>
      ) : (
        <Card padded={false}>
          {payments.map((p: MyPayment, i) => {
            const meta = statusMeta(p.status, str)
            return (
              <View
                key={p.id}
                style={{
                  padding: SPACE.lg,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: c.line,
                  gap: SPACE.sm,
                  minHeight: 72,
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: SPACE.md,
                  }}
                >
                  <Mono style={{ fontSize: 26 }}>{formatRupees(p.amount)}</Mono>
                  <StatusPill status={meta.status} label={meta.label} />
                </View>
                <Small muted>
                  {str.paidOn} {formatDate(p.paid_on, lang)}
                  {p.method ? ` · ${p.method}` : ''}
                </Small>
              </View>
            )
          })}
        </Card>
      )}
    </Screen>
  )
}
