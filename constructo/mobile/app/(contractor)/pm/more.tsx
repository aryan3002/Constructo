/**
 * PM · More — identity + sign out. Heavy desk work (full schedule, reports,
 * exports) stays web-primary; this MVP ships identity + the sign-out path.
 *
 * Neev re-skin: SettingsGroup + SettingsRow (no raw Card/Button), theme fonts,
 * no hardcoded colours.
 */
import { useRouter } from 'expo-router'

import { useAuth } from '../../../src/auth/AuthContext'
import { useT } from '../../../src/i18n/I18nProvider'
import { SPACE } from '../../../src/theme/tokens'
import {
  H1,
  Screen,
  SettingsGroup,
  SettingsRow,
} from '../../../src/ui'

const STR = {
  en: {
    phone: 'Phone',
    company: 'Company',
  },
  hi: {
    phone: 'फ़ोन',
    company: 'कंपनी',
  },
} as const

const ROLE_LABEL: Record<string, { en: string; hi: string }> = {
  owner: { en: 'Owner', hi: 'मालिक' },
  pm: { en: 'Project Manager', hi: 'प्रोजेक्ट मैनेजर' },
  accountant: { en: 'Accountant', hi: 'लेखाकार' },
  procurement: { en: 'Procurement', hi: 'खरीद' },
  supervisor: { en: 'Supervisor', hi: 'सुपरवाइज़र' },
}

export default function PmMore() {
  const { t, lang } = useT()
  const { me, signOut } = useAuth()
  const router = useRouter()
  const str = STR[lang]

  async function onSignOut() {
    await signOut()
    router.replace('/(auth)/login')
  }

  const roleLabel = me?.role ? (ROLE_LABEL[me.role]?.[lang] ?? me.role) : '—'

  return (
    <Screen>
      <H1>{t('pm.tabMore')}</H1>

      {/* Identity group */}
      <SettingsGroup>
        <SettingsRow
          icon="user"
          title={me?.name ?? '—'}
          subtitle={roleLabel}
          hideChevron
          onPress={() => {}}
        />
        {me?.phone ? (
          <SettingsRow
            icon="phone"
            title={me.phone}
            subtitle={str.phone}
            hideChevron
            last={!me?.company_id}
            onPress={() => {}}
          />
        ) : null}
        {me?.company_id ? (
          <SettingsRow
            icon="briefcase"
            title={me.company_name ?? me.company_id}
            subtitle={str.company}
            hideChevron
            last
            onPress={() => {}}
          />
        ) : null}
      </SettingsGroup>

      {/* Account actions */}
      <SettingsGroup style={{ marginTop: SPACE.sm }}>
        <SettingsRow
          icon="log-out"
          title={t('auth.signOut')}
          tone="risk"
          hideChevron
          last
          onPress={onSignOut}
          accessibilityLabel={t('auth.signOut')}
        />
      </SettingsGroup>
    </Screen>
  )
}
