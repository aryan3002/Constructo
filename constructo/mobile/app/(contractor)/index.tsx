/** Contractor placeholder — "the builder app is coming; use web for now". */
import { useRouter } from 'expo-router'

import { useAuth } from '../../src/auth/AuthContext'
import { useT } from '../../src/i18n/I18nProvider'
import { SPACE } from '../../src/theme/tokens'
import { Body, Button, Card, Display, Screen, Small } from '../../src/ui'

export default function ContractorHome() {
  const { t } = useT()
  const { me, signOut } = useAuth()
  const router = useRouter()

  async function onSignOut() {
    await signOut()
    router.replace('/(auth)/login')
  }

  return (
    <Screen>
      <Display>{t('contractor.comingSoonTitle')}</Display>
      <Card>
        <Body>{t('contractor.comingSoonBody')}</Body>
        {me?.role ? (
          <Small muted style={{ marginTop: SPACE.sm }}>
            Signed in as {me.role}.
          </Small>
        ) : null}
      </Card>
      <Button title={t('auth.signOut')} variant="secondary" block onPress={onSignOut} />
    </Screen>
  )
}
