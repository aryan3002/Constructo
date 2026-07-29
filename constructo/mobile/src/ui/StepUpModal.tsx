/**
 * StepUpModal — cross-platform OTP prompt for sensitive mutations.
 *
 * When the backend returns 403 `step_up_required`, the caller renders this
 * modal. The user enters their 6-digit OTP and the modal resolves via
 * `onVerified(stepUpToken)`. On cancel `onCancel()` is called.
 *
 * Platform strategy:
 *   iOS   — We could use `Alert.prompt`, but it fires immediately and cannot be
 *            pre-seeded with an error message on retry. Using a plain Modal here
 *            keeps the UX identical on both platforms and lets us show the
 *            "Sending code…" / error states clearly.
 *   Android — `Alert.prompt` is not available; this Modal is the only approach.
 *
 * Lifecycle:
 *   1. Parent mounts <StepUpModal visible onVerified onCancel />.
 *   2. On mount (useEffect) the modal calls `authApi.stepUpRequestOtp()` so the
 *      code is sent before the user even picks up their phone.
 *   3. User enters 6 digits and taps "Verify" → `authApi.stepUpVerify(otp)`.
 *   4. On success: `onVerified(step_up_token)` is called; parent unmounts modal
 *      and retries the original mutation with the token.
 *   5. On error: the modal stays open with an error message so the user can try
 *      again.  "Resend" triggers another `stepUpRequestOtp()` call.
 */
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native'

import { authApi } from '../api/auth'
import { ApiError } from '../api/client'
import { useT } from '../i18n/I18nProvider'
import { useTheme } from '../theme/ThemeProvider'
import { SPACE, TAP } from '../theme/tokens'
import { Body, BodyStrong, Button, H2, Micro, Small } from './index'
import { useInputStyle } from './useInputStyle'

export interface StepUpModalProps {
  /** Controls visibility — set to false to unmount after onVerified/onCancel. */
  visible: boolean
  /** Called with the short-lived step_up_token once OTP is verified. */
  onVerified: (token: string) => void
  /** Called when the user taps "Cancel". */
  onCancel: () => void
}

type Phase = 'sending' | 'ready' | 'verifying' | 'error'

export function StepUpModal({ visible, onVerified, onCancel }: StepUpModalProps) {
  const { t } = useT()
  const { theme } = useTheme()
  const inputStyle = useInputStyle()

  const [otp, setOtp] = useState('')
  const [phase, setPhase] = useState<Phase>('sending')
  const [error, setError] = useState<string | null>(null)
  const [devHint, setDevHint] = useState<string | null>(null)
  const inputRef = useRef<TextInput>(null)

  // Request OTP as soon as modal opens (or re-opens).
  useEffect(() => {
    if (!visible) return
    setOtp('')
    setError(null)
    setPhase('sending')
    void requestOtp()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  async function requestOtp() {
    setPhase('sending')
    setError(null)
    try {
      const resp = await authApi.stepUpRequestOtp()
      if (resp.dev_otp) setDevHint(resp.dev_otp)
      setPhase('ready')
      // Auto-focus the input once it becomes interactive.
      setTimeout(() => inputRef.current?.focus(), 100)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t('common.somethingWrong'),
      )
      setPhase('error')
    }
  }

  async function handleVerify() {
    const code = otp.trim()
    if (code.length !== 6) return
    setPhase('verifying')
    setError(null)
    try {
      const { step_up_token } = await authApi.stepUpVerify(code)
      onVerified(step_up_token)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t('common.somethingWrong'),
      )
      setOtp('')
      setPhase('ready')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const canVerify = otp.trim().length === 6 && (phase === 'ready' || phase === 'error')
  const busy = phase === 'sending' || phase === 'verifying'

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={t('stepUp.cancel')}
        >
          {/* Prevent taps on the sheet from closing it */}
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: theme.colors.card,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: SPACE.lg,
              paddingBottom: SPACE.xxl,
              gap: SPACE.md,
            }}
          >
            {/* Handle */}
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.colors.line,
                alignSelf: 'center',
                marginBottom: SPACE.sm,
              }}
            />

            <H2>{t('stepUp.title')}</H2>
            <Body muted style={{ lineHeight: 22 }}>
              {t('stepUp.body')}
            </Body>

            {/* OTP input */}
            <View style={{ gap: SPACE.xs }}>
              <Small muted>{t('stepUp.otpLabel')}</Small>
              <TextInput
                ref={inputRef}
                style={[
                  inputStyle,
                  {
                    fontSize: 24,
                    letterSpacing: 8,
                    textAlign: 'center',
                    fontVariant: ['tabular-nums'],
                  },
                ]}
                value={otp}
                onChangeText={(v) => {
                  // Allow digits only, max 6
                  setOtp(v.replace(/\D/g, '').slice(0, 6))
                  setError(null)
                }}
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                returnKeyType="done"
                onSubmitEditing={() => void handleVerify()}
                editable={!busy}
                placeholderTextColor={theme.colors.textMute}
                placeholder="000000"
                accessibilityLabel={t('stepUp.otpLabel')}
              />
            </View>

            {/* Dev hint — __DEV__ only. The server still returns `dev_otp` in prod
                while DEV_OTP_ENABLED is on, so gating on the response alone would
                print the code to real users. Matches app/(auth)/login.tsx. */}
            {__DEV__ && devHint ? (
              <Micro muted style={{ textAlign: 'center' }}>
                {t('auth.devOtpHint')}
              </Micro>
            ) : null}

            {/* Error */}
            {error ? (
              <Body color={theme.colors.risk}>{error}</Body>
            ) : null}

            {/* Loading during OTP send */}
            {phase === 'sending' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                <ActivityIndicator size="small" color={theme.colors.accent} />
                <Small muted>{t('stepUp.sending')}</Small>
              </View>
            ) : null}

            {/* Verify button */}
            <Button
              title={phase === 'verifying' ? t('stepUp.verifying') : t('stepUp.verify')}
              variant="accent"
              block
              disabled={!canVerify || busy}
              loading={phase === 'verifying'}
              onPress={() => void handleVerify()}
            />

            {/* Resend + Cancel row */}
            <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
              <Button
                title={t('stepUp.resend')}
                variant="ghost"
                style={{ flex: 1 }}
                disabled={busy}
                onPress={() => {
                  setOtp('')
                  setError(null)
                  void requestOtp()
                }}
              />
              <Button
                title={t('stepUp.cancel')}
                variant="ghost"
                style={{ flex: 1 }}
                disabled={phase === 'verifying'}
                onPress={onCancel}
              />
            </View>

            {/* "What is this?" explanation */}
            <View
              style={{
                backgroundColor: theme.colors.bg,
                borderRadius: theme.radii.chip,
                padding: SPACE.md,
              }}
            >
              <BodyStrong style={{ marginBottom: 4 }}>{t('stepUp.whyTitle')}</BodyStrong>
              <Body muted style={{ lineHeight: 20 }}>
                {t('stepUp.whyBody')}
              </Body>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}
