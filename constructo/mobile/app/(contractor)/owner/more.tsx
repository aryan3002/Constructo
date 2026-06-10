/**
 * More (Tab 5) — profile + company + sign out. The long tail (Team, Reconcile,
 * Payments, Permits, Exports, Reports) is phased to later H4 work and stays
 * web-primary for heavy desk work (Owner.md §6.6 / §8); this MVP screen ships
 * identity + the sign-out path.
 */
import { useRouter } from 'expo-router'

import { useAuth } from '../../../src/auth/AuthContext'
import { useT } from '../../../src/i18n/I18nProvider'
import { SPACE } from '../../../src/theme/tokens'
import { Body, BodyStrong, Card, H1, Mono, Screen, SettingsGroup, SettingsRow, Small } from '../../../src/ui'

const STR = {
  en: {
    title: 'More',
    profile: 'Profile',
    company: 'Company',
    role: 'Role',
    phone: 'Phone',
    signOut: 'Sign out',
    search: 'Search',
    searchSub: 'Find any event, site or person across the record',
    foresight: 'Foresight',
    foresightSub: 'Portfolio rollup across all your sites',
    webNote: 'Team, Reconciliation, Payments, Permits and Exports stay on the web dashboard for now — built for desk-altitude work.',
  },
  hi: {
    title: 'और',
    profile: 'प्रोफ़ाइल',
    company: 'कंपनी',
    role: 'भूमिका',
    phone: 'फ़ोन',
    signOut: 'साइन आउट',
    search: 'खोज',
    searchSub: 'रिकॉर्ड में कोई भी इवेंट, साइट या व्यक्ति खोजें',
    foresight: 'दूरदृष्टि',
    foresightSub: 'सभी साइटों का पोर्टफोलियो सार',
    webNote: 'टीम, मिलान, भुगतान, परमिट और एक्सपोर्ट फ़िलहाल वेब डैशबोर्ड पर हैं — गहरे डेस्क-कार्य के लिए।',
  },
} as const

const ROLE_LABEL: Record<string, { en: string; hi: string }> = {
  owner: { en: 'Owner', hi: 'मालिक' },
  pm: { en: 'Project Manager', hi: 'प्रोजेक्ट मैनेजर' },
  accountant: { en: 'Accountant', hi: 'लेखाकार' },
  procurement: { en: 'Procurement', hi: 'खरीद' },
  supervisor: { en: 'Supervisor', hi: 'सुपरवाइज़र' },
}

export default function More() {
  const { lang } = useT()
  const { me, signOut } = useAuth()
  const router = useRouter()
  const t = STR[lang]

  async function onSignOut() {
    await signOut()
    router.replace('/')
  }

  const roleLabel = me?.role ? (ROLE_LABEL[me.role]?.[lang] ?? me.role) : '—'

  return (
    <Screen>
      <H1>{t.title}</H1>

      <Card>
        <Small muted style={{ letterSpacing: 1 }}>{t.profile.toUpperCase()}</Small>
        <BodyStrong style={{ marginTop: SPACE.xs, fontSize: 20, lineHeight: 26 }}>
          {me?.name ?? '—'}
        </BodyStrong>
        <Body muted style={{ marginTop: 2 }}>{roleLabel}</Body>
        {me?.phone ? (
          <Mono muted style={{ marginTop: SPACE.sm }}>{t.phone}: {me.phone}</Mono>
        ) : null}
      </Card>

      <SettingsGroup>
        <SettingsRow
          icon="search"
          title={t.search}
          subtitle={t.searchSub}
          onPress={() => router.push('/(contractor)/owner/search')}
        />
        <SettingsRow
          icon="trending-up"
          title={t.foresight}
          subtitle={t.foresightSub}
          last
          onPress={() => router.push('/(contractor)/owner/foresight')}
        />
      </SettingsGroup>

      <Card>
        <Small muted style={{ letterSpacing: 1 }}>{t.company.toUpperCase()}</Small>
        <Mono style={{ marginTop: SPACE.xs }}>{me?.company_id ?? '—'}</Mono>
      </Card>

      <Card>
        <Body muted>{t.webNote}</Body>
      </Card>

      <SettingsGroup>
        <SettingsRow
          icon="log-out"
          title={t.signOut}
          tone="risk"
          hideChevron
          last
          onPress={onSignOut}
        />
      </SettingsGroup>
    </Screen>
  )
}
