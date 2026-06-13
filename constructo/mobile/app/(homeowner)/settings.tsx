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
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { homeowner } from '../../src/api/client'
import { useAuth } from '../../src/auth/AuthContext'
import { useT } from '../../src/i18n/I18nProvider'
import type { Language } from '../../src/api/types'
import { SPACE } from '../../src/theme/tokens'
import {
  BodyLg,
  Display,
  Eyebrow,
  FadeInUp,
  Screen,
  SettingsGroup,
  SettingsRow,
  Small,
} from '../../src/ui'
import { summaryCadence, type Lang } from './_settings.util'
import { POLICY_KEY } from './_storage.util'

const STR = {
  en: {
    title: 'Settings',
    intro: 'A calm place to tune how the home keeps in touch.',
    account: 'ACCOUNT',
    household: 'HOUSEHOLD',
    app: 'APP',
    language: 'Language',
    members: 'Members',
    membersSub: (n: number) =>
      n === 1 ? '1 person' : `${n} people`,
    membersSubUnknown: 'Your household',
    notifications: 'Notifications',
    storage: 'Storage settings',
    storageSub: (days: number | 'all') =>
      days === 'all' ? 'Keep everything' : `Keep last ${days} days`,
    designTaste: 'Design taste',
    designTasteSub: 'Tell Constructo what you love',
    profile: 'Account',
    profileSub: (phone: string) => phone,
    profileSubUnknown: 'Phone & profile',
    signOut: 'Sign out',
    english: 'English',
    hindi: 'हिन्दी',
    footer: 'Constructo',
  },
  hi: {
    title: 'सेटिंग्स',
    intro: 'घर आपसे कैसे जुड़ा रहे, यह शांति से तय करने की जगह।',
    account: 'खाता',
    household: 'परिवार',
    app: 'ऐप',
    language: 'भाषा',
    members: 'सदस्य',
    membersSub: (n: number) => `${n} सदस्य`,
    membersSubUnknown: 'आपका परिवार',
    notifications: 'सूचनाएँ',
    storage: 'स्टोरेज सेटिंग्स',
    storageSub: (days: number | 'all') =>
      days === 'all' ? 'सब कुछ रखें' : `पिछले ${days} दिन रखें`,
    designTaste: 'डिज़ाइन पसंद',
    designTasteSub: 'Constructo को बताएं आपको क्या पसंद है',
    profile: 'खाता',
    profileSub: (phone: string) => phone,
    profileSubUnknown: 'फ़ोन और प्रोफ़ाइल',
    signOut: 'साइन आउट',
    english: 'English',
    hindi: 'हिन्दी',
    footer: 'Constructo',
  },
} as const

export default function Settings() {
  const { lang, setLang } = useT()
  const { signOut, siteId, me } = useAuth()
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

  // Live storage subtitle: read the retention days from the shared policy key.
  const [retentionDays, setRetentionDays] = useState<number | 'all'>(30)
  useEffect(() => {
    void AsyncStorage.getItem(POLICY_KEY).then((raw) => {
      if (!raw) return
      try {
        const parsed = JSON.parse(raw) as { retentionDays?: number | 'all' }
        if (parsed.retentionDays !== undefined) setRetentionDays(parsed.retentionDays)
      } catch {
        /* ignore */
      }
    })
  }, [])

  async function onSignOut() {
    await signOut()
    router.replace('/')
  }

  function toggleLanguage() {
    const next: Language = lang === 'en' ? 'hi' : 'en'
    setLang(next)
  }

  return (
    <Screen floatingNav>
      {/* Calm-on-sand intro — serif title + one reassuring line, like Home. */}
      <FadeInUp style={{ gap: SPACE.xs }}>
        <Display>{tx.title}</Display>
        <BodyLg muted numberOfLines={2}>
          {tx.intro}
        </BodyLg>
      </FadeInUp>

      {/* HOUSEHOLD */}
      <FadeInUp delay={40} style={{ gap: SPACE.sm }}>
        <Eyebrow>{tx.household}</Eyebrow>
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
      </FadeInUp>

      {/* APP */}
      <FadeInUp delay={80} style={{ gap: SPACE.sm }}>
        <Eyebrow>{tx.app}</Eyebrow>
        <SettingsGroup>
          <SettingsRow
            icon="hard-drive"
            title={tx.storage}
            subtitle={tx.storageSub(retentionDays)}
            onPress={() => router.push('/(homeowner)/storage')}
          />
          <SettingsRow
            icon="heart"
            title={tx.designTaste}
            subtitle={tx.designTasteSub}
            onPress={() => router.push('/(homeowner)/design/profile')}
          />
          <SettingsRow
            icon="globe"
            title={tx.language}
            subtitle={lang === 'hi' ? tx.hindi : tx.english}
            last
            onPress={toggleLanguage}
          />
        </SettingsGroup>
      </FadeInUp>

      {/* ACCOUNT */}
      <FadeInUp delay={120} style={{ gap: SPACE.sm }}>
        <Eyebrow>{tx.account}</Eyebrow>
        <SettingsGroup>
          <SettingsRow
            icon="user"
            title={me?.name ?? tx.profile}
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
      </FadeInUp>

      <Small muted style={{ textAlign: 'center' }}>
        {tx.footer}
      </Small>
    </Screen>
  )
}
