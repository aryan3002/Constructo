/**
 * Staff phone + OTP login (the contractor/builder entry). Two steps: enter
 * phone → request code → enter the 6-digit OTP. Dev OTP is 000000.
 */
import { useState } from 'react'
import { TextInput, View } from 'react-native'
import { Link, useRouter } from 'expo-router'

import { authApi } from '../../src/api/auth'
import { ApiError } from '../../src/api/client'
import { useAuth } from '../../src/auth/AuthContext'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../src/theme/tokens'
import { Body, Button, Display, Screen, Small } from '../../src/ui'

export default function Login() {
  const { t } = useT()
  const { theme } = useTheme()
  const router = useRouter()
  const { refresh } = useAuth()

  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('+91')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputStyle = {
    minHeight: TAP,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radii.control,
    paddingHorizontal: SPACE.lg,
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
    fontSize: 18,
  }

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
    setBusy(true)
    setError(null)
    try {
      await authApi.login(phone, otp)
      await refresh()
      router.replace('/')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <View style={{ marginTop: SPACE.xxl, gap: SPACE.sm }}>
        <Display>{t('auth.welcome')}</Display>
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
        ) : (
          <>
            <Small muted>{t('auth.otpLabel')}</Small>
            <TextInput
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              autoFocus
              maxLength={6}
              style={[inputStyle, { letterSpacing: 8, textAlign: 'center' }]}
              placeholder="••••••"
              placeholderTextColor={theme.colors.textMute}
            />
            <Small muted>{t('auth.devOtpHint')}</Small>
            <Button title={t('auth.verify')} block loading={busy} onPress={verify} />
          </>
        )}
        {error ? <Small color={theme.colors.risk}>{error}</Small> : null}
      </View>

      <View style={{ marginTop: SPACE.xl, alignItems: 'center' }}>
        <Link href="/(auth)/join" asChild>
          <Body color={theme.colors.accentDeep}>{t('auth.haveJoinCode')}</Body>
        </Link>
      </View>
    </Screen>
  )
}
