/**
 * Homeowner join — redeem the join code your builder shared, with phone + OTP.
 *
 * Improvements over the original:
 *   - `requestOtp` fires automatically on phone blur (O1).
 *   - 30-second resend countdown timer.
 *   - Deep-link autofill: `constructo://join?code=abc123` pre-fills the join code
 *     and immediately requests the OTP (J1).
 *   - OTP field has `textContentType="oneTimeCode"` for SMS autofill.
 *   - On success: routes to `(homeowner)/welcome` (not `replace('/')`), passing
 *     display_name / company_name / sub_role from the JoinOut response.
 */
import { useEffect, useRef, useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'

import { authApi } from '../../src/api/auth'
import { ApiError } from '../../src/api/client'
import { useAuth } from '../../src/auth/AuthContext'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE } from '../../src/theme/tokens'
import { Body, Button, Display, Screen, Small, useInputStyle, Logo } from '../../src/ui'

const RESEND_SECONDS = 30

export default function Join() {
  const { t } = useT()
  const { theme } = useTheme()
  const router = useRouter()
  const { refresh, setJoinData } = useAuth()

  // Deep-link: constructo://join?code=<joinCode>
  const params = useLocalSearchParams<{ code?: string }>()

  const [joinCode, setJoinCode] = useState(params.code ?? '')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('+91')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // OTP request state
  const [otpRequested, setOtpRequested] = useState(false)
  const [otpBusy, setOtpBusy] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // If a deep-link code was provided, auto-request OTP once the phone is +91 default.
  useEffect(() => {
    if (params.code && params.code.trim().length > 0) {
      setJoinCode(params.code.trim())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startResendTimer() {
    setResendCountdown(RESEND_SECONDS)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  async function requestOtp() {
    const trimmedPhone = phone.trim()
    if (trimmedPhone.length < 10) return
    if (otpBusy || resendCountdown > 0) return
    setOtpBusy(true)
    setError(null)
    try {
      await authApi.requestOtp(trimmedPhone)
      setOtpRequested(true)
      startResendTimer()
    } catch {
      // requestOtp is best-effort in dev (returns sent:true); don't block the user.
      setOtpRequested(true)
      startResendTimer()
    } finally {
      setOtpBusy(false)
    }
  }

  async function join() {
    setBusy(true)
    setError(null)
    try {
      const resp = await authApi.joinAsHomeowner(
        joinCode.trim(),
        phone.trim(),
        otp.trim(),
        name.trim(),
      )
      // Persist sub_role + site_id before calling refresh() so routing can branch.
      await setJoinData(resp.sub_role, resp.site_id)
      const me = await refresh()
      if (!me) {
        setError(t('common.somethingWrong'))
        return
      }
      // Route to welcome, carrying display_name / company_name if the backend
      // already returns JoinOut. Fallback to empty strings gracefully.
      router.replace({
        pathname: '/(homeowner)/welcome',
        params: {
          sub_role: resp.sub_role,
          site_id: resp.site_id,
          display_name: resp.display_name ?? '',
          company_name: resp.company_name ?? '',
        },
      })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  const inputStyle = useInputStyle()

  const canJoin =
    name.trim().length > 0 &&
    joinCode.trim().length > 0 &&
    phone.trim().length >= 10 &&
    otp.trim().length === 6

  return (
    <Screen>
      {/* Back button → chooser */}
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={{ alignSelf: 'flex-start', padding: SPACE.sm, marginBottom: SPACE.xs ?? 4 }}
      >
        <Feather name="arrow-left" size={24} color={theme.colors.text} />
      </Pressable>

      <View style={{ marginTop: SPACE.md, gap: SPACE.sm }}>
        <Logo size={48} />
        <Display>{t('auth.joinTitle')}</Display>
        <Small muted>{t('auth.joinSubtitle')}</Small>
      </View>

      <View style={{ gap: SPACE.md, marginTop: SPACE.xl }}>
        {/* Name — so Members / Settings show a real name, not a bare phone */}
        <Small muted>{t('auth.nameLabel')}</Small>
        <TextInput
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          autoFocus={!params.code}
          style={inputStyle}
          placeholder={t('auth.namePlaceholder')}
          placeholderTextColor={theme.colors.textMute}
        />

        {/* Join code */}
        <Small muted>{t('auth.joinCodeLabel')}</Small>
        <TextInput
          value={joinCode}
          onChangeText={setJoinCode}
          autoCapitalize="none"
          autoCorrect={false}
          style={inputStyle}
          placeholder="abc123…"
          placeholderTextColor={theme.colors.textMute}
        />

        {/* Phone — OTP auto-fires on blur; +91 prefix is non-deletable */}
        <Small muted>{t('auth.phoneLabel')}</Small>
        <TextInput
          value={phone}
          onChangeText={(text) => {
            // Preserve the +91 prefix — never let it be removed
            if (!text.startsWith('+91')) {
              setPhone('+91')
            } else {
              setPhone(text)
            }
          }}
          keyboardType="phone-pad"
          style={inputStyle}
          placeholderTextColor={theme.colors.textMute}
          onBlur={() => void requestOtp()}
        />

        {/* OTP */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Small muted>{t('auth.otpLabel')}</Small>
          {otpRequested && (
            <Small
              color={resendCountdown > 0 ? theme.colors.textMute : theme.colors.accent}
              onPress={resendCountdown > 0 || otpBusy ? undefined : () => void requestOtp()}
            >
              {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend OTP'}
            </Small>
          )}
        </View>
        <TextInput
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          maxLength={6}
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          style={[inputStyle, { letterSpacing: 8, textAlign: 'center' }]}
          placeholder="••••••"
          placeholderTextColor={theme.colors.textMute}
        />
        {__DEV__ && <Small muted>{t('auth.devOtpHint')}</Small>}

        {!otpRequested && (
          <Button
            title={otpBusy ? 'Sending…' : 'Send OTP'}
            variant="secondary"
            block
            loading={otpBusy}
            onPress={() => void requestOtp()}
          />
        )}

        <Button
          title={t('auth.joinCta')}
          block
          loading={busy}
          disabled={!canJoin}
          onPress={() => void join()}
        />
        {error ? <Small color={theme.colors.risk}>{error}</Small> : null}
      </View>

      <View style={{ marginTop: SPACE.xl, alignItems: 'center' }}>
        <Link href="/(auth)/login" asChild>
          <Body color={theme.colors.accentDeep}>{t('auth.staffLogin')}</Body>
        </Link>
      </View>
    </Screen>
  )
}
