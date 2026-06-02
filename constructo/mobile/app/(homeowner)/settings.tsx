/**
 * Settings hub — the Calm Cockpit list of rows with *live* subtitles
 * (handoff §5). Each row shows its current value at a glance: Language →
 * "English"/"हिन्दी", Notifications → current cadence, Members → "3 people".
 * Members & Notifications are PUSHED screens (declared `href:null` in the Tabs
 * layout). Premium Feather icons + chevrons, warm-paper tokens, no emoji, no %.
 *
 * Reached from the Home hero avatar (→ /settings). Language toggle and Sign out
 * live here too. Strings follow the per-screen en/hi pattern (the language
 * mechanism still comes from the shared provider).
 */
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { homeowner } from '../../src/api/client'
import { useAuth } from '../../src/auth/AuthContext'
import { useT } from '../../src/i18n/I18nProvider'
import type { Language } from '../../src/api/types'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE } from '../../src/theme/tokens'
import {
  Display,
  Micro,
  Screen,
  SettingsGroup,
  SettingsRow,
  Small,
} from '../../src/ui'
import { summaryCadence, type Lang } from './_settings.util'

const STR = {
  en: {
    title: 'Settings',
    account: 'ACCOUNT',
    household: 'HOUSEHOLD',
    app: 'APP',
    language: 'Language',
    members: 'Members',
    membersSub: (n: number) =>
      n === 1 ? '1 person' : `${n} people`,
    membersSubUnknown: 'Your household',
    notifications: 'Notifications',
    profile: 'Account',
    profileSub: (phone: string) => phone,
    profileSubUnknown: 'Phone & profile',
    signOut: 'Sign out',
    english: 'English',
    hindi: 'हिन्दी',
    footer: 'Constructo · Daylight',
  },
  hi: {
    title: 'सेटिंग्स',
    account: 'खाता',
    household: 'परिवार',
    app: 'ऐप',
    language: 'भाषा',
    members: 'सदस्य',
    membersSub: (n: number) => `${n} सदस्य`,
    membersSubUnknown: 'आपका परिवार',
    notifications: 'सूचनाएँ',
    profile: 'खाता',
    profileSub: (phone: string) => phone,
    profileSubUnknown: 'फ़ोन और प्रोफ़ाइल',
    signOut: 'साइन आउट',
    english: 'English',
    hindi: 'हिन्दी',
    footer: 'Constructo · Daylight',
  },
} as const

export default function Settings() {
  const { lang, setLang } = useT()
  const { signOut, siteId, me } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()
  const L: Lang = lang === 'hi' ? 'hi' : 'en'
  const tx = STR[L]

  // Live subtitle data: household size + the caller's own notif cadence.
  const rosterQ = useQuery({
    queryKey: ['household-roster', siteId],
    queryFn: () => homeowner.roster(siteId ?? undefined),
  })
  const selfQ = useQuery({
    queryKey: ['homeowner-members-self'],
    queryFn: () => homeowner.members(),
  })

  const memberCount = rosterQ.data?.length ?? null
  const selfPrefs = selfQ.data?.[0]?.notif_prefs
  const notifSub = selfQ.isSuccess ? summaryCadence(selfPrefs, L) : undefined

  async function onSignOut() {
    await signOut()
    router.replace('/')
  }

  function toggleLanguage() {
    const next: Language = lang === 'en' ? 'hi' : 'en'
    setLang(next)
  }

  return (
    <Screen>
      <Display>{tx.title}</Display>

      {/* HOUSEHOLD */}
      <View style={{ gap: SPACE.sm }}>
        <Micro style={{ letterSpacing: 2, color: theme.colors.textMute }}>
          {tx.household}
        </Micro>
        <SettingsGroup>
          <SettingsRow
            icon="users"
            title={tx.members}
            subtitle={
              memberCount != null ? tx.membersSub(memberCount) : tx.membersSubUnknown
            }
            onPress={() => router.push('/(homeowner)/members')}
          />
          <SettingsRow
            icon="bell"
            title={tx.notifications}
            subtitle={notifSub}
            last
            onPress={() => router.push('/(homeowner)/notifications')}
          />
        </SettingsGroup>
      </View>

      {/* APP */}
      <View style={{ gap: SPACE.sm }}>
        <Micro style={{ letterSpacing: 2, color: theme.colors.textMute }}>
          {tx.app}
        </Micro>
        <SettingsGroup>
          <SettingsRow
            icon="globe"
            title={tx.language}
            subtitle={lang === 'hi' ? tx.hindi : tx.english}
            last
            onPress={toggleLanguage}
          />
        </SettingsGroup>
      </View>

      {/* ACCOUNT */}
      <View style={{ gap: SPACE.sm }}>
        <Micro style={{ letterSpacing: 2, color: theme.colors.textMute }}>
          {tx.account}
        </Micro>
        <SettingsGroup>
          <SettingsRow
            icon="user"
            title={tx.profile}
            subtitle={me?.phone ?? tx.profileSubUnknown}
            hideChevron
            onPress={() => {
              /* No profile-edit screen yet — honest no-op. */
            }}
          />
          <SettingsRow
            icon="log-out"
            title={tx.signOut}
            tone="risk"
            hideChevron
            last
            onPress={() => void onSignOut()}
          />
        </SettingsGroup>
      </View>

      <Small muted style={{ textAlign: 'center' }}>
        {tx.footer}
      </Small>
    </Screen>
  )
}
