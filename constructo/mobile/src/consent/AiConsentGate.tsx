/**
 * One-time AI consent (S7). Covers the whole app — above every role's
 * navigator, which stays mounted underneath — until the signed-in person
 * agrees; the agreement is recorded on the server once per person. "Not now"
 * explains the app can't be used without it and offers sign out and account
 * deletion instead.
 */
import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useMutation } from '@tanstack/react-query'

import { accountExitHref, deleteConfirmMessageKey } from '../account/account.util'
import { authApi } from '../api/auth'
import { errorText } from '../api/errorText'
import { useAuth } from '../auth/AuthContext'
import { useDeleteAccount } from '../auth/useDeleteAccount'
import { useT } from '../i18n/I18nProvider'
import { LEGAL_LINKS, openLegal } from '../legal/openLegal'
import { ThemeProvider, useTheme } from '../theme/ThemeProvider'
import { SPACE } from '../theme/tokens'
import { Button } from '../ui/Button'
import { confirmDestructive } from '../ui/confirmDestructive'
import { StepUpModal } from '../ui/StepUpModal'
import { showToast } from '../ui/toastBus'
import { ToastProvider } from '../ui/Toast'
import { Body, BodyStrong, Display, Small } from '../ui/Typography'
import { consentTheme, needsAiConsent } from './consent.util'

export function AiConsentGate() {
  const { status, me } = useAuth()
  if (!needsAiConsent(status, me)) return null
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000 }]} accessibilityViewIsModal>
      <ThemeProvider initial={consentTheme(me?.role)}>
        <ToastProvider bottomOffset={24}>
          <ConsentScreen />
        </ToastProvider>
      </ThemeProvider>
    </View>
  )
}

function Point({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ gap: 2 }}>
      <BodyStrong>{title}</BodyStrong>
      <Body>{body}</Body>
    </View>
  )
}

function ConsentScreen() {
  const { t, lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { me, signOut, applyMe } = useAuth()
  const [declined, setDeclined] = useState(false)
  const exitHref = accountExitHref(me?.role)

  const agree = useMutation({
    mutationFn: () => authApi.recordAiConsent(),
    onSuccess: (profile) => applyMe(profile),
    onError: (err) => showToast(errorText(err, lang), { tone: 'error' }),
    meta: { errorHandled: true },
  })

  const { stepUpVisible, beginDelete, cancelStepUp, onStepUpVerified } = useDeleteAccount({
    afterDeleteHref: exitHref,
  })
  const privacy = LEGAL_LINKS.find((l) => l.key === 'privacy')

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
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: SPACE.gutter,
          paddingTop: insets.top + SPACE.xl,
          paddingBottom: insets.bottom + SPACE.xl,
          gap: SPACE.lg,
        }}
      >
        {declined ? (
          <>
            <Display accessibilityRole="header">{t('consent.declinedTitle')}</Display>
            <Body>{t('consent.declined')}</Body>
            <View style={{ flex: 1 }} />
            <View style={{ gap: SPACE.sm }}>
              <Button title={t('consent.back')} block size="lg" onPress={() => setDeclined(false)} />
              <Button title={t('consent.signOut')} variant="secondary" block onPress={() => void onSignOut()} />
              <Button title={t('consent.deleteAccount')} variant="ghost" block onPress={onDelete} />
            </View>
          </>
        ) : (
          <>
            <Display accessibilityRole="header">{t('consent.title')}</Display>
            <Body>{t('consent.intro')}</Body>
            <View
              style={{
                gap: SPACE.md,
                padding: SPACE.lg,
                borderRadius: theme.radii.card,
                borderWidth: 1,
                borderColor: c.line,
                backgroundColor: c.card,
              }}
            >
              <Point title={t('consent.whatTitle')} body={t('consent.what')} />
              <Point title={t('consent.whoTitle')} body={t('consent.who')} />
              <Point title={t('consent.whyTitle')} body={t('consent.why')} />
            </View>
            {privacy ? (
              <Small
                accessibilityRole="link"
                onPress={() => void openLegal('privacy')}
                color={theme.name === 'neev' ? c.text : c.accentDeep}
                style={{ textDecorationLine: 'underline', fontWeight: '600' }}
              >
                {t('consent.policy')}
              </Small>
            ) : null}
            <View style={{ flex: 1 }} />
            <View style={{ gap: SPACE.sm }}>
              <Button
                title={agree.isPending ? t('consent.agreeing') : t('consent.agree')}
                block
                size="lg"
                loading={agree.isPending}
                disabled={agree.isPending}
                onPress={() => agree.mutate()}
              />
              <Button title={t('consent.notNow')} variant="secondary" block onPress={() => setDeclined(true)} />
            </View>
          </>
        )}
      </ScrollView>
      <StepUpModal visible={stepUpVisible} onVerified={onStepUpVerified} onCancel={cancelStepUp} />
    </View>
  )
}
