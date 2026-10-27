import { RoleShell } from '../../ui/RoleShell'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { Body, Display } from '../../ui'
import { InviteTeam } from './InviteTeam'

/** Standalone "invite a teammate" screen (owner/PM). */
export function InvitePage() {
  const t = useT()

  return (
    <RoleShell>
      <div className="mx-auto w-full max-w-lg">
        <Link
          to="/settings"
          className="font-body text-small font-semibold text-text-mute hover:text-text"
        >
          ← {t('settings.title')}
        </Link>
        <div className="mt-3">
          <Display as="h1" className="!text-h1">
            {t('invite.title')}
          </Display>
          <Body className="mt-1 text-text-mute">{t('invite.subtitle')}</Body>
        </div>
        <div className="mt-6">
          <InviteTeam />
        </div>
      </div>
    </RoleShell>
  )
}
