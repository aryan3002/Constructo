/**
 * Homeowner Home (H1 foundation). The live "am I okay?" dashboard is built in
 * H2; here we ship a calm, real Daylight home that proves the shell, the kit,
 * and the theme — plus quick links to Settings and the dev gallery.
 */
import { View } from 'react-native'
import { Link } from 'expo-router'

import { useAuth } from '../../src/auth/AuthContext'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE } from '../../src/theme/tokens'
import { Body, CalmCard, Card, Display, Screen, Small, StatusPill } from '../../src/ui'

export default function Home() {
  const { t } = useT()
  const { me } = useAuth()
  const { theme } = useTheme()

  return (
    <Screen>
      <View style={{ gap: SPACE.xs }}>
        <Small muted>{me?.phone ?? ''}</Small>
        <Display>{t('nav.home')}</Display>
      </View>

      <CalmCard
        eyebrow="Today"
        title="Your home is on track"
        body="A calm summary of progress, milestones and anything that needs you will appear here."
        status="ok"
        trailing={<StatusPill status="ok" size="sm" />}
      />

      <Card>
        <Body>The live dashboard arrives in the next update.</Body>
        <Small muted style={{ marginTop: SPACE.xs }}>
          This foundation ships the themed shell, the component kit and the
          role-branched navigation.
        </Small>
      </Card>

      <View style={{ gap: SPACE.sm }}>
        <Link href="/(homeowner)/settings" asChild>
          <Body color={theme.colors.accentDeep}>⚙︎  {t('settings.title')}</Body>
        </Link>
        <Link href="/dev/gallery" asChild>
          <Body color={theme.colors.accentDeep}>◧  {t('gallery.title')}</Body>
        </Link>
      </View>
    </Screen>
  )
}
