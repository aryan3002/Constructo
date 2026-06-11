import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  authApi,
  isAuthenticated,
  type InvitePreview,
  type Role,
} from '../../api/auth'
import { ApiError } from '../../api/client'
import { useT, type TranslationKey } from '../../i18n'
import { Body, Button, Display, Micro, Small, ThemeProvider } from '../../ui'
import { CheckCircleIcon } from '../../ui/icons'
import { AuthCard } from './fields'

const ROLE_KEY: Record<Role, TranslationKey> = {
  owner: 'invite.role.owner',
  pm: 'invite.role.pm',
  architect: 'invite.role.architect',
  supervisor: 'invite.role.supervisor',
  accountant: 'invite.role.accountant',
  procurement: 'invite.role.procurement',
  labor_contractor: 'invite.role.labor_contractor',
}

const COACHMARK_KEY: Record<Role, TranslationKey> = {
  owner: 'join.coachmark.default',
  pm: 'join.coachmark.pm',
  architect: 'join.coachmark.architect',
  supervisor: 'join.coachmark.supervisor',
  accountant: 'join.coachmark.accountant',
  procurement: 'join.coachmark.procurement',
  labor_contractor: 'join.coachmark.labor_contractor',
}

/**
 * Invitee join screen. Resolves the invite from its token (public preview),
 * requires a phone+OTP login, accepts, then shows ONE role-specific coachmark
 * before sending the user to their IA landing. Supervisor & mukadam are
 * near-zero friction: a single tap to accept, a single coachmark.
 */
export function Join() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const t = useT()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState<{ role: Role } | null>(null)

  useEffect(() => {
    let alive = true
    authApi
      .previewInvite(token)
      .then((p) => alive && setPreview(p))
      .catch(() => alive && setLoadError(t('join.error.invalid')))
    return () => {
      alive = false
    }
    // token is stable for the screen's life; t identity is stable per language.
  }, [token, t])

  async function accept() {
    setError(null)
    setBusy(true)
    try {
      const res = await authApi.acceptInvite(token)
      setAccepted({ role: res.role })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  function goLogin() {
    // Bounce to login, then return here to accept.
    navigate(`/login?next=${encodeURIComponent(`/join/${token}`)}`)
  }

  return (
    <ThemeProvider defaultTheme="site">
      <AuthCard>
        {loadError ? (
          <p role="alert" className="font-body text-body font-medium text-risk">
            {loadError}
          </p>
        ) : accepted ? (
          <div className="space-y-4 text-center">
            <span className="mx-auto block text-4xl text-ok" aria-hidden>
              <CheckCircleIcon />
            </span>
            <Display as="h1" className="!text-h1">
              {t('join.welcome')}
            </Display>
            <Body className="text-text-mute">{t(COACHMARK_KEY[accepted.role])}</Body>
            <Button
              variant="primary"
              size="lg"
              block
              onClick={() => navigate('/', { replace: true })}
            >
              {t('join.coachmark.got_it')}
            </Button>
          </div>
        ) : preview ? (
          <div className="space-y-4">
            <Micro className="font-semibold uppercase tracking-widest text-primary-deep">
              {t('app.name')}
            </Micro>
            <div>
              <Display as="h1" className="!text-h1">
                {t('join.title')}
              </Display>
              <Body className="mt-1 text-text-mute">
                {t('join.subtitle', {
                  company: preview.company_name,
                  role: t(ROLE_KEY[preview.role]),
                })}
              </Body>
            </div>

            {error && (
              <p role="alert" className="font-body text-small font-medium text-risk">
                {error}
              </p>
            )}

            {isAuthenticated() ? (
              <Button
                variant="primary"
                size="lg"
                block
                onClick={accept}
                disabled={busy}
              >
                {busy ? t('join.action.accepting') : t('join.action.accept')}
              </Button>
            ) : (
              <>
                <Small>{t('join.signed_out')}</Small>
                <Button variant="primary" size="lg" block onClick={goLogin}>
                  {t('auth.action.sign_in')}
                </Button>
              </>
            )}
          </div>
        ) : (
          <Body className="text-text-mute">{t('common.loading')}</Body>
        )}
      </AuthCard>
    </ThemeProvider>
  )
}
