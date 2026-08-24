/**
 * Homeowner join — redeem the join code your builder shared. Three small steps
 * on one screen instead of four fields and a disabled button:
 *
 *   1/3  Your join code      [code]  "Where do I find my code?" → guide
 *   2/3  About you           [name] [+91 | phone]                 (Send code)
 *   3/3  Enter the code      [□□□□□□] auto-submits · Resend · Change number
 *        → CalmVerify → (homeowner)/welcome with the JoinOut params
 *
 * Deep link `neev://join?code=<joinCode>` pre-fills the code and opens on
 * step 2. The code can't be pre-validated (no preview endpoint) — an
 * `invalid_code` on the final submit jumps back to step 1 with the reason.
 */
import { useCallback, useState } from 'react'
import { TextInput, View, Pressable } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'

import { authApi } from '../../src/api/auth'
import {
  isValidIndianMobile,
  mapAuthError,
  maskPhone,
  toE164,
  type AuthErrorAction,
  type AuthErrorView,
} from '../../src/auth/auth.util'
import { useAuth } from '../../src/auth/AuthContext'
import {
  AuthError,
  AuthFrame,
  OtpField,
  PhoneField,
  ResendCode,
  useAuthGuide,
  useAuthLinkColor,
} from '../../src/auth/ui'
import { useCountdown } from '../../src/auth/useCountdown'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  CalmVerify,
  FadeInUp,
  Small,
  useInputStyle,
  type VerifyPhase,
} from '../../src/ui'

type Step = 1 | 2 | 3

type JoinNavParams = {
  sub_role: string
  site_id: string
  display_name: string
  company_name: string
}

export default function Join() {
  const { t } = useT()
  const router = useRouter()
  const link = useAuthLinkColor()
  const params = useLocalSearchParams<{ code?: string }>()
  const linkedCode = params.code?.trim() ?? ''

  const [step, setStep] = useState<Step>(linkedCode ? 2 : 1)
  const [code, setCode] = useState(linkedCode)
  const [digits, setDigits] = useState('')

  const title =
    step === 1 ? t('auth.joinTitle') : step === 2 ? t('auth.aboutYouTitle') : t('auth.otpTitle')

  return (
    <AuthFrame
      back={step === 1 ? true : () => setStep((s) => (s === 3 ? 2 : 1))}
      step={{ n: step, total: 3 }}
      title={title}
      subtitle={
        step === 1 ? (
          t('auth.joinSub')
        ) : step === 3 ? (
          <SentTo phone={toE164(digits)} onChange={() => setStep(2)} />
        ) : undefined
      }
      guideSection="joinCode"
      footer={
        <Link href="/(auth)/login" asChild>
          <BodyStrong color={link}>{t('auth.staffLink')}</BodyStrong>
        </Link>
      }
    >
      <JoinBody
        step={step}
        setStep={setStep}
        code={code}
        setCode={setCode}
        digits={digits}
        setDigits={setDigits}
        onSignIn={() => router.replace('/(auth)/homeowner-login')}
        onJoined={(nav) => router.replace({ pathname: '/(homeowner)/welcome', params: nav })}
      />
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

function JoinBody({
  step,
  setStep,
  code,
  setCode,
  digits,
  setDigits,
  onSignIn,
  onJoined,
}: {
  step: Step
  setStep: (s: Step) => void
  code: string
  setCode: (c: string) => void
  digits: string
  setDigits: (d: string) => void
  onSignIn: () => void
  onJoined: (nav: JoinNavParams) => void
}) {
  const { t } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const guide = useAuthGuide()
  const link = useAuthLinkColor()
  const inputStyle = useInputStyle()
  const { refresh, setJoinData } = useAuth()
  const { seconds, start } = useCountdown()

  const [name, setName] = useState('')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [resent, setResent] = useState(false)
  const [error, setError] = useState<AuthErrorView | null>(null)
  const [verifyPhase, setVerifyPhase] = useState<VerifyPhase | null>(null)
  const [navTarget, setNavTarget] = useState<JoinNavParams | null>(null)

  const phone = toE164(digits)
  const validPhone = isValidIndianMobile(digits)
  const canSend = name.trim().length > 0 && validPhone

  async function sendCode(isResend = false) {
    if (!canSend || busy) return
    setBusy(true)
    setError(null)
    try {
      await authApi.requestOtp(phone)
      start()
      setResent(isResend)
      setStep(3)
    } catch (e) {
      setError(mapAuthError(e, t))
    } finally {
      setBusy(false)
    }
  }

  const join = useCallback(
    async (otpValue: string) => {
      setVerifyPhase('checking')
      setError(null)
      try {
        const resp = await authApi.joinAsHomeowner(code.trim(), phone, otpValue, name.trim())
        // Persist sub_role + site_id before refresh() so routing can branch.
        await setJoinData(resp.sub_role, resp.site_id)
        const me = await refresh()
        if (!me) {
          setVerifyPhase(null)
          setOtp('')
          setError({ message: t('auth.err.generic'), action: 'retry' })
          return
        }
        setNavTarget({
          sub_role: resp.sub_role,
          site_id: resp.site_id,
          display_name: resp.display_name ?? '',
          company_name: resp.company_name ?? '',
        })
        setVerifyPhase('verified')
      } catch (e) {
        const view = mapAuthError(e, t)
        setVerifyPhase(null)
        setOtp('')
        setError(view)
        // A bad / expired code is a step-1 problem — take them straight there.
        if (view.action === 'backToCode') setStep(1)
      }
    },
    [code, phone, name, setJoinData, refresh, t, setStep],
  )

  function handleAction(action: AuthErrorAction) {
    setError(null)
    if (action === 'backToCode') setStep(1)
    else if (action === 'changeNumber') setStep(2)
    else if (action === 'signIn') onSignIn()
    else if (action === 'help') guide.open(error?.helpSection)
  }

  if (verifyPhase) {
    return (
      <CalmVerify
        phase={verifyPhase}
        checkingLabel={t('auth.checking')}
        verifiedLabel={t('auth.verified')}
        color={c.accent}
        onSettled={() => navTarget && onJoined(navTarget)}
      />
    )
  }

  if (step === 1) {
    return (
      <FadeInUp key="code" duration={240} style={{ gap: SPACE.lg }}>
        <View style={{ gap: SPACE.xs }}>
          <Small muted>{t('auth.joinCodeLabel')}</Small>
          <TextInput
            value={code}
            onChangeText={(v) => {
              setCode(v)
              if (error) setError(null)
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="next"
            onSubmitEditing={() => code.trim() && setStep(2)}
            accessibilityLabel={t('auth.joinCodeLabel')}
            placeholder="abc123"
            placeholderTextColor={c.textMute}
            style={[inputStyle, { fontSize: 18, borderColor: error ? c.risk : c.line }]}
          />
          <Small muted>{t('auth.joinCodeHint')}</Small>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => guide.open('joinCode')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.sm,
            minHeight: TAP - 8,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Feather name="help-circle" size={16} color={link} />
          <BodyStrong color={link}>{t('auth.whereFindCode')}</BodyStrong>
        </Pressable>
        <AuthError view={error} onAction={handleAction} />
        <Button
          title={t('auth.continue')}
          block
          size="lg"
          disabled={code.trim().length === 0}
          onPress={() => setStep(2)}
        />
      </FadeInUp>
    )
  }

  if (step === 2) {
    return (
      <FadeInUp key="about" duration={240} style={{ gap: SPACE.lg }}>
        <View style={{ gap: SPACE.xs }}>
          <Small muted>{t('auth.nameLabel')}</Small>
          <TextInput
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            autoFocus
            returnKeyType="next"
            accessibilityLabel={t('auth.nameLabel')}
            placeholder={t('auth.namePlaceholder')}
            placeholderTextColor={c.textMute}
            style={inputStyle}
          />
          <Small muted>{t('auth.nameHint')}</Small>
        </View>
        <PhoneField
          digits={digits}
          onChange={(d) => {
            setDigits(d)
            if (error) setError(null)
          }}
          hint={t('auth.phoneHintHomeowner')}
          error={!!error}
          onSubmit={() => void sendCode()}
        />
        <AuthError view={error} onAction={handleAction} />
        <Button
          title={t('auth.sendCode')}
          block
          size="lg"
          loading={busy}
          disabled={!canSend}
          onPress={() => void sendCode()}
        />
      </FadeInUp>
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
        onComplete={(v) => void join(v)}
        error={!!error}
        autoFocus
      />
      <AuthError view={error} onAction={handleAction} />
      <ResendCode seconds={seconds} busy={busy} resent={resent} onResend={() => void sendCode(true)} />
      {__DEV__ ? <Small muted>{t('auth.devOtpHint')}</Small> : null}
    </FadeInUp>
  )
}
