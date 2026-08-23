/**
 * Homeowner sign-in — the RETURNING path (joined before; just the phone now).
 * Daylight theme. After the code checks out we confirm the backend role really
 * is "homeowner" — a builder's number is signed straight back out and offered
 * the right doors instead of a dead end.
 */
import { useCallback, useRef } from 'react'
import { Link, Redirect, useRouter } from 'expo-router'

import { authApi } from '../../src/api/auth'
import { useAuth } from '../../src/auth/AuthContext'
import { PhoneOtpFlow } from '../../src/auth/ui'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { Body, Small } from '../../src/ui'

export default function HomeownerLogin() {
  const { t } = useT()
  const { theme } = useTheme()
  const router = useRouter()
  const { refresh, signOut, status, role } = useAuth()
  const verifying = useRef(false)

  const verify = useCallback(
    async (phone: string, otp: string) => {
      verifying.current = true
      await authApi.login(phone, otp)
      const me = await refresh()
      if (!me) {
        verifying.current = false
        return { message: t('auth.err.generic'), action: 'retry' as const }
      }
      if (me.role !== 'homeowner') {
        // A builder's number: sign back out, explain, and offer the right door.
        await signOut()
        verifying.current = false
        return { message: t('auth.err.not_homeowner'), action: 'useJoinCode' as const }
      }
      return null
    },
    [refresh, signOut, t],
  )

  if (status === 'authed' && role === 'homeowner' && !verifying.current) {
    return <Redirect href="/(homeowner)/home" />
  }

  return (
    <PhoneOtpFlow
      phoneTitle={t('auth.welcomeBack')}
      phoneSubtitle={
        <>
          <Small muted>{t('auth.homeownerLoginSubtitle')}</Small>
          <Small color={theme.colors.quiet}>{t('auth.noPassword')}</Small>
        </>
      }
      phoneHint={t('auth.phoneHintHomeowner')}
      verify={verify}
      verifyColor={theme.colors.accent}
      onVerified={() => router.replace('/(homeowner)/home')}
      onErrorAction={(action) => {
        if (action === 'useJoinCode') router.push('/(auth)/join')
        if (action === 'signIn') router.push('/(auth)/login')
      }}
      footer={
        <Link href="/(auth)/join" asChild>
          <Body color={theme.colors.accent}>{t('auth.firstTime')}</Body>
        </Link>
      }
    />
  )
}
