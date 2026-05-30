/**
 * Homeowner join — redeem the join code your builder shared, with phone + OTP.
 * On success the homeowner lands on the calm Daylight home.
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

export default function Join() {
  const { t } = useT()
  const { theme } = useTheme()
  const router = useRouter()
  const { refresh } = useAuth()

  const [joinCode, setJoinCode] = useState('')
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

  async function join() {
    setBusy(true)
    setError(null)
    try {
      await authApi.joinAsHomeowner(joinCode.trim(), phone, otp)
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
        <Display>{t('auth.joinTitle')}</Display>
        <Small muted>{t('auth.joinSubtitle')}</Small>
      </View>

      <View style={{ gap: SPACE.md, marginTop: SPACE.xl }}>
        <Small muted>{t('auth.joinCodeLabel')}</Small>
        <TextInput
          value={joinCode}
          onChangeText={setJoinCode}
          autoCapitalize="none"
          autoFocus
          style={inputStyle}
          placeholder="abc123…"
          placeholderTextColor={theme.colors.textMute}
        />
        <Small muted>{t('auth.phoneLabel')}</Small>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          style={inputStyle}
          placeholderTextColor={theme.colors.textMute}
        />
        <Small muted>{t('auth.otpLabel')}</Small>
        <TextInput
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          maxLength={6}
          style={[inputStyle, { letterSpacing: 8, textAlign: 'center' }]}
          placeholder="••••••"
          placeholderTextColor={theme.colors.textMute}
        />
        <Small muted>{t('auth.devOtpHint')}</Small>
        <Button title={t('auth.joinCta')} block loading={busy} onPress={join} />
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
