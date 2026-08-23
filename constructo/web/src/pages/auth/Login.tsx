import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { api } from '../../api/client'
import { useT } from '../../i18n'
import { Body, Button, Display, Small } from '../../ui'
import { AuthLayout, useAuthGuide } from './AuthLayout'
import { mapAuthError, type AuthErrorAction, type AuthErrorView } from './authErrors'
import { AuthError, OtpField, PhoneField, ResendCode, StepDots } from './fields'
import { isValidIndianMobile, maskPhone, toE164 } from './phone'
import { useCountdown } from './useCountdown'

/** Per-user "owner first-run complete" flag (local; the flow itself is the gate). */
export function markOnboarded(userId: string): void {
  try {
    localStorage.setItem(`cstk.onboarded.${userId}`, 'true')
  } catch {
    /* private mode */
  }
}

function hasOnboarded(userId: string): boolean {
  try {
    return localStorage.getItem(`cstk.onboarded.${userId}`) === 'true'
  } catch {
    return false
  }
}

/**
 * An owner is "set up" if they completed first-run on this device (local flag)
 * OR the backend already has a site for them. The backend check keeps a real,
 * data-backed owner (e.g. signing in on a new device, or the demo seed owner)
 * out of the first-run flow instead of pushing them to /welcome to re-name a
 * company they already have.
 */
async function ownerIsSetUp(userId: string): Promise<boolean> {
  if (hasOnboarded(userId)) return true
  try {
    const sites = await api.listSites()
    if (sites.items.length > 0) {
      markOnboarded(userId) // remember so we skip the backend check next time
      return true
    }
  } catch {
    /* can't tell -> fall through to first-run (safe default) */
  }
  return false
}

/**
 * Builder / site-team sign-in (spec §7). Two steps that read like the SMS flow
 * users expect: phone (fixed +91, 10 digits) -> "Continue" -> 6-digit one-time
 * code, which auto-submits on the 6th digit (the "Sign in" button stays for
 * keyboard users). No passwords; the dev OTP is never pre-filled, only hinted.
 */
export function Login() {
  return (
    <AuthLayout steps="signin">
      <LoginForm />
    </AuthLayout>
  )
}

function LoginForm() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')
  const t = useT()
  const { openGuide } = useAuthGuide()
  const { seconds, start } = useCountdown()

  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [digits, setDigits] = useState('')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState<'idle' | 'sending' | 'checking' | 'verified'>('idle')
  const [error, setError] = useState<AuthErrorView | null>(null)
  const [resent, setResent] = useState(false)

  const phone = toE164(digits)
  const phoneValid = isValidIndianMobile(digits)

  function toPhoneStep() {
    setStep('phone')
    setOtp('')
    setError(null)
    setResent(false)
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    if (!phoneValid || busy !== 'idle') return
    setError(null)
    setBusy('sending')
    try {
      await authApi.requestOtp(phone)
    } catch (err) {
      // Sending is a server-side no-op until SMS is wired, so an API error
      // must not block sign-in. Only an unreachable network stops us here.
      if (err instanceof TypeError) {
        setError(mapAuthError(err))
        setBusy('idle')
        return
      }
    }
    setBusy('idle')
    setResent(false)
    start()
    setStep('otp')
  }

  async function signIn(code: string) {
    if (code.length !== 6 || busy !== 'idle') return
    setError(null)
    setBusy('checking')
    try {
      await authApi.login(phone, code)
      setBusy('verified')
      // If we came from an invite link, return there to accept it.
      if (next) {
        navigate(next, { replace: true })
        return
      }
      // A brand-new owner with no site yet -> first-run flow. Other roles, and
      // owners who already have a company/site (returning or seeded), go
      // straight to their app.
      const me = await authApi.me()
      if (me.role === 'owner' && !(await ownerIsSetUp(me.id))) {
        navigate('/welcome', { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    } catch (err) {
      setError(mapAuthError(err))
      setOtp('')
      setBusy('idle')
    }
  }

  async function resend() {
    setError(null)
    setOtp('')
    try {
      await authApi.requestOtp(phone)
    } catch {
      /* dev no-op */
    }
    setResent(true)
    start()
  }

  function onErrorAction(action: AuthErrorAction) {
    switch (action) {
      case 'help':
        openGuide(error?.helpSection)
        break
      case 'changeNumber':
        toPhoneStep()
        break
      case 'retry':
        setError(null)
        break
      default:
        break
    }
  }

  if (step === 'phone') {
    return (
      <form onSubmit={sendCode} className="space-y-5" noValidate>
        <StepDots n={1} total={2} />
        <div>
          <Display as="h1" className="!text-h1">
            {t('auth.phone.title')}
          </Display>
          <Small className="mt-1">{t('auth.no_password')}</Small>
        </div>
        <PhoneField
          label={t('auth.phone.label')}
          hint={t('auth.phone.hint')}
          digits={digits}
          onChange={setDigits}
          error={!!error}
          autoFocus
        />
        <AuthError view={error} onAction={onErrorAction} />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          disabled={!phoneValid || busy !== 'idle'}
        >
          {busy === 'sending' ? t('auth.action.sending') : t('auth.action.continue')}
        </Button>
      </form>
    )
  }

  const checking = busy === 'checking' || busy === 'verified'
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void signIn(otp)
      }}
      className="space-y-5"
      noValidate
    >
      <StepDots n={2} total={2} />
      <div>
        <Display as="h1" className="!text-h1">
          {t('auth.otp.title')}
        </Display>
        <Body className="mt-1 text-small text-text-mute">
          {t('auth.otp.sent_to', { phone: maskPhone(phone) })}
          {' · '}
          <button
            type="button"
            onClick={toPhoneStep}
            className="inline-flex min-h-tap items-center font-semibold text-text underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-control"
          >
            {t('auth.action.change_phone')}
          </button>
        </Body>
      </div>
      <OtpField
        label={t('auth.otp.label')}
        hint={import.meta.env.DEV ? t('auth.otp.hint', { code: '000000' }) : undefined}
        value={otp}
        onChange={(v) => {
          setOtp(v)
          if (error) setError(null)
        }}
        onComplete={(v) => void signIn(v)}
        error={!!error}
        disabled={checking}
        autoFocus
      />
      <AuthError view={error} onAction={onErrorAction} />
      <Button type="submit" variant="primary" size="lg" block disabled={otp.length !== 6 || checking}>
        {busy === 'verified'
          ? t('auth.verified')
          : busy === 'checking'
            ? t('auth.checking')
            : t('auth.action.sign_in')}
      </Button>
      <ResendCode seconds={seconds} onResend={resend} resent={resent} busy={checking} />
    </form>
  )
}
