/**
 * Help — a dead-simple, voice-first escape hatch (no FAQ wall). Leads with
 * LISTEN (🔊 read the basics aloud) and CALL a human (📞), since this is the
 * only "reading" screen for a low-literacy role. Plus Sign out. Icon + WORD,
 * big text, ≥56px targets.
 */
import { Alert, Linking, View } from 'react-native'
import { useRouter } from 'expo-router'

import { useAuth } from '../../../src/auth/AuthContext'
import { useT } from '../../../src/i18n/I18nProvider'
import { SPACE } from '../../../src/theme/tokens'
import { Body, Button, Card, Display, H2, Screen } from '../../../src/ui'
import { VoiceOutButton } from './_voice'

// TODO(config): wire the real site/office support number from the bound site.
// Until a real number exists the call button stays hidden — dialling a placeholder
// is a broken feature to users and a rejection risk in Play review.
const SUPPORT_PHONE: string | null = null

const STR = {
  en: {
    title: 'Help',
    voiceOut: 'Listen',
    howTitle: 'How to mark attendance',
    how1: '1. Tap 📷 to take a photo of the crew, or 🎙 to say the count.',
    how2: '2. Use − and + to set how many came.',
    how3: '3. Tap “✓ Mark present”. Saved even with no network.',
    payTitle: 'How pay works',
    pay: 'A clear count is your proof. Clear proof = faster payment. See it any time under “My Pay”.',
    call: '📞 Call the office',
    callErr: 'Could not start the call.',
    signOut: 'Sign out',
    ok: 'OK',
  },
  hi: {
    title: 'मदद',
    voiceOut: 'सुन लो',
    howTitle: 'हाज़िरी कैसे लगाएँ',
    how1: '1. 📷 दबाकर आदमियों की फ़ोटो लो, या 🎙 से गिनती बोलो।',
    how2: '2. − और + से बताओ कितने आए।',
    how3: '3. “✓ हाज़िरी लगाओ” दबाओ। नेटवर्क न हो तो भी सेव रहेगा।',
    payTitle: 'पेमेंट कैसे होती है',
    pay: 'साफ़ गिनती आपका proof है। साफ़ proof = जल्दी payment। “मेरी पेमेंट” में कभी भी देखो।',
    call: '📞 ऑफ़िस से बात करो',
    callErr: 'कॉल शुरू नहीं हो सकी।',
    signOut: 'साइन आउट',
    ok: 'ठीक है',
  },
} as const

export default function Help() {
  const { lang } = useT()
  const str = STR[lang]
  const { signOut } = useAuth()
  const router = useRouter()

  const readAloud = `${str.howTitle}. ${str.how1} ${str.how2} ${str.how3} ${str.payTitle}. ${str.pay}`

  async function callOffice() {
    try {
      await Linking.openURL(`tel:${SUPPORT_PHONE}`)
    } catch {
      Alert.alert(str.callErr, undefined, [{ text: str.ok }])
    }
  }

  async function onSignOut() {
    await signOut()
    router.replace('/(auth)/login')
  }

  return (
    <Screen>
      <Display>{str.title}</Display>
      <VoiceOutButton text={readAloud} label={str.voiceOut} lang={lang} />

      <Card>
        <View style={{ gap: SPACE.sm }}>
          <H2>{str.howTitle}</H2>
          <Body>{str.how1}</Body>
          <Body>{str.how2}</Body>
          <Body>{str.how3}</Body>
        </View>
      </Card>

      <Card>
        <View style={{ gap: SPACE.sm }}>
          <H2>{str.payTitle}</H2>
          <Body>{str.pay}</Body>
        </View>
      </Card>

      {/* Call a human — big primary action (ink); phone call is not an AI "yes").
          Hidden until SUPPORT_PHONE is wired to the bound site's real number. */}
      {SUPPORT_PHONE ? (
        <Button
          title={str.call}
          variant="primary"
          size="lg"
          block
          onPress={callOffice}
        />
      ) : null}

      <Button
        title={str.signOut}
        variant="secondary"
        size="md"
        block
        onPress={onSignOut}
      />
    </Screen>
  )
}
