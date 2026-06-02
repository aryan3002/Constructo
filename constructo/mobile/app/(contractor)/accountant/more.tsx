/**
 * Accountant · More — identity + sign out. Heavy reconciliation across dozens of
 * invoices is a desktop dual-pane task; mobile is the exceptions + flag-on-the-go
 * skin. This MVP ships identity + the sign-out path.
 */
import { useRouter } from 'expo-router'

import { useAuth } from '../../../src/auth/AuthContext'
import { useT } from '../../../src/i18n/I18nProvider'
import { SPACE } from '../../../src/theme/tokens'
import { Body, BodyStrong, Button, Card, H1, Mono, Screen, Small } from '../../../src/ui'

const ROLE_LABEL: Record<string, { en: string; hi: string }> = {
  owner: { en: 'Owner', hi: 'मालिक' },
  pm: { en: 'Project Manager', hi: 'प्रोजेक्ट मैनेजर' },
  accountant: { en: 'Accountant', hi: 'लेखाकार' },
  procurement: { en: 'Procurement', hi: 'खरीद' },
  supervisor: { en: 'Supervisor', hi: 'सुपरवाइज़र' },
}

export default function AccountantMore() {
  const { t, lang } = useT()
  const { me, signOut } = useAuth()
  const router = useRouter()

  async function onSignOut() {
    await signOut()
    router.replace('/')
  }

  const roleLabel = me?.role ? (ROLE_LABEL[me.role]?.[lang] ?? me.role) : '—'

  return (
    <Screen>
      <H1>{t('accountant.tabMore')}</H1>

      <Card>
        <BodyStrong style={{ fontSize: 20, lineHeight: 26 }}>{me?.name ?? '—'}</BodyStrong>
        <Body muted style={{ marginTop: 2 }}>{roleLabel}</Body>
        {me?.phone ? (
          <Mono muted style={{ marginTop: SPACE.sm }}>{me.phone}</Mono>
        ) : null}
      </Card>

      <Card>
        <Small muted style={{ letterSpacing: 1 }}>COMPANY</Small>
        <Mono style={{ marginTop: SPACE.xs }}>{me?.company_id ?? '—'}</Mono>
      </Card>

      <Button title={t('auth.signOut')} variant="secondary" block onPress={onSignOut} />
    </Screen>
  )
}
