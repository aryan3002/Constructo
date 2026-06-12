/**
 * Team (off-tab, owner) — team members and role management.
 * Stub placeholder; Slice D will replace this with the full wired screen.
 */
import { Stack } from 'expo-router'

import { useT } from '../../../src/i18n/I18nProvider'
import { SPACE } from '../../../src/theme/tokens'
import { Body, H1, Screen } from '../../../src/ui'

export default function Team() {
  const { t } = useT()
  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <H1>{t('account.team')}</H1>
      <Body muted style={{ marginTop: SPACE.sm }}>
        {t('account.teamSub')}
      </Body>
    </Screen>
  )
}
