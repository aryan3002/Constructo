/**
 * The one Account section every role shows (S6/S7 — store rules): language,
 * privacy policy, terms, sign out and delete account. Built from SettingsRow,
 * which reads the active theme, so it sits right in both the Calm Cockpit
 * (Daylight) and Neev surfaces.
 *
 * Delete account: confirm → step-up code → DELETE /users/me → signed out
 * (useDeleteAccount).
 */
import { View } from 'react-native'
import { useRouter } from 'expo-router'

import { useAuth } from '../auth/AuthContext'
import { useDeleteAccount } from '../auth/useDeleteAccount'
import { useT } from '../i18n/I18nProvider'
import { LEGAL_LINKS, openLegal } from '../legal/openLegal'
import { SPACE } from '../theme/tokens'
import { confirmDestructive } from '../ui/confirmDestructive'
import { SettingsGroup, SettingsRow } from '../ui/SettingsRow'
import { StepUpModal } from '../ui/StepUpModal'
import { Small } from '../ui/Typography'
import {
  accountExitHref,
  deleteConfirmMessageKey,
  languageNameKey,
  otherLanguage,
} from './account.util'

const LEGAL_ICON = { privacy: 'shield', terms: 'file-text' } as const

export function AccountSection({ showTitle = true }: { showTitle?: boolean }) {
  const { lang, setLang, t } = useT()
  const { me, signOut } = useAuth()
  const router = useRouter()
  const exitHref = accountExitHref(me?.role)

  const { stepUpVisible, beginDelete, cancelStepUp, onStepUpVerified } = useDeleteAccount({
    afterDeleteHref: exitHref,
  })

  async function onSignOut() {
    await signOut()
    router.replace(exitHref as never)
  }

  function onDelete() {
    confirmDestructive({
      title: t('account.deleteAccountConfirmTitle'),
      message: t(deleteConfirmMessageKey(me?.role)),
      confirm: t('account.deleteAccountConfirmOk'),
      cancel: t('account.deleteAccountConfirmCancel'),
      onConfirm: beginDelete,
    })
  }

  return (
    <View style={{ gap: SPACE.sm }}>
      {showTitle ? (
        <Small muted style={{ letterSpacing: 1 }}>
          {t('account.accountSection').toUpperCase()}
        </Small>
      ) : null}
      <SettingsGroup>
        <SettingsRow
          icon="globe"
          title={t('account.language')}
          subtitle={t(languageNameKey(lang))}
          last={LEGAL_LINKS.length === 0}
          onPress={() => setLang(otherLanguage(lang))}
        />
        {LEGAL_LINKS.map((l, i) => (
          <SettingsRow
            key={l.key}
            icon={LEGAL_ICON[l.key]}
            title={t(l.labelKey)}
            subtitle={t('account.opensInBrowser')}
            last={i === LEGAL_LINKS.length - 1}
            onPress={() => void openLegal(l.key)}
          />
        ))}
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow
          icon="log-out"
          title={t('account.signOut')}
          tone="risk"
          hideChevron
          onPress={() => void onSignOut()}
        />
        <SettingsRow
          icon="trash-2"
          title={t('account.deleteAccount')}
          tone="risk"
          hideChevron
          last
          onPress={onDelete}
        />
      </SettingsGroup>
      <StepUpModal visible={stepUpVisible} onVerified={onStepUpVerified} onCancel={cancelStepUp} />
    </View>
  )
}
