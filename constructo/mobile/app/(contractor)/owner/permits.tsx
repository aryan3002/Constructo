/**
 * Permits (off-tab, owner) — drawings, approvals and compliance documents.
 * Stub placeholder; Slice E will replace this with the full wired screen.
 */
import { Stack } from 'expo-router'

import { useT } from '../../../src/i18n/I18nProvider'
import { SPACE } from '../../../src/theme/tokens'
import { Body, H1, Screen } from '../../../src/ui'

export default function Permits() {
  const { t } = useT()
  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <H1>{t('account.permits')}</H1>
      <Body muted style={{ marginTop: SPACE.sm }}>
        {t('account.permitsSub')}
      </Body>
    </Screen>
  )
}
