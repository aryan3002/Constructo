/**
 * Builder / site-team login — phone + one-time code, in the **Neev** theme
 * (ink + marigold) even though the auth group defaults to Daylight: only staff
 * reach this screen. The two-step body is the shared `PhoneOtpFlow`.
 *
 * After a successful verify:
 *   first sign-in on this device → /(contractor)/tour (the role tour)
 *   otherwise                    → homeFor(role)
 * A returning, already-authed session redirects straight home.
 */
import { useCallback, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Link, Redirect, useRouter } from 'expo-router'

import { authApi } from '../../src/api/auth'
import { homeFor, welcomeKey } from '../../src/auth/auth.util'
import { useAuth } from '../../src/auth/AuthContext'
import { PhoneOtpFlow, useAuthLinkColor } from '../../src/auth/ui'
import { useT } from '../../src/i18n/I18nProvider'
import { ThemeProvider, useTheme } from '../../src/theme/ThemeProvider'
import { BodyStrong } from '../../src/ui'

export default function Login() {
  return (
    <ThemeProvider initial="neev">
      <LoginInner />
    </ThemeProvider>
  )
}

function LoginInner() {
  const { t } = useT()
  const { theme } = useTheme()
  const router = useRouter()
  const { refresh, status, role } = useAuth()
  const link = useAuthLinkColor()

  // Where to go once the check has settled (decided inside `verify`).
  const [target, setTarget] = useState<string | null>(null)
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
      let seen = false
      try {
        seen = (await AsyncStorage.getItem(welcomeKey(me.id))) === '1'
      } catch {
        seen = true // can't tell → don't trap the user in a tour
      }
      const isStaff = me.role !== 'homeowner'
      setTarget(isStaff && !seen ? '/(contractor)/tour' : homeFor(me.role))
      return null
    },
    [refresh, t],
  )

  // Already signed in when this screen mounts (deep link / back-nav) → home.
  if (status === 'authed' && !verifying.current) {
    return <Redirect href={homeFor(role) as never} />
  }

  return (
    <PhoneOtpFlow
      phoneTitle={t('auth.staffPhoneTitle')}
      phoneSubtitle={t('auth.noPassword')}
      phoneHint={t('auth.phoneHintStaff')}
      verify={verify}
      verifyColor={theme.colors.ok}
      onVerified={() => router.replace((target ?? homeFor(role)) as never)}
      serifTitle
      footer={
        <Link href="/(auth)/join" asChild>
          <BodyStrong color={link}>{t('auth.homeownerLink')}</BodyStrong>
        </Link>
      }
    />
  )
}
