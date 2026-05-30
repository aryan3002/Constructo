/**
 * Help — a dead-simple, voice-first escape hatch (no FAQ wall). Leads with
 * LISTEN (🔊 read the basics aloud) and CALL a human (📞), since this is the
 * only "reading" screen for a low-literacy role. Plus Sign out. Icon + WORD,
 * big text, ≥56px targets.
 */
import { Alert, Linking, Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'

import { useAuth } from '../../../src/auth/AuthContext'
import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { Body, BodyStrong, Card, Display, H2, Screen, Small } from '../../../src/ui'
import { VoiceOutButton, MUKADAM_TAP } from './_voice'

// TODO(config): wire the real site/office support number from the bound site.
const SUPPORT_PHONE = '+910000000000'

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
  const { theme } = useTheme()
  const c = theme.colors
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
    router.replace('/')
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

      {/* Call a human — big, icon + word. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={str.call}
        onPress={callOffice}
        style={({ pressed }) => [
          {
            minHeight: 64,
            borderRadius: theme.radii.control,
            backgroundColor: c.accent,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.92 : 1,
          },
          theme.shadowCard,
        ]}
      >
        <BodyStrong color={c.onAccent} style={{ fontSize: 18 }}>{str.call}</BodyStrong>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={str.signOut}
        onPress={onSignOut}
        style={({ pressed }) => ({
          minHeight: MUKADAM_TAP,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radii.control,
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: c.card,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Small style={{ fontWeight: '600' }}>{str.signOut}</Small>
      </Pressable>
    </Screen>
  )
}
