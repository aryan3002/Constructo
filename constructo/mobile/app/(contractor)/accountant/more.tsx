/**
 * Accountant · More — identity + sign out. Heavy reconciliation across dozens of
 * invoices is a desktop dual-pane task; mobile is the exceptions + flag-on-the-go
 * skin. This MVP ships identity + the sign-out path.
 *
 * Neev re-skin: SettingsGroup / SettingsRow for identity + company cards (desk
 * feel, hairline dividers), sign-out as variant="secondary" (never marigold —
 * it's not an affirmative action, and no two marigold fills compete).
 */
import { View } from 'react-native'
import { useRouter } from 'expo-router'

import { useAuth } from '../../../src/auth/AuthContext'
import { useT } from '../../../src/i18n/I18nProvider'
import { SPACE } from '../../../src/theme/tokens'
import {
  Button,
  H1,
  Screen,
  SettingsGroup,
  SettingsRow,
  Small,
} from '../../../src/ui'

const STR = {
  en: {
    title: 'More',
    identity: 'IDENTITY',
    name: 'Name',
    role: 'Role',
    phone: 'Phone',
    company: 'COMPANY',
    companyId: 'Company ID',
    signOut: 'Sign out',
    noValue: '—',
  },
  hi: {
    title: 'अधिक',
    identity: 'पहचान',
    name: 'नाम',
    role: 'भूमिका',
    phone: 'फ़ोन',
    company: 'कंपनी',
    companyId: 'कंपनी ID',
    signOut: 'साइन आउट',
    noValue: '—',
  },
} as const

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
  const str = STR[lang]

  async function onSignOut() {
    await signOut()
    router.replace('/')
  }

  const roleLabel = me?.role ? (ROLE_LABEL[me.role]?.[lang] ?? me.role) : str.noValue

  return (
    <Screen>
      <H1>{t('accountant.tabMore')}</H1>

      {/* identity group */}
      <View>
        <Small
          muted
          style={{
            marginBottom: SPACE.sm,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
          }}
        >
          {str.identity}
        </Small>
        <SettingsGroup>
          <SettingsRow
            icon="user"
            title={str.name}
            subtitle={me?.name ?? str.noValue}
            hideChevron
            last={!me?.phone}
            onPress={() => {}}
          />
          <SettingsRow
            icon="briefcase"
            title={str.role}
            subtitle={roleLabel}
            hideChevron
            last={!me?.phone}
            onPress={() => {}}
          />
          {me?.phone ? (
            <SettingsRow
              icon="phone"
              title={str.phone}
              subtitle={me.phone}
              hideChevron
              last
              onPress={() => {}}
            />
          ) : null}
        </SettingsGroup>
      </View>

      {/* company group */}
      {me?.company_id ? (
        <View>
          <Small
            muted
            style={{
              marginBottom: SPACE.sm,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}
          >
            {str.company}
          </Small>
          <SettingsGroup>
            <SettingsRow
              icon="home"
              title={str.companyId}
              subtitle={me.company_id}
              hideChevron
              last
              onPress={() => {}}
            />
          </SettingsGroup>
        </View>
      ) : null}

      <Button
        title={t('auth.signOut')}
        variant="secondary"
        block
        onPress={onSignOut}
      />
    </Screen>
  )
}
