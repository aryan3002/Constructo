/**
 * PhoneOtpFlow — the two-step "your number → the code" body shared by the
 * builder login and the homeowner login. The screen supplies copy, the
 * `verify` call and what to do on success; the flow owns the steps, the
 * countdown, the error card and the CalmVerify settle.
 *
 *   Step 1/2  Your phone number   [+91 | 98765 43210]  hint      (Continue)
 *   Step 2/2  Enter the code      "We texted a 6-digit code to +91 … · Change number"
 *             [□ □ □ □ □ □]  auto-submits · Resend in 30s · dev hint
 *             → CalmVerify (breathing dots → drawn check) → onVerified()
 */
import { useCallback, useState, type ReactNode } from 'react'
import { Pressable, View } from 'react-native'

import { authApi } from '../../api/auth'
import { useT } from '../../i18n/I18nProvider'
import { SPACE, TAP } from '../../theme/tokens'
import { Body, BodyStrong, Button, CalmVerify, FadeInUp, Small, type VerifyPhase } from '../../ui'
import {
  isValidIndianMobile,
  mapAuthError,
  maskPhone,
  toE164,
  type AuthErrorAction,
  type AuthErrorView,
} from '../auth.util'
import { useCountdown } from '../useCountdown'
import { AuthError } from './AuthError'
import { AuthFrame, useAuthGuide } from './AuthFrame'
import { OtpField } from './OtpField'
import { PhoneField } from './PhoneField'
import { ResendCode } from './ResendCode'
import { useAuthLinkColor } from './useAuthLinkColor'

export interface PhoneOtpFlowProps {
  /** Step-1 title (e.g. "Your phone number" / "Welcome back"). */
  phoneTitle: string
  phoneSubtitle?: ReactNode
  phoneHint: string
  /**
   * Verify the code. Resolve to `null` on success, or to an `AuthErrorView`
   * for a client-side rejection (e.g. "not a homeowner"). Backend / network
   * failures may simply throw — they're mapped via `mapAuthError`.
   */
  verify: (phoneE164: string, otp: string) => Promise<AuthErrorView | null>
  /** Fired once the drawn check has settled — time to leave the auth group. */
  onVerified: () => void
  /** Colour of the CalmVerify check (sage on Daylight, ok-green on Neev). */
  verifyColor: string
  /** Error-card actions the SCREEN handles (useJoinCode / signIn …). */
  onErrorAction?: (action: AuthErrorAction) => void
  footer?: ReactNode
  serifTitle?: boolean
}

export function PhoneOtpFlow(props: PhoneOtpFlowProps) {
  const { t } = useT()
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [digits, setDigits] = useState('')

  const title = step === 'phone' ? props.phoneTitle : t('auth.otpTitle')
  const phone = toE164(digits)

  return (
    <AuthFrame
      back
      step={{ n: step === 'phone' ? 1 : 2, total: 2 }}
      title={title}
      subtitle={
        step === 'phone' ? (
          props.phoneSubtitle
        ) : (
          <SentTo phone={phone} onChange={() => setStep('phone')} />
        )
      }
      guideSection="otp"
      footer={props.footer}
      serifTitle={props.serifTitle}
    >
      <FlowBody {...props} step={step} setStep={setStep} digits={digits} setDigits={setDigits} />
    </AuthFrame>
  )
}

function SentTo({ phone, onChange }: { phone: string; onChange: () => void }) {
  const { t } = useT()
  const link = useAuthLinkColor()
  return (
    <View style={{ gap: SPACE.xs }}>
      <Body muted>{t('auth.otpSentTo', { phone: maskPhone(phone) })}</Body>
      <Pressable
        accessibilityRole="button"
        onPress={onChange}
        style={({ pressed }) => ({ minHeight: TAP - 12, justifyContent: 'center', alignSelf: 'flex-start', opacity: pressed ? 0.7 : 1 })}
      >
        <BodyStrong color={link}>{t('auth.changeNumber')}</BodyStrong>
      </Pressable>
    </View>
  )
}

function FlowBody({
  step,
  setStep,
  digits,
  setDigits,
  phoneHint,
  verify,
  onVerified,
  verifyColor,
  onErrorAction,
}: PhoneOtpFlowProps & {
  step: 'phone' | 'otp'
  setStep: (s: 'phone' | 'otp') => void
  digits: string
  setDigits: (d: string) => void
}) {
  const { t } = useT()
  const guide = useAuthGuide()
  const { seconds, start } = useCountdown()

  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [resent, setResent] = useState(false)
  const [error, setError] = useState<AuthErrorView | null>(null)
  const [verifyPhase, setVerifyPhase] = useState<VerifyPhase | null>(null)

  const valid = isValidIndianMobile(digits)
  const phone = toE164(digits)

  async function sendCode(isResend = false) {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      await authApi.requestOtp(phone)
      start()
      setResent(isResend)
      setStep('otp')
    } catch (e) {
      setError(mapAuthError(e, t))
    } finally {
      setBusy(false)
    }
  }

  const onComplete = useCallback(
    async (code: string) => {
      setVerifyPhase('checking')
      setError(null)
      try {
        const rejection = await verify(phone, code)
        if (rejection) {
          setVerifyPhase(null)
          setOtp('')
          setError(rejection)
          return
        }
        setVerifyPhase('verified')
      } catch (e) {
        setVerifyPhase(null)
        setOtp('')
        setError(mapAuthError(e, t))
      }
    },
    [phone, verify, t],
  )

  function handleAction(action: AuthErrorAction) {
    if (action === 'changeNumber') {
      setError(null)
      setOtp('')
      setStep('phone')
      return
    }
    if (action === 'help') {
      guide.open(error?.helpSection)
      return
    }
    onErrorAction?.(action)
  }

  if (step === 'phone') {
    return (
      <FadeInUp key="phone" duration={240} style={{ gap: SPACE.lg }}>
        <PhoneField
          digits={digits}
          onChange={(d) => {
            setDigits(d)
            if (error) setError(null)
          }}
          hint={phoneHint}
          error={!!error}
          autoFocus
          onSubmit={() => void sendCode()}
        />
        <AuthError view={error} onAction={handleAction} />
        <Button
          title={t('auth.continue')}
          block
          size="lg"
          loading={busy}
          disabled={!valid}
          onPress={() => void sendCode()}
        />
      </FadeInUp>
    )
  }

  if (verifyPhase) {
    return (
      <CalmVerify
        phase={verifyPhase}
        checkingLabel={t('auth.checking')}
        verifiedLabel={t('auth.verified')}
        color={verifyColor}
        onSettled={onVerified}
      />
    )
  }

  return (
    <FadeInUp key="otp" duration={240} style={{ gap: SPACE.lg }}>
      <OtpField
        value={otp}
        onChange={(v) => {
          setOtp(v)
          if (error) setError(null)
        }}
        onComplete={(v) => void onComplete(v)}
        error={!!error}
        autoFocus
      />
      <AuthError view={error} onAction={handleAction} />
      <ResendCode seconds={seconds} busy={busy} resent={resent} onResend={() => void sendCode(true)} />
      {__DEV__ ? <Small muted>{t('auth.devOtpHint')}</Small> : null}
    </FadeInUp>
  )
}
