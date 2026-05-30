/** Settings — language switch (en/hi, persisted + synced) and sign out. */
import { View } from 'react-native'
import { useRouter } from 'expo-router'

import { useAuth } from '../../src/auth/AuthContext'
import { useT } from '../../src/i18n/I18nProvider'
import type { Language } from '../../src/api/types'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE } from '../../src/theme/tokens'
import { Body, Button, Card, Display, Screen, Small } from '../../src/ui'

export default function Settings() {
  const { t, lang, setLang } = useT()
  const { signOut } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()

  const langs: { code: Language; label: string }[] = [
    { code: 'en', label: t('settings.english') },
    { code: 'hi', label: t('settings.hindi') },
  ]

  async function onSignOut() {
    await signOut()
    router.replace('/')
  }

  return (
    <Screen>
      <Display>{t('settings.title')}</Display>

      <Card>
        <Small muted style={{ marginBottom: SPACE.sm }}>
          {t('settings.language')}
        </Small>
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          {langs.map((l) => (
            <Button
              key={l.code}
              title={l.label}
              variant={lang === l.code ? 'primary' : 'secondary'}
              onPress={() => setLang(l.code)}
            />
          ))}
        </View>
      </Card>

      <Button title={t('auth.signOut')} variant="ghost" block onPress={onSignOut} />
      <Body color={theme.colors.textMute}>Constructo · Daylight</Body>
    </Screen>
  )
}
