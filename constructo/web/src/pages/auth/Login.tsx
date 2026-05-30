import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { ApiError } from '../../api/client'
import { useT } from '../../i18n'
import { Body, Button, Display, Micro, Small, ThemeProvider } from '../../ui'
import { AuthCard, TextField } from './fields'

const DEV_OTP = '000000'

/**
 * Phone + OTP login (no passwords). Two steps so it reads like the SMS flow
 * users expect: enter phone -> "Send code" -> enter code -> "Sign in". A
 * "Resend code" affordance gives re-OTP recovery. The dev OTP stays 000000 and
 * the field is prefilled in dev so a tester is one tap from in.
 */
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

export function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')
  const t = useT()
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState(DEV_OTP)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!phone.trim()) {
      setError(t('auth.error.phone_required'))
      return
    }
    setLoading(true)
    try {
      await authApi.requestOtp(phone)
      setStep('otp')
    } catch {
      // Sending is a dev no-op; still advance so login isn't blocked.
      setStep('otp')
    } finally {
      setLoading(false)
    }
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await authApi.login(phone, otp)
      // If we came from an invite link, return there to accept it.
      if (next) {
        navigate(next, { replace: true })
        return
      }
      // A brand-new owner hasn't named their company yet -> first-run flow.
      // Other roles (and returning owners) go straight to their app.
      const me = await authApi.me()
      if (me.role === 'owner' && !hasOnboarded(me.id)) {
        navigate('/welcome', { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.error.generic'))
    } finally {
      setLoading(false)
    }
  }

  async function resend() {
    setError(null)
    try {
      await authApi.requestOtp(phone)
    } catch {
      /* dev no-op */
    }
  }

  return (
    <ThemeProvider defaultTheme="site">
      <AuthCard>
        <Micro className="font-semibold uppercase tracking-widest text-primary-deep">
          {t('app.name')}
        </Micro>
        <Display as="h1" className="mt-1 !text-h1">
          {t('auth.action.sign_in')}
        </Display>
        <Body className="mt-1 text-text-mute">
          <Small as="span">{t('auth.tagline')}</Small>
        </Body>

        {step === 'phone' ? (
          <form onSubmit={sendCode} className="mt-6 space-y-4" noValidate>
            <TextField
              label={t('auth.phone.label')}
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              required
              mono
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('auth.phone.placeholder')}
            />
            {error && (
              <p role="alert" className="font-body text-small font-medium text-risk">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" block disabled={loading}>
              {loading ? t('auth.action.sending') : t('auth.action.send_code')}
            </Button>
          </form>
        ) : (
          <form onSubmit={signIn} className="mt-6 space-y-4" noValidate>
            <Body className="text-small text-text-mute">
              {t('auth.code_sent', { phone })}
            </Body>
            <TextField
              label={t('auth.otp.label')}
              name="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              mono
              className="tracking-widest"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              hint={t('auth.otp.hint', { code: DEV_OTP })}
            />
            {error && (
              <p role="alert" className="font-body text-small font-medium text-risk">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" block disabled={loading}>
              {loading ? t('auth.action.signing_in') : t('auth.action.sign_in')}
            </Button>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setStep('phone')
                  setError(null)
                }}
                className="min-h-tap font-body text-small font-semibold text-text-mute hover:text-text"
              >
                {t('auth.action.change_phone')}
              </button>
              <button
                type="button"
                onClick={resend}
                className="min-h-tap font-body text-small font-semibold text-primary-deep hover:underline"
              >
                {t('auth.action.resend')}
              </button>
            </div>
          </form>
        )}
      </AuthCard>
    </ThemeProvider>
  )
}
