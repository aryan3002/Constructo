// One-time AI consent (S7, Apple 5.1.2(i)) for the web console. Sits inside
// RequireAuth: until the signed-in person has agreed (`me.ai_consent_at`,
// recorded once on the server — the same flag the app reads), the console
// shows this screen instead of the page. "Not now" explains the console can't
// be used without it and offers sign out or account deletion.
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi, clearToken, getToken } from '../api/auth'
import { legalUrls, USE_MOCKS } from '../api/config'
import { useT } from '../i18n'
import { Body, Button, Display, H2, Small, ThemeProvider } from '../ui'

type GateState = 'checking' | 'ok' | 'ask' | 'declined' | 'error'

// The login (token) whose agreement is already known, so moving between pages
// doesn't re-check every time. A new sign-in checks again.
let agreedToken: string | null = null

/** Test hook: forget the cached agreement. */
export function resetAiConsentCache(): void {
  agreedToken = null
}

export function AiConsentGate({ children }: { children: ReactNode }) {
  const token = getToken()
  const known = USE_MOCKS || (token !== null && token === agreedToken)
  const [state, setState] = useState<GateState>(known ? 'ok' : 'checking')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (state !== 'checking') return
    let alive = true
    authApi
      .me()
      .then((me) => {
        if (!alive) return
        if (me.ai_consent_at) {
          agreedToken = token
          setState('ok')
        } else {
          setState('ask')
        }
      })
      // A 401 is handled by the API layer; anything else can be retried.
      .catch(() => alive && setState('error'))
    return () => {
      alive = false
    }
  }, [state, token, attempt])

  if (state === 'ok') return <>{children}</>
  return (
    <ThemeProvider defaultTheme="site">
      <main className="min-h-screen bg-paper px-4 py-10">
        <div className="mx-auto w-full max-w-lg rounded-sheet border border-line bg-card p-6 shadow-card sm:p-8">
          <ConsentBody
            state={state}
            onAgreed={() => {
              agreedToken = token
              setState('ok')
            }}
            onDecline={() => setState('declined')}
            onBack={() => setState('ask')}
            onRetry={() => {
              setState('checking')
              setAttempt((n) => n + 1)
            }}
          />
        </div>
      </main>
    </ThemeProvider>
  )
}

function ConsentBody({
  state,
  onAgreed,
  onDecline,
  onBack,
  onRetry,
}: {
  state: Exclude<GateState, 'ok'>
  onAgreed: () => void
  onDecline: () => void
  onBack: () => void
  onRetry: () => void
}) {
  const t = useT()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const { privacy } = legalUrls()

  async function agree() {
    setSaving(true)
    setFailed(false)
    try {
      await authApi.recordAiConsent()
      onAgreed()
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  function signOut() {
    void authApi.logout()
    clearToken()
    agreedToken = null
    navigate('/login', { replace: true })
  }

  if (state === 'checking') {
    return <Body className="text-text-mute">{t('consent.checking')}</Body>
  }
  if (state === 'error') {
    return (
      <div className="space-y-4">
        <Body role="alert">{t('consent.check_failed')}</Body>
        <Button variant="primary" block onClick={onRetry}>
          {t('auth.action.retry')}
        </Button>
      </div>
    )
  }
  if (state === 'declined') {
    return (
      <div className="space-y-5">
        <Display as="h1" className="!text-h1">
          {t('consent.declined_title')}
        </Display>
        <Body>{t('consent.declined')}</Body>
        <div className="space-y-2">
          <Button variant="primary" size="lg" block onClick={onBack}>
            {t('consent.back')}
          </Button>
          <Button variant="secondary" block onClick={signOut}>
            {t('consent.sign_out')}
          </Button>
          <Button variant="ghost" block onClick={() => navigate('/delete-account')}>
            {t('consent.delete')}
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-5">
      <div>
        <Display as="h1" className="!text-h1">
          {t('consent.title')}
        </Display>
        <Body className="mt-1 text-text-mute">{t('consent.intro')}</Body>
      </div>
      <dl className="space-y-3 rounded-card border border-line bg-paper-2 p-4">
        {(
          [
            ['consent.what_title', 'consent.what'],
            ['consent.who_title', 'consent.who'],
            ['consent.why_title', 'consent.why'],
          ] as const
        ).map(([title, body]) => (
          <div key={title}>
            <dt>
              <H2 as="h2" className="!text-body font-semibold">
                {t(title)}
              </H2>
            </dt>
            <dd className="font-body text-body text-text">{t(body)}</dd>
          </div>
        ))}
      </dl>
      {privacy ? (
        <a
          href={privacy}
          target="_blank"
          rel="noopener noreferrer"
          className="font-body text-small font-semibold text-text underline underline-offset-4"
        >
          {t('consent.policy')}
        </a>
      ) : null}
      {failed ? (
        <Small role="alert" className="block text-risk">
          {t('auth.err.generic')}
        </Small>
      ) : null}
      <div className="space-y-2">
        <Button variant="primary" size="lg" block onClick={() => void agree()} disabled={saving}>
          {saving ? t('consent.agreeing') : t('consent.agree')}
        </Button>
        <Button variant="secondary" block onClick={onDecline}>
          {t('consent.not_now')}
        </Button>
      </div>
    </div>
  )
}
