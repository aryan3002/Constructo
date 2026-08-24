import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  authApi,
  isAuthenticated,
  type InvitePreview,
  type Role,
} from '../../api/auth'
import { useT, type TranslationKey } from '../../i18n'
import { Body, Button, Display, Small } from '../../ui'
import {
  BuildingIcon,
  CameraIcon,
  ChartBarIcon,
  CheckCircleIcon,
  CompassIcon,
  DocIcon,
  ScaleIcon,
  UsersIcon,
} from '../../ui/icons'
import { AuthLayout } from './AuthLayout'
import { mapAuthError, type AuthErrorAction, type AuthErrorView } from './authErrors'
import { AuthError } from './fields'

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

const ROLE_ICON: Record<Role, (p: React.SVGProps<SVGSVGElement>) => JSX.Element> = {
  owner: BuildingIcon,
  pm: ChartBarIcon,
  architect: CompassIcon,
  supervisor: CameraIcon,
  accountant: ScaleIcon,
  procurement: DocIcon,
  labor_contractor: UsersIcon,
}

/** "As {role}, you'll…" + the one-line coachmark — shown BEFORE accepting so the tap is informed. */
function RoleCard({ role }: { role: Role }) {
  const t = useT()
  const Icon = ROLE_ICON[role]
  return (
    <div className="flex items-start gap-3 rounded-card border border-line bg-paper-2 p-4">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-subtle text-[1.25em] text-brand-text"
        aria-hidden
      >
        <Icon />
      </span>
      <div className="min-w-0">
        <p className="font-body text-small font-semibold text-text">
          {t('join.role_card.title', { role: t(ROLE_KEY[role]) })}
        </p>
        <p className="mt-0.5 font-body text-body text-text-mute">{t(COACHMARK_KEY[role])}</p>
      </div>
    </div>
  )
}

/**
 * Invitee join screen. Resolves the invite from its token (public preview),
 * shows what the role can do, requires a phone+OTP login, accepts, then shows
 * ONE role-specific coachmark before sending the user to their IA landing.
 * Supervisor & mukadam are near-zero friction: a single tap to accept.
 */
export function Join() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const t = useT()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loadError, setLoadError] = useState<AuthErrorView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AuthErrorView | null>(null)
  const [accepted, setAccepted] = useState<{ role: Role } | null>(null)

  useEffect(() => {
    let alive = true
    authApi
      .previewInvite(token)
      .then((p) => alive && setPreview(p))
      .catch(() => alive && setLoadError({ messageKey: 'join.error.invalid' }))
    return () => {
      alive = false
    }
  }, [token])

  async function accept() {
    setError(null)
    setBusy(true)
    try {
      const res = await authApi.acceptInvite(token)
      setAccepted({ role: res.role })
    } catch (err) {
      setError(mapAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  function goLogin() {
    // Bounce to login, then return here to accept.
    navigate(`/login?next=${encodeURIComponent(`/join/${token}`)}`)
  }

  function onErrorAction(action: AuthErrorAction) {
    if (action === 'signIn') goLogin()
    else if (action === 'retry') setError(null)
  }

  return (
    <AuthLayout steps="signin">
      {loadError ? (
        <AuthError view={loadError} />
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
        <div className="space-y-5">
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

          <RoleCard role={preview.role} />

          <AuthError view={error} onAction={onErrorAction} />

          {isAuthenticated() ? (
            <Button variant="primary" size="lg" block onClick={accept} disabled={busy}>
              {busy ? t('join.action.accepting') : t('join.action.accept')}
            </Button>
          ) : (
            <>
              <Small>{t('join.signed_out')}</Small>
              <Button variant="primary" size="lg" block onClick={goLogin}>
                {t('auth.action.sign_in')}
              </Button>
              <Small className="text-center">{t('auth.no_password')}</Small>
            </>
          )}
        </div>
      ) : (
        <Body className="text-text-mute">{t('common.loading')}</Body>
      )}
    </AuthLayout>
  )
}
