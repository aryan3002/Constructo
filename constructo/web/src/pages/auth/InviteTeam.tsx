import { useEffect, useState } from 'react'
import {
  authApi,
  inviteJoinUrl,
  whatsappShareUrl,
  type Invite,
  type Role,
} from '../../api/auth'
import { ApiError } from '../../api/client'
import { useT, type TranslationKey } from '../../i18n'
import { Body, Button, H2, Small, StatusPill } from '../../ui'
import { SelectField, TextField } from './fields'

// Roles an owner/PM can invite. Supervisor & mukadam are free, near-zero
// friction seats (highlighted as such).
const INVITABLE_ROLES: Role[] = [
  'pm',
  'supervisor',
  'labor_contractor',
  'accountant',
  'procurement',
]
const FREE_SEAT_ROLES: Role[] = ['supervisor', 'labor_contractor']

const ROLE_KEY: Record<Role, TranslationKey> = {
  owner: 'invite.role.owner',
  pm: 'invite.role.pm',
  supervisor: 'invite.role.supervisor',
  accountant: 'invite.role.accountant',
  procurement: 'invite.role.procurement',
  labor_contractor: 'invite.role.labor_contractor',
}

const STATUS_KEY: Record<Invite['status'], TranslationKey> = {
  pending: 'invite.status.pending',
  accepted: 'invite.status.accepted',
  revoked: 'invite.status.revoked',
}

/**
 * Invite a teammate by phone + role -> a shareable WhatsApp/SMS join link.
 * Reusable: the standalone /invite route and the Settings "Team" section both
 * render it. companyName powers the prefilled invite message.
 */
export function InviteTeam({ companyName }: { companyName?: string }) {
  const t = useT()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('supervisor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Invite | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, setPending] = useState<Invite[]>([])

  async function loadPending() {
    try {
      setPending(await authApi.listInvites())
    } catch {
      /* non-fatal */
    }
  }

  useEffect(() => {
    void loadPending()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const invite = await authApi.createInvite({
        phone,
        role,
        name: name.trim() || undefined,
      })
      setCreated(invite)
      setPhone('')
      setName('')
      void loadPending()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    const link = inviteJoinUrl(created.token)
    const message = t('invite.message', {
      company: companyName ?? t('app.name'),
      role: t(ROLE_KEY[created.role]),
      link,
    })
    return (
      <div className="space-y-4">
        <div>
          <H2 as="h2">{t('invite.link.title')}</H2>
          <Body className="mt-1 text-text-mute">
            {t(ROLE_KEY[created.role])} · {created.phone}
          </Body>
        </div>
        <div className="rounded-card border border-line bg-paper-2 p-3">
          <code className="cstk-mono block break-all text-small text-text">{link}</code>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="primary"
            block
            onClick={() =>
              window.open(whatsappShareUrl(created.phone, message), '_blank', 'noopener')
            }
          >
            {t('invite.link.share_whatsapp')}
          </Button>
          <Button
            variant="secondary"
            block
            onClick={async () => {
              try {
                await navigator.clipboard?.writeText(link)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              } catch {
                /* clipboard blocked */
              }
            }}
          >
            {copied ? t('invite.link.copied') : t('invite.link.copy')}
          </Button>
        </div>
        <Button variant="ghost" block onClick={() => setCreated(null)}>
          {t('invite.link.another')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextField
          label={t('invite.phone.label')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          mono
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t('auth.phone.placeholder')}
        />
        <TextField
          label={t('invite.name.label')}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <SelectField
          label={t('invite.role.label')}
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          {INVITABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {t(ROLE_KEY[r])}
              {FREE_SEAT_ROLES.includes(r) ? ` · ${t('invite.free_seat')}` : ''}
            </option>
          ))}
        </SelectField>

        {error && (
          <p role="alert" className="font-body text-small font-medium text-risk">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" block disabled={busy}>
          {busy ? t('invite.action.creating') : t('invite.action.create')}
        </Button>
      </form>

      <div>
        <Small as="h3" className="font-semibold uppercase tracking-wide text-text-mute">
          {t('invite.pending.title')}
        </Small>
        {pending.length === 0 ? (
          <Body className="mt-2 text-text-mute">{t('invite.empty')}</Body>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {pending.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <span className="cstk-mono block text-small text-text">{inv.phone}</span>
                  <span className="font-body text-micro text-text-mute">
                    {t(ROLE_KEY[inv.role])}
                  </span>
                </div>
                <StatusPill
                  status={
                    inv.status === 'accepted'
                      ? 'ok'
                      : inv.status === 'revoked'
                        ? 'risk'
                        : 'warn'
                  }
                  label={t(STATUS_KEY[inv.status])}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
