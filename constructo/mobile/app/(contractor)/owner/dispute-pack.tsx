/**
 * Dispute pack (off-tab, owner) — the tamper-evident, interrogable case file for
 * a counterparty's advance-adjustment case (Phase 3.6). Enter a vendor name →
 * the hash-chained record set + the settlement math + a head hash anyone can
 * attest against, watermarked "internal record, not legal evidence". Ask-the-pack
 * answers money questions ONLY from these records (abstains otherwise).
 *
 * Reached from the owner site detail with a `site_id` param.
 */
import { useState } from 'react'
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { owner, type DisputePackResult, type PackAskResult } from '../../../src/api/owner'
import { Body, BodyStrong, Card, H1, Mono, Screen, Small } from '../../../src/ui'

const STR = {
  en: {
    title: 'Dispute pack',
    sub: 'Tamper-evident case file',
    vendor: 'Vendor / counterparty',
    vendorPh: 'e.g. Sharma Traders',
    build: 'Build pack',
    paid: 'Paid out',
    invoiced: 'Invoiced',
    unadjusted: 'Unadjusted advance',
    records: 'Records',
    headHash: 'Head hash',
    ask: 'Ask the pack',
    askPh: 'e.g. how much is unadjusted?',
    askBtn: 'Ask',
    empty: 'Enter a vendor to assemble their advance-adjustment case file.',
    none: 'No records for this vendor on this site.',
    err: 'Could not build the pack.',
    back: 'Back',
  },
  hi: {
    title: 'विवाद फ़ाइल',
    sub: 'छेड़-प्रतिरोधी केस फ़ाइल',
    vendor: 'वेंडर / पक्ष',
    vendorPh: 'जैसे शर्मा ट्रेडर्स',
    build: 'फ़ाइल बनाएँ',
    paid: 'दिया',
    invoiced: 'बिल हुआ',
    unadjusted: 'बिना समायोजित अग्रिम',
    records: 'रिकॉर्ड',
    headHash: 'हेड हैश',
    ask: 'फ़ाइल से पूछें',
    askPh: 'जैसे कितना बिना समायोजित है?',
    askBtn: 'पूछें',
    empty: 'अग्रिम-समायोजन केस फ़ाइल बनाने के लिए वेंडर डालें।',
    none: 'इस साइट पर इस वेंडर का कोई रिकॉर्ड नहीं।',
    err: 'फ़ाइल नहीं बन सकी।',
    back: 'वापस',
  },
} as const

/** Indian-grouped rupee (no Hermes Intl reliance). */
function inr(v: number): string {
  const s = Math.abs(Math.round(v)).toString()
  let grouped = s
  if (s.length > 3) {
    const last3 = s.slice(-3)
    let rest = s.slice(0, -3)
    const parts: string[] = []
    while (rest.length > 2) {
      parts.unshift(rest.slice(-2))
      rest = rest.slice(0, -2)
    }
    if (rest) parts.unshift(rest)
    grouped = `${parts.join(',')},${last3}`
  }
  return `₹${grouped}`
}

export default function DisputePack() {
  const { lang } = useT()
  const t = STR[lang as 'en' | 'hi'] ?? STR.en
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const { site_id } = useLocalSearchParams<{ site_id: string }>()

  const [vendor, setVendor] = useState('')
  const [pack, setPack] = useState<DisputePackResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<PackAskResult | null>(null)
  const [asking, setAsking] = useState(false)

  async function build() {
    const cp = vendor.trim()
    if (!cp || !site_id || loading) return
    setLoading(true)
    setError(null)
    setAnswer(null)
    try {
      setPack(await owner.disputePack(site_id, cp))
    } catch {
      setError(t.err)
      setPack(null)
    } finally {
      setLoading(false)
    }
  }

  async function ask() {
    const qn = question.trim()
    if (!qn || !site_id || !pack || asking) return
    setAsking(true)
    try {
      setAnswer(await owner.askPack(site_id, pack.counterparty, qn))
    } catch {
      setAnswer({ answerable: false, answer: t.err })
    } finally {
      setAsking(false)
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <Pressable onPress={() => router.back()} accessibilityLabel={t.back} hitSlop={10} style={{ marginBottom: SPACE.xs }}>
        <Feather name="chevron-left" size={26} color={c.text} />
      </Pressable>
      <H1>{t.title}</H1>
      <Small muted style={{ marginTop: -SPACE.xs, marginBottom: SPACE.sm }}>{t.sub}</Small>

      <Card>
        <Small muted style={{ letterSpacing: 1 }}>{t.vendor.toUpperCase()}</Small>
        <TextInput
          value={vendor}
          onChangeText={setVendor}
          placeholder={t.vendorPh}
          placeholderTextColor={c.textMute}
          onSubmitEditing={build}
          style={{
            marginTop: SPACE.xs,
            minHeight: 44,
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: theme.radii.control,
            backgroundColor: c.paper,
            paddingHorizontal: SPACE.md,
            color: c.text,
            fontSize: 16,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.build}
          disabled={!vendor.trim() || loading}
          onPress={build}
          style={({ pressed }) => ({
            marginTop: SPACE.sm,
            minHeight: 48,
            borderRadius: theme.radii.control,
            backgroundColor: c.accent,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: !vendor.trim() || loading ? 0.5 : pressed ? 0.9 : 1,
          })}
        >
          {loading ? <ActivityIndicator color={c.onAccent} /> : <BodyStrong color={c.onAccent}>{t.build}</BodyStrong>}
        </Pressable>
      </Card>

      {error ? (
        <Card><Body style={{ color: c.risk }}>{error}</Body></Card>
      ) : !pack ? (
        <Card><Body muted>{t.empty}</Body></Card>
      ) : pack.record_count === 0 ? (
        <Card><Body muted>{t.none}</Body></Card>
      ) : (
        <>
          {/* Settlement */}
          <Card>
            <Body style={{ color: c.text }}>{pack.narrative}</Body>
            <View style={{ flexDirection: 'row', marginTop: SPACE.md, gap: SPACE.md }}>
              <View style={{ flex: 1 }}>
                <Mono style={{ fontSize: 16, color: c.text }}>{inr(pack.settlement.paid_out)}</Mono>
                <Small muted>{t.paid}</Small>
              </View>
              <View style={{ flex: 1 }}>
                <Mono style={{ fontSize: 16, color: c.text }}>{inr(pack.settlement.invoiced)}</Mono>
                <Small muted>{t.invoiced}</Small>
              </View>
              <View style={{ flex: 1 }}>
                <Mono style={{ fontSize: 16, color: pack.settlement.warn ? c.risk : c.text }}>
                  {inr(pack.settlement.unadjusted_advance)}
                </Mono>
                <Small muted>{t.unadjusted}</Small>
              </View>
            </View>
          </Card>

          {/* Ask the pack */}
          <Card>
            <Small muted style={{ letterSpacing: 1 }}>{t.ask.toUpperCase()}</Small>
            <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs }}>
              <TextInput
                value={question}
                onChangeText={setQuestion}
                placeholder={t.askPh}
                placeholderTextColor={c.textMute}
                onSubmitEditing={ask}
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.askBtn}
                disabled={!question.trim() || asking}
                onPress={ask}
                style={({ pressed }) => ({
                  paddingHorizontal: SPACE.lg,
                  borderRadius: theme.radii.control,
                  backgroundColor: c.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: !question.trim() || asking ? 0.5 : pressed ? 0.9 : 1,
                })}
              >
                {asking ? <ActivityIndicator color={c.onAccent} /> : <BodyStrong color={c.onAccent}>{t.askBtn}</BodyStrong>}
              </Pressable>
            </View>
            {answer ? (
              <Body style={{ marginTop: SPACE.sm, color: answer.answerable ? c.text : c.textMute }}>
                {answer.answer}
              </Body>
            ) : null}
          </Card>

          {/* Tamper-evidence footer */}
          <Card>
            <Small muted style={{ letterSpacing: 1 }}>{`${pack.record_count} ${t.records.toUpperCase()} · ${t.headHash.toUpperCase()}`}</Small>
            <Mono muted style={{ marginTop: SPACE.xs, fontSize: 11 }} numberOfLines={1}>
              {pack.head_hash}
            </Mono>
            <Small muted style={{ marginTop: SPACE.sm, fontStyle: 'italic' }}>{pack.watermark}</Small>
          </Card>
        </>
      )}
    </Screen>
  )
}
