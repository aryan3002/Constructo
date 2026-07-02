/**
 * Staff phone + OTP login (the contractor/builder entry, reached from the "Who
 * are you?" chooser). Two steps: enter phone → request code → enter the 6-digit
 * OTP. Dev OTP is 000000.
 *
 * Rendered in the **Neev** theme (amber-on-ink) — builders see their brand
 * here even though the auth group default is Daylight, since only staff reach
 * this screen. The themed body lives in `LoginInner` so its `useTheme()` reads
 * the nested Neev provider.
 */
import { useEffect, useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Link, Redirect, useRouter } from 'expo-router'

import { authApi } from '../../src/api/auth'
import { ApiError } from '../../src/api/client'
import { useAuth } from '../../src/auth/AuthContext'
import { useT } from '../../src/i18n/I18nProvider'
import { ThemeProvider, useTheme } from '../../src/theme/ThemeProvider'
import { SPACE } from '../../src/theme/tokens'
import type { Role } from '../../src/api/types'
import {
  Body,
  Button,
  CalmVerify,
  Display,
  Screen,
  Small,
  useInputStyle,
  Logo,
  type VerifyPhase,
} from '../../src/ui'

/**
 * Role → home route. Mirrors the map in app/index.tsx. We navigate to the
 * resolved home DIRECTLY rather than `router.replace('/')`: from inside the
 * `(auth)` Stack a bare `'/'` REPLACE resolves to THIS group's own `index`
 * route (the "Who are you?" chooser), which is exactly the bounce we were
 * chasing — and in some nav states it throws "no route named 'index'".
 */
function homeFor(role: Role | null): string {
  switch (role) {
    case 'owner':
      return '/(contractor)/owner/brief'
    case 'pm':
      return '/(contractor)/pm/dpr'
    case 'supervisor':
      return '/(contractor)/supervisor/home'
    case 'architect':
      return '/(contractor)/architect/home'
    case 'accountant':
      return '/(contractor)/accountant/reconcile'
    case 'labor_contractor':
      return '/(contractor)/mukadam/attendance'
    case 'homeowner':
      return '/(homeowner)/home'
    default:
      // procurement (Tier-2 placeholder) and any future role
      return '/(contractor)'
  }
}

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

  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('+91')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Calm-verify settle (see homeowner-login for the gating rationale).
  const [verifyPhase, setVerifyPhase] = useState<VerifyPhase | null>(null)
  const [settled, setSettled] = useState(false)

  const inputStyle = useInputStyle()

  async function sendCode() {
    setBusy(true)
    setError(null)
    try {
      await authApi.requestOtp(phone)
      setStep('otp')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    setVerifyPhase('checking')
    setError(null)
    try {
      await authApi.login(phone, otp)
      const me = await refresh()
      if (!me) {
        setVerifyPhase(null)
        setOtp('')
        setError(t('common.somethingWrong'))
        return
      }
      // Verified — let CalmVerify settle, then the gated Redirect routes home.
      setVerifyPhase('verified')
    } catch (e) {
      setVerifyPhase(null)
      setOtp('')
      setError(e instanceof ApiError ? e.message : t('common.somethingWrong'))
    }
  }

  // Auto-verify when the 6th digit lands.
  useEffect(() => {
    if (step === 'otp' && otp.length === 6 && verifyPhase === null) {
      void verify()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, step, verifyPhase])

  // Once authed, redirect to the role's real home — but hold through our own
  // verify settle (a returning, already-authed session has verifyPhase === null
  // and redirects at once). Declarative <Redirect> is resolved by the ROOT
  // navigator, so it correctly leaves the (auth) group.
  if (status === 'authed' && (verifyPhase === null || settled)) {
    return <Redirect href={homeFor(role) as never} />
  }

  return (
    <Screen>
      {/* Back button → chooser */}
      <Pressable
        onPress={() => router.canGoBack() ? router.back() : router.replace('/(auth)')}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={{ alignSelf: 'flex-start', padding: SPACE.sm, marginBottom: SPACE.xs ?? 4 }}
      >
        <Feather name="arrow-left" size={24} color={theme.colors.text} />
      </Pressable>

      <View style={{ marginTop: SPACE.md, gap: SPACE.sm }}>
        <Logo size={48} />
        {/* One onboarding type voice: Eczar headline even on the builder screen
            (the ink+marigold "build" theme stays). lineHeight is generous so the
            tall serif ascenders never clip. */}
        <Display style={{ fontFamily: 'Eczar-SemiBold', lineHeight: 44 }}>
          {t('auth.welcome')}
        </Display>
        <Small muted>{t('auth.staffLogin')}</Small>
      </View>

      <View style={{ gap: SPACE.md, marginTop: SPACE.xl }}>
        {step === 'phone' ? (
          <>
            <Small muted>{t('auth.phoneLabel')}</Small>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoFocus
              style={inputStyle}
              placeholder={t('auth.phonePlaceholder')}
              placeholderTextColor={theme.colors.textMute}
            />
            <Button title={t('auth.sendCode')} block loading={busy} onPress={sendCode} />
          </>
        ) : verifyPhase ? (
          // The settle — breathing dots → drawn check (Neev ok-green). No spinner.
          <CalmVerify
            phase={verifyPhase}
            checkingLabel={t('auth.checking')}
            verifiedLabel={t('auth.verified')}
            color={theme.colors.ok}
            onSettled={() => setSettled(true)}
          />
        ) : (
          <>
            <Small muted>{t('auth.otpLabel')}</Small>
            <TextInput
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              autoFocus
              maxLength={6}
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              style={[inputStyle, { letterSpacing: 8, textAlign: 'center' }]}
              placeholder="••••••"
              placeholderTextColor={theme.colors.textMute}
            />
            {__DEV__ && <Small muted>{t('auth.devOtpHint')}</Small>}
          </>
        )}
        {error ? <Small color={theme.colors.risk}>{error}</Small> : null}
      </View>

      <View style={{ marginTop: SPACE.xl, alignItems: 'center' }}>
        <Link href="/(auth)/homeowner-login" asChild>
          <Body color={theme.colors.accentDeep}>{t('auth.homeownerCard')}</Body>
        </Link>
      </View>
    </Screen>
  )
}
