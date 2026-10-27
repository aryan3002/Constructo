import { useEffect, useState } from 'react'
import { authApi, clearToken, isAuthenticated } from '../../api/auth'
import { ApiError } from '../../api/client'
import { useT } from '../../i18n'
import { Body, Button, Display, H2, Small } from '../../ui'
import { CheckCircleIcon } from '../../ui/icons'
import { AuthLayout } from './AuthLayout'
import { mapAuthError, type AuthErrorAction, type AuthErrorView } from './authErrors'
import { AuthError, OtpField, PhoneField } from './fields'
import { isValidIndianMobile, maskPhone, toE164 } from './phone'

type Step = 'phone' | 'otp' | 'stepup' | 'confirm' | 'done'

/** A sign-in error, with "no account" said plainly for this page. */
function signInError(err: unknown): AuthErrorView {
  if (err instanceof ApiError && err.code === 'not_registered') {
    return { messageKey: 'delete.err.no_account', action: 'changeNumber' }
  }
  return mapAuthError(err)
}

/**
 * Public account deletion (Google Play's deletion URL, App Store 5.1.1(v)).
 * Works for every role, homeowners included, outside the login gate:
 *   phone → sign-in code (the normal login; an unknown number has no account)
 *   → step-up code → confirm → DELETE /api/v1/users/me → signed out → done.
 * Someone already signed in on this browser starts at the step-up code.
 */
export function DeleteAccount() {
  const t = useT()
  const [step, setStep] = useState<Step>(() => (isAuthenticated() ? 'stepup' : 'phone'))
  const [digits, setDigits] = useState('')
  const [phone, setPhone] = useState<string | null>(null)
  const [otp, setOtp] = useState('')
  const [stepUpToken, setStepUpToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AuthErrorView | null>(null)

  // Entering the step-up step: learn whose account this is and send the code.
  useEffect(() => {
    if (step !== 'stepup') return
    let alive = true
    void (async () => {
      try {
        const me = await authApi.me()
        if (alive) setPhone(me.phone)
        await authApi.stepUpRequestOtp()
      } catch (err) {
        if (!alive) return
        if (err instanceof ApiError && err.status === 401) {
          // The saved login has ended: sign in again.
          clearToken()
          setStep('phone')
        } else {
          setError(mapAuthError(err))
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [step])

  function resetCode() {
    setOtp('')
    setError(null)
  }

  async function sendLoginCode(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidIndianMobile(digits) || busy) return
    setBusy(true)
    resetCode()
    const e164 = toE164(digits)
    try {
      await authApi.requestOtp(e164)
    } catch (err) {
      // Sending is a server no-op until SMS is wired; only a dead network stops us.
      if (err instanceof TypeError) {
        setError(mapAuthError(err))
        setBusy(false)
        return
      }
    }
    setPhone(e164)
    setBusy(false)
    setStep('otp')
  }

  async function signIn(code: string) {
    if (code.length !== 6 || busy || !phone) return
    setBusy(true)
    setError(null)
    try {
      // The normal login — never signup: deleting must not create an account.
      await authApi.login(phone, code)
      setOtp('')
      setStep('stepup')
    } catch (err) {
      setError(signInError(err))
      setOtp('')
    } finally {
      setBusy(false)
    }
  }

  async function verifyStepUp(code: string) {
    if (code.length !== 6 || busy) return
    setBusy(true)
    setError(null)
    try {
      const { token } = await authApi.stepUpVerify(code)
      setStepUpToken(token)
      setOtp('')
      setStep('confirm')
    } catch (err) {
      setError(mapAuthError(err))
      setOtp('')
    } finally {
      setBusy(false)
    }
  }

  async function deleteNow() {
    if (!stepUpToken || busy) return
    setBusy(true)
    setError(null)
    try {
      await authApi.deleteAccount(stepUpToken)
      await authApi.logout()
      clearToken()
      setStep('done')
    } catch (err) {
      setError(mapAuthError(err))
      // A used or expired step-up token can't be retried: ask for a new code.
      setStepUpToken(null)
      setStep('stepup')
    } finally {
      setBusy(false)
    }
  }

  function onErrorAction(action: AuthErrorAction) {
    if (action === 'changeNumber') {
      resetCode()
      setStep('phone')
    } else if (action === 'retry') {
      setError(null)
    }
  }

  const devHint = import.meta.env.DEV ? t('auth.otp.hint', { code: '000000' }) : undefined

  if (step === 'done') {
    return (
      <AuthLayout title={t('delete.menu')}>
        <div className="space-y-4 text-center" role="status">
          <span className="mx-auto block text-4xl text-ok" aria-hidden>
            <CheckCircleIcon />
          </span>
          <Display as="h1" className="!text-h1">
            {t('delete.done_title')}
          </Display>
          <Body className="text-text-mute">{t('delete.done_body')}</Body>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t('delete.menu')}>
      <div className="space-y-5">
        <div>
          <Display as="h1" className="!text-h1">
            {t('delete.title')}
          </Display>
          <Body className="mt-1 text-text-mute">{t('delete.intro')}</Body>
        </div>

        <section className="rounded-card border border-line bg-paper-2 p-4">
          <H2 as="h2" className="!text-body font-semibold">
            {t('delete.what_title')}
          </H2>
          <ul className="mt-2 list-disc space-y-1 pl-5 font-body text-small text-text">
            <li>{t('delete.what1')}</li>
            <li>{t('delete.what2')}</li>
            <li>{t('delete.what3')}</li>
            <li className="font-semibold">{t('delete.what4')}</li>
          </ul>
        </section>

        {step === 'phone' ? (
          <form onSubmit={sendLoginCode} className="space-y-4" noValidate>
            <H2 as="h2">{t('delete.signin_title')}</H2>
            <PhoneField
              label={t('auth.phone.label')}
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
              disabled={!isValidIndianMobile(digits) || busy}
            >
              {busy ? t('auth.action.sending') : t('auth.action.continue')}
            </Button>
          </form>
        ) : null}

        {step === 'otp' && phone ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void signIn(otp)
            }}
            className="space-y-4"
            noValidate
          >
            <H2 as="h2">{t('delete.otp_title')}</H2>
            <Small>{t('auth.otp.sent_to', { phone: maskPhone(phone) })}</Small>
            <OtpField
              label={t('auth.otp.label')}
              hint={devHint}
              value={otp}
              onChange={setOtp}
              onComplete={(v) => void signIn(v)}
              error={!!error}
              disabled={busy}
              autoFocus
            />
            <AuthError view={error} onAction={onErrorAction} />
            <Button type="submit" variant="primary" size="lg" block disabled={otp.length !== 6 || busy}>
              {busy ? t('auth.checking') : t('auth.action.sign_in')}
            </Button>
          </form>
        ) : null}

        {step === 'stepup' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void verifyStepUp(otp)
            }}
            className="space-y-4"
            noValidate
          >
            <H2 as="h2">{t('delete.stepup_title')}</H2>
            {phone ? <Small>{t('delete.stepup_body', { phone: maskPhone(phone) })}</Small> : null}
            <OtpField
              label={t('auth.otp.label')}
              hint={devHint}
              value={otp}
              onChange={setOtp}
              onComplete={(v) => void verifyStepUp(v)}
              error={!!error}
              disabled={busy}
              autoFocus
            />
            <AuthError view={error} onAction={onErrorAction} />
            <Button type="submit" variant="primary" size="lg" block disabled={otp.length !== 6 || busy}>
              {busy ? t('auth.checking') : t('delete.stepup_action')}
            </Button>
          </form>
        ) : null}

        {step === 'confirm' && phone ? (
          <div className="space-y-4">
            <H2 as="h2">{t('delete.confirm_title')}</H2>
            <Body>{t('delete.confirm_body', { phone: maskPhone(phone) })}</Body>
            <AuthError view={error} onAction={onErrorAction} />
            <Button variant="danger" size="lg" block onClick={() => void deleteNow()} disabled={busy}>
              {busy ? t('delete.deleting') : t('delete.confirm_action')}
            </Button>
            <a
              href="/"
              className="block text-center font-body text-small font-semibold text-text underline underline-offset-4"
            >
              {t('delete.cancel')}
            </a>
          </div>
        ) : null}
      </div>
    </AuthLayout>
  )
}
