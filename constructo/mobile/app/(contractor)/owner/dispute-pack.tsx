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
import { Pressable, TextInput, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { owner, type DisputePackResult, type PackAskResult } from '../../../src/api/owner'
import { Body, Button, Card, H1, Mono, MoneyCell, Screen, Small } from '../../../src/ui'

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
        <Button
          title={t.build}
          variant="primary"
          size="md"
          block
          loading={loading}
          disabled={!vendor.trim() || loading}
          onPress={build}
          style={{ marginTop: SPACE.sm }}
        />
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
              <MoneyCell
                amount={pack.settlement.paid_out}
                sign="none"
                size="md"
                label={t.paid}
                style={{ flex: 1 }}
              />
              <MoneyCell
                amount={pack.settlement.invoiced}
                sign="none"
                size="md"
                label={t.invoiced}
                style={{ flex: 1 }}
              />
              <MoneyCell
                amount={pack.settlement.unadjusted_advance}
                sign={pack.settlement.warn ? 'out' : 'none'}
                size="md"
                label={t.unadjusted}
                style={{ flex: 1 }}
              />
            </View>
          </Card>

          {/* Ask the pack */}
          <Card>
            <Small muted style={{ letterSpacing: 1 }}>{t.ask.toUpperCase()}</Small>
            <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs, alignItems: 'center' }}>
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
              <Button
                title={t.askBtn}
                variant="primary"
                size="md"
                loading={asking}
                disabled={!question.trim() || asking}
                onPress={ask}
              />
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
