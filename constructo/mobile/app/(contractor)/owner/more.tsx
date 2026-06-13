/**
 * Account (Tab 5) — identity hub + workspace navigation for the Neev owner shell.
 *
 * Design: warm ink-on-paper, single marigold accent, bilingual en/hi.
 * Rule: "never render an action a person can't take" — every row does something
 * real: in-app push, web deep-link, or language toggle.
 *
 * Sections:
 *   • Profile card   — Avatar (initials) · name · role · company_name · phone
 *   • Workspace      — Team, Spec desk (web), Search, Foresight
 *   • Site           — Permits
 *   • Money          — Reconcile (web), Tally export (web)
 *   • Settings       — Language toggle
 *   • Sign out
 */
import { Linking, View } from 'react-native'
import { useRouter } from 'expo-router'

import { useAuth } from '../../../src/auth/AuthContext'
import { useT } from '../../../src/i18n/I18nProvider'
import { WEB_BASE } from '../../../src/api/config'
import { SPACE } from '../../../src/theme/tokens'
import {
  Avatar,
  Body,
  BodyStrong,
  H1,
  Mono,
  Screen,
  SettingsGroup,
  SettingsRow,
  Small,
} from '../../../src/ui'
import { buildProfileSubtitle, ROUTES } from './_account.util'

// ---------------------------------------------------------------------------
// Web deep-link helpers
// ---------------------------------------------------------------------------
function openWebLink(path: string) {
  const url = `${WEB_BASE}${path}`
  void Linking.openURL(url)
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function AccountHub() {
  const { lang, setLang, t } = useT()
  const { me, signOut } = useAuth()
  const router = useRouter()

  async function onSignOut() {
    await signOut()
    router.replace('/(auth)/login')
  }

  const companyLine = buildProfileSubtitle({
    role: me?.role,
    companyName: me?.company_name,
    lang,
  })
  const nextLang = lang === 'en' ? 'hi' : 'en'
  const langLabel = lang === 'en' ? t('account.languageCurrent') : t('account.languageCurrent')

  return (
    <Screen>
      <H1>{t('account.title')}</H1>

      {/* ── Profile card ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.md,
          paddingVertical: SPACE.md,
        }}
      >
        <Avatar name={me?.name} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <BodyStrong style={{ fontSize: 18, lineHeight: 24 }}>
            {me?.name ?? '—'}
          </BodyStrong>
          <Body muted>{companyLine}</Body>
          {me?.phone ? (
            <Mono muted style={{ marginTop: 2 }}>{me.phone}</Mono>
          ) : null}
        </View>
      </View>

      {/* ── Workspace ── */}
      <Small muted style={{ letterSpacing: 1, marginTop: SPACE.sm }}>
        {t('account.groupWorkspace').toUpperCase()}
      </Small>
      <SettingsGroup style={{ marginTop: SPACE.xs }}>
        <SettingsRow
          icon="users"
          title={t('account.team')}
          subtitle={t('account.teamSub')}
          onPress={() => router.push(ROUTES.team)}
        />
        <SettingsRow
          icon="book-open"
          title={t('account.specDesk')}
          subtitle={t('account.specDeskSub')}
          onPress={() => openWebLink('/spec-desk')}
        />
        <SettingsRow
          icon="search"
          title={t('account.search')}
          subtitle={t('account.searchSub')}
          onPress={() => router.push(ROUTES.search)}
        />
        <SettingsRow
          icon="trending-up"
          title={t('account.foresight')}
          subtitle={t('account.foresightSub')}
          last
          onPress={() => router.push(ROUTES.foresight)}
        />
      </SettingsGroup>

      {/* ── Site ── */}
      <Small muted style={{ letterSpacing: 1, marginTop: SPACE.md }}>
        {t('account.groupSite').toUpperCase()}
      </Small>
      <SettingsGroup style={{ marginTop: SPACE.xs }}>
        <SettingsRow
          icon="file-text"
          title={t('account.permits')}
          subtitle={t('account.permitsSub')}
          onPress={() => router.push(ROUTES.permits)}
        />
        <SettingsRow
          icon="shield"
          title={lang === 'hi' ? 'साइट ऑडिट' : 'Site audit'}
          subtitle={lang === 'hi' ? 'AI गुणवत्ता निरीक्षण' : 'AI quality inspections'}
          onPress={() => router.push(ROUTES.audit)}
        />
        <SettingsRow
          icon="feather"
          title={lang === 'hi' ? 'डिज़ाइन ब्रीफ़' : 'Design briefs'}
          subtitle={lang === 'hi' ? 'प्रति-साइट डिज़ाइन दिशा' : 'Per-site design direction'}
          last
          onPress={() => router.push(ROUTES.design)}
        />
      </SettingsGroup>

      {/* ── Money · web ── */}
      <Small muted style={{ letterSpacing: 1, marginTop: SPACE.md }}>
        {t('account.groupMoney').toUpperCase()}
      </Small>
      <SettingsGroup style={{ marginTop: SPACE.xs }}>
        <SettingsRow
          icon="bar-chart-2"
          title={t('account.reconcile')}
          subtitle={t('account.reconcileSub')}
          onPress={() => openWebLink('/reconcile')}
        />
        <SettingsRow
          icon="download"
          title={t('account.tallyExport')}
          subtitle={t('account.tallyExportSub')}
          last
          onPress={() => openWebLink('/reconcile')}
        />
      </SettingsGroup>

      {/* ── Settings ── */}
      <Small muted style={{ letterSpacing: 1, marginTop: SPACE.md }}>
        {t('account.groupSettings').toUpperCase()}
      </Small>
      <SettingsGroup style={{ marginTop: SPACE.xs }}>
        <SettingsRow
          icon="globe"
          title={t('settings.language')}
          subtitle={langLabel}
          last
          onPress={() => setLang(nextLang)}
        />
      </SettingsGroup>

      {/* ── Sign out ── */}
      <SettingsGroup style={{ marginTop: SPACE.md }}>
        <SettingsRow
          icon="log-out"
          title={t('account.signOut')}
          tone="risk"
          hideChevron
          last
          onPress={onSignOut}
        />
      </SettingsGroup>
    </Screen>
  )
}
