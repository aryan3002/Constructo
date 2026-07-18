/**
 * Settings hub — the Calm Cockpit list of rows with *live* subtitles
 * (handoff §5). Each row shows its current value at a glance: Language →
 * "English"/"हिन्दी", Notifications → current cadence, Members → "3 people".
 * Members & Notifications are PUSHED screens (declared `href:null` in the Tabs
 * layout). Premium Feather icons + chevrons, warm-paper tokens, no emoji, no %.
 *
 * Matches the prototype composition: profile card (avatar + name + role +
 * language badge) at the top, then HOUSEHOLD / APP / ACCOUNT section groups.
 * Reached from the Home hero avatar (→ /settings). Language toggle and Sign out
 * live here too. Strings follow the per-screen en/hi pattern (the language
 * mechanism still comes from the shared provider).
 */
import { useEffect, useState } from 'react'
import { Alert, Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { homeowner } from '../../src/api/client'
import { useAuth } from '../../src/auth/AuthContext'
import { useDeleteAccount } from '../../src/auth/useDeleteAccount'
import { useT } from '../../src/i18n/I18nProvider'
import type { Language } from '../../src/api/types'
import { AP, SPACE } from '../../src/theme/tokens'
import { useTheme } from '../../src/theme/ThemeProvider'
import {
  Avatar,
  BodyStrong,
  Card,
  Eyebrow,
  FadeInUp,
  Screen,
  SettingsGroup,
  SettingsRow,
  Small,
  StepUpModal,
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
    designTasteSub: 'Tell Neev what you love',
    profile: 'Account',
    profileSub: (phone: string) => phone,
    profileSubUnknown: 'Phone & profile',
    signOut: 'Sign out',
    deleteAccount: 'Delete my account',
    deleteAccountConfirmTitle: 'Delete your account?',
    deleteAccountConfirmMsg:
      "This removes your name and phone number. Records you're part of stay with your household.",
    deleteAccountConfirmOk: 'Delete',
    deleteAccountConfirmCancel: 'Cancel',
    deleteAccountError: 'Could not delete your account. Please try again.',
    english: 'English',
    hindi: 'हिन्दी',
    footer: 'Neev · your calm view of the build',
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
    designTasteSub: 'नींव को बताएं आपको क्या पसंद है',
    profile: 'खाता',
    profileSub: (phone: string) => phone,
    profileSubUnknown: 'फ़ोन और प्रोफ़ाइल',
    signOut: 'साइन आउट',
    deleteAccount: 'मेरा खाता हटाएँ',
    deleteAccountConfirmTitle: 'अपना खाता हटाएँ?',
    deleteAccountConfirmMsg:
      'इससे आपका नाम और फ़ोन नंबर हट जाएगा। आप जिन रिकॉर्ड का हिस्सा हैं, वे आपके परिवार के पास रहेंगे।',
    deleteAccountConfirmOk: 'हटाएँ',
    deleteAccountConfirmCancel: 'रद्द करें',
    deleteAccountError: 'खाता हटाया नहीं जा सका। कृपया फिर कोशिश करें।',
    english: 'English',
    hindi: 'हिन्दी',
    footer: 'नींव · आपका शांत निर्माण दृष्टिकोण',
  },
} as const

export default function Settings() {
  const { lang, setLang } = useT()
  const { signOut, siteId, me } = useAuth()
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
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

  const { stepUpVisible, beginDelete, cancelStepUp, onStepUpVerified } = useDeleteAccount({
    afterDeleteHref: '/',
    genericErrorMessage: tx.deleteAccountError,
  })

  function confirmDeleteAccount() {
    Alert.alert(tx.deleteAccountConfirmTitle, tx.deleteAccountConfirmMsg, [
      { text: tx.deleteAccountConfirmCancel, style: 'cancel' },
      { text: tx.deleteAccountConfirmOk, style: 'destructive', onPress: beginDelete },
    ])
  }

  function toggleLanguage() {
    const next: Language = lang === 'en' ? 'hi' : 'en'
    setLang(next)
    // Regenerate the AI design profile summary in the new language.
    // Fire-and-forget — UI will refresh on next visit to the Design tab.
    void homeowner.saveDesignProfile({}).catch(() => undefined)
  }

  return (
    <Screen floatingNav>
      {/* Profile card — avatar + name + role badge + language toggle.
          Mirrors the prototype header: a warm card with the person's
          identity at a glance and a quick language-switch badge. */}
      <FadeInUp style={{ gap: SPACE.sm }}>
        <Card
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.md,
          }}
        >
          <Avatar name={me?.name} size={52} />
          <View style={{ flex: 1, gap: 2 }}>
            <BodyStrong numberOfLines={1}>{me?.name ?? tx.profile}</BodyStrong>
            <Small muted numberOfLines={1}>{me?.phone ?? tx.profileSubUnknown}</Small>
          </View>
          {/* Language badge — taps to toggle, shows current language. */}
          <Pressable
            onPress={toggleLanguage}
            accessibilityRole="button"
            accessibilityLabel={tx.language}
            style={{
              height: 28,
              paddingHorizontal: SPACE.md,
              borderRadius: theme.radii.pill,
              backgroundColor: AP.chip,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Small style={{ color: AP.onChip, fontWeight: '700' }}>
              {lang === 'hi' ? 'हिं / EN' : 'EN / हिं'}
            </Small>
          </Pressable>
        </Card>
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

      {/* ACCOUNT — sign out + delete account. */}
      <FadeInUp delay={120} style={{ gap: SPACE.sm }}>
        <Eyebrow>{tx.account}</Eyebrow>
        <SettingsGroup>
          <SettingsRow
            icon="log-out"
            title={tx.signOut}
            tone="risk"
            hideChevron
            onPress={() => void onSignOut()}
          />
          <SettingsRow
            icon="trash-2"
            title={tx.deleteAccount}
            tone="risk"
            hideChevron
            last
            onPress={confirmDeleteAccount}
          />
        </SettingsGroup>
      </FadeInUp>

      {/* Footer — shield icon + calm brand line, matching the prototype. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: SPACE.xs,
        }}
      >
        <Feather name="shield" size={13} color={c.textMute} />
        <Small muted style={{ textAlign: 'center' }}>
          {tx.footer}
        </Small>
      </View>

      <StepUpModal
        visible={stepUpVisible}
        onVerified={onStepUpVerified}
        onCancel={cancelStepUp}
      />
    </Screen>
  )
}
