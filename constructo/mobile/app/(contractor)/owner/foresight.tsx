/**
 * Foresight (off-tab, owner) — the portfolio command view (Phase 3.4). One
 * deterministic rollup across all the owner's sites: worker-days, spend,
 * deliveries, open disputes (exact-math GROUP BY, never an LLM guess). Each site
 * row taps through to its single-site detail (where per-site forecast + radar
 * live). Reached from More.
 */
import { useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Stack, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { owner, type SettlementResult, type SiteRollup } from '../../../src/api/owner'
import { Body, BodyStrong, Button, Card, EmptyState, H1, Mono, MoneyCell, Screen, Small, StatusPill, formatINR } from '../../../src/ui'
import { ErrorBlock, LoadingBlock } from './_components'

const STR = {
  en: {
    title: 'Foresight',
    sub: 'Your whole book, at a glance',
    workerDays: 'Worker-days',
    spend: 'Billed / paid',
    deliveries: 'Deliveries',
    disputes: 'Open disputes',
    empty: 'No sites in view yet.',
    err: 'Could not load your portfolio.',
    tryAgain: 'Try again',
    days: 'last 30 days',
    advanceGuard: 'Advance Guard',
    advanceSub: 'Check a vendor’s unadjusted advance before paying fresh',
    vendorPh: 'Vendor name',
    check: 'Check',
  },
  hi: {
    title: 'दूरदृष्टि',
    sub: 'आपकी सारी साइटें, एक नज़र में',
    workerDays: 'मज़दूर-दिन',
    spend: 'बिल / भुगतान',
    deliveries: 'डिलीवरी',
    disputes: 'खुले विवाद',
    empty: 'अभी कोई साइट नहीं।',
    err: 'पोर्टफोलियो लोड नहीं हुआ।',
    tryAgain: 'फिर कोशिश करें',
    days: 'पिछले 30 दिन',
    advanceGuard: 'अग्रिम गार्ड',
    advanceSub: 'नया भुगतान करने से पहले वेंडर का बिना समायोजित अग्रिम जाँचें',
    vendorPh: 'वेंडर का नाम',
    check: 'जाँचें',
  },
} as const

/** Format rupee for the stat helper (uses formatINR from the kit). */
function inr(value: number | null): string {
  if (value == null) return '—'
  const { currency, value: val } = formatINR(value, { sign: 'none' })
  return `${currency}${val}`
}

export default function Foresight() {
  const { lang } = useT()
  const t = STR[lang as 'en' | 'hi'] ?? STR.en
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()

  const q = useQuery({ queryKey: ['owner', 'portfolio'], queryFn: () => owner.portfolio(30) })

  // Advance Guard — a company-wide unadjusted-advance lookup (2.5 L2).
  const [vendor, setVendor] = useState('')
  const [guard, setGuard] = useState<SettlementResult | null>(null)
  const [checking, setChecking] = useState(false)
  async function checkGuard() {
    const cp = vendor.trim()
    if (!cp || checking) return
    setChecking(true)
    try {
      setGuard(await owner.settlement(cp))
    } catch {
      setGuard(null)
    } finally {
      setChecking(false)
    }
  }

  const stat = (label: string, value: string, tone?: string) => (
    <View style={{ flex: 1, gap: 2 }}>
      <Mono style={{ fontSize: 20, color: tone ?? c.text }}>{value}</Mono>
      <Small muted>{label}</Small>
    </View>
  )

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <H1>{t.title}</H1>
      <Small muted style={{ marginTop: -SPACE.xs, marginBottom: SPACE.sm }}>{t.sub}</Small>

      {q.isLoading ? (
        <LoadingBlock />
      ) : q.isError ? (
        <ErrorBlock message={t.err} retryLabel={t.tryAgain} onRetry={() => q.refetch()} />
      ) : !q.data || q.data.site_count === 0 ? (
        <EmptyState variant="empty" title={t.empty} />
      ) : (
        <>
          {/* Portfolio totals */}
          <Card>
            <Small muted style={{ letterSpacing: 1 }}>
              {`${q.data.site_count} SITES · ${t.days.toUpperCase()}`}
            </Small>
            <View style={{ flexDirection: 'row', marginTop: SPACE.md, gap: SPACE.sm }}>
              {stat(t.workerDays, q.data.totals.worker_days != null ? String(q.data.totals.worker_days) : '—')}
              <View style={{ flex: 1, gap: 2 }}>
                <MoneyCell
                  amount={q.data.totals.amount_total ?? 0}
                  sign="none"
                  size="md"
                  label={t.spend}
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', marginTop: SPACE.md, gap: SPACE.sm }}>
              {stat(t.deliveries, String(q.data.totals.deliveries))}
              {stat(
                t.disputes,
                String(q.data.totals.open_disputes),
                q.data.totals.open_disputes > 0 ? c.risk : undefined,
              )}
            </View>
          </Card>

          {/* Per-site rows */}
          {q.data.sites.map((s: SiteRollup) => (
            <Pressable
              key={s.site_id}
              accessibilityRole="button"
              accessibilityLabel={s.site_name}
              onPress={() => router.push(`/(contractor)/owner/site/${s.site_id}`)}
            >
              <Card flag={s.open_disputes > 0 ? 'risk' : 'ok'}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingRight: 20 }}>
                  <BodyStrong style={{ flex: 1 }}>{s.site_name}</BodyStrong>
                  {s.open_disputes > 0 ? (
                    <StatusPill status="risk" label={`${s.open_disputes} ${t.disputes.toLowerCase()}`} size="sm" />
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', marginTop: SPACE.sm, gap: SPACE.md, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <MoneyCell
                    amount={s.amount_total ?? 0}
                    sign="none"
                    size="sm"
                    label={t.spend}
                  />
                  <Small muted>
                    {s.worker_days != null ? `${s.worker_days} ${t.workerDays.toLowerCase()}` : '—'}
                  </Small>
                  <Small muted>{`${s.deliveries} ${t.deliveries.toLowerCase()}`}</Small>
                </View>
              </Card>
            </Pressable>
          ))}

          {/* Advance Guard (2.5 L2) — company-wide unadjusted advance lookup. */}
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="shield" size={14} color={c.accentDeep} />
              <Small muted style={{ letterSpacing: 1 }}>{t.advanceGuard.toUpperCase()}</Small>
            </View>
            <Small muted style={{ marginTop: 2 }}>{t.advanceSub}</Small>
            <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm, alignItems: 'center' }}>
              <TextInput
                value={vendor}
                onChangeText={setVendor}
                placeholder={t.vendorPh}
                placeholderTextColor={c.textMute}
                onSubmitEditing={checkGuard}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderWidth: 1,
                  borderColor: c.line,
                  borderRadius: theme.radii.control,
                  backgroundColor: c.paper,
                  paddingHorizontal: SPACE.md,
                  color: c.text,
                  fontSize: 15,
                }}
              />
              <Button
                title={t.check}
                variant="primary"
                size="md"
                loading={checking}
                disabled={!vendor.trim() || checking}
                onPress={checkGuard}
              />
            </View>
            {guard ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm, marginTop: SPACE.sm }}>
                <Feather
                  name={guard.warn ? 'alert-triangle' : 'check-circle'}
                  size={16}
                  color={guard.warn ? c.risk : c.ok}
                  style={{ marginTop: 2 }}
                />
                <Body style={{ flex: 1, color: guard.warn ? c.risk : c.text }}>{guard.message}</Body>
              </View>
            ) : null}
          </Card>
        </>
      )}
    </Screen>
  )
}
