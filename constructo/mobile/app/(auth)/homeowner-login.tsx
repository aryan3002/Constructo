/**
 * Homeowner phone+OTP login — the returning-user path.
 *
 * Existing homeowners (who have already joined via a join code) log in here
 * with just their phone number. After OTP verification we confirm the backend
 * role is "homeowner" — if the number has no homeowner account we sign back
 * out immediately and prompt them to use the join-code flow instead.
 */
import { useEffect, useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Link, Redirect, useRouter } from 'expo-router'

import { authApi } from '../../src/api/auth'
import { ApiError } from '../../src/api/client'
import { useAuth } from '../../src/auth/AuthContext'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE } from '../../src/theme/tokens'
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

export default function HomeownerLogin() {
  const { t } = useT()
  const { theme } = useTheme()
  const router = useRouter()
  const { refresh, signOut, status, role } = useAuth()

  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('+91')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The calm-verify settle: null = entering the code; 'checking' = breathing
  // dots; 'verified' = the drawn check. `settled` flips once the check has
  // settled, releasing the redirect home (so we never route mid-animation).
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
      if (me.role !== 'homeowner') {
        // This phone belongs to a contractor account — sign back out and warn.
        await signOut()
        setVerifyPhase(null)
        setStep('phone')
        setOtp('')
        setError(t('auth.notHomeowner'))
        return
      }
      // Homeowner confirmed — let CalmVerify draw the check and settle, then the
      // gated Redirect below leaves the auth group.
      setVerifyPhase('verified')
    } catch (e) {
      setVerifyPhase(null)
      setOtp('')
      setError(e instanceof ApiError ? e.message : t('common.somethingWrong'))
    }
  }

  // Auto-verify the moment the 6th digit lands — the code settles, no button tap.
  useEffect(() => {
    if (step === 'otp' && otp.length === 6 && verifyPhase === null) {
      void verify()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, step, verifyPhase])

  // Leave the auth group once authed as homeowner — but NOT mid-settle: during
  // our own verify we hold until the check has drawn (`settled`). A returning
  // session that is already authed on mount (verifyPhase === null) redirects at
  // once.
  const authedHomeowner = status === 'authed' && role === 'homeowner'
  if (authedHomeowner && (verifyPhase === null || settled)) {
    return <Redirect href="/(homeowner)/home" />
  }

  return (
    <Screen>
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
        <Display>{t('auth.homeownerLoginTitle')}</Display>
        {/* Reassure before asking: what we'll do, then a quiet relief line. */}
        <Small muted>{t('auth.homeownerLoginSubtitle')}</Small>
        <Small color={theme.colors.quiet}>{t('auth.noPassword')}</Small>
      </View>

      <View style={{ gap: SPACE.md, marginTop: SPACE.xl }}>
        {step === 'phone' ? (
          <>
            <Small muted>{t('auth.phoneLabel')}</Small>
            <TextInput
              value={phone}
              onChangeText={(text) => {
                if (!text.startsWith('+91')) {
                  setPhone('+91')
                } else {
                  setPhone(text)
                }
              }}
              keyboardType="phone-pad"
              autoFocus
              style={inputStyle}
              placeholder={t('auth.phonePlaceholder')}
              placeholderTextColor={theme.colors.textMute}
            />
            <Button
              title={t('auth.sendCode')}
              block
              loading={busy}
              onPress={() => void sendCode()}
            />
          </>
        ) : verifyPhase ? (
          // The settle — breathing dots → drawn sage check. No spinner.
          <CalmVerify
            phase={verifyPhase}
            checkingLabel={t('auth.checking')}
            verifiedLabel={t('auth.verified')}
            color={theme.colors.accent}
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
        <Link href="/(auth)/join" asChild>
          <Body color={theme.colors.accent}>{t('auth.newHere')}</Body>
        </Link>
      </View>
    </Screen>
  )
}
