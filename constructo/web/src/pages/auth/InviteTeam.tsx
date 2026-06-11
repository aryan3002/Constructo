import { useEffect, useState } from 'react'
import {
  authApi,
  inviteJoinUrl,
  whatsappShareUrl,
  type HomeownerMemberInvite,
  type Invite,
  type Role,
} from '../../api/auth'
import { ApiError, api } from '../../api/client'
import type { Site } from '../../api/types'
import { useT, type TranslationKey } from '../../i18n'
import { Body, Button, H2, Small, StatusPill } from '../../ui'
import { SelectField, TextField } from './fields'

// Roles an owner/PM can invite. Supervisor & mukadam are free, near-zero
// friction seats (highlighted as such).
const INVITABLE_ROLES: Role[] = [
  'pm',
  'architect',
  'supervisor',
  'labor_contractor',
  'accountant',
  'procurement',
]
const FREE_SEAT_ROLES: Role[] = ['supervisor', 'labor_contractor']

// The homeowner/client is NOT a contractor web role (they redeem a join code in
// the mobile app), so we model it as a pseudo-option alongside the team roles.
const CLIENT = 'client' as const
type InviteRole = Role | typeof CLIENT

const ROLE_KEY: Record<InviteRole, TranslationKey> = {
  owner: 'invite.role.owner',
  pm: 'invite.role.pm',
  architect: 'invite.role.architect',
  supervisor: 'invite.role.supervisor',
  accountant: 'invite.role.accountant',
  procurement: 'invite.role.procurement',
  labor_contractor: 'invite.role.labor_contractor',
  client: 'invite.role.client',
}

const STATUS_KEY: Record<Invite['status'], TranslationKey> = {
  pending: 'invite.status.pending',
  accepted: 'invite.status.accepted',
  revoked: 'invite.status.revoked',
}

/**
 * Invite a teammate by phone + role -> a shareable WhatsApp/SMS join link.
 * Also invites the **Client (homeowner)**: that branch mints a site-scoped
 * homeowner member + join code (the client redeems it in the mobile app), so it
 * surfaces a join code rather than a web join URL.
 * Reusable: the standalone /invite route and the Settings "Team" section both
 * render it. companyName powers the prefilled invite message.
 */
export function InviteTeam({ companyName }: { companyName?: string }) {
  const t = useT()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<InviteRole>('supervisor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Invite | null>(null)
  const [clientCreated, setClientCreated] = useState<HomeownerMemberInvite | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, setPending] = useState<Invite[]>([])
  // Client invites are site-scoped; lazily loaded when "Client" is first chosen.
  const [sites, setSites] = useState<Site[] | null>(null)
  const [siteId, setSiteId] = useState('')

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

  // Lazy-load the site list the first time the Client role is selected, so the
  // contractor path (and its tests) make no extra request.
  useEffect(() => {
    if (role !== CLIENT || sites !== null) return
    let cancelled = false
    void (async () => {
      try {
        const page = await api.listSites()
        if (cancelled) return
        setSites(page.items)
        if (page.items.length > 0) setSiteId((cur) => cur || page.items[0].id)
      } catch {
        if (!cancelled) setSites([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [role, sites])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (role === CLIENT) {
        const member = await authApi.inviteClient({
          siteId,
          phone,
          name: name.trim() || undefined,
        })
        setClientCreated(member)
      } else {
        const invite = await authApi.createInvite({
          phone,
          role,
          name: name.trim() || undefined,
        })
        setCreated(invite)
        void loadPending()
      }
      setPhone('')
      setName('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setCreated(null)
    setClientCreated(null)
  }

  // --- Client invite created: show the join code + mobile instructions -------
  if (clientCreated) {
    const code = clientCreated.join_code
    const message = t('invite.client.message', {
      company: companyName ?? t('app.name'),
      code,
    })
    return (
      <div className="space-y-4">
        <div>
          <H2 as="h2">{t('invite.client.title')}</H2>
          <Body className="mt-1 text-text-mute">
            {t('invite.role.client')}
            {clientCreated.phone ? ` · ${clientCreated.phone}` : ''}
          </Body>
        </div>
        <div className="rounded-card border border-line bg-paper-2 p-3">
          <Small className="font-semibold uppercase tracking-wide text-text-mute">
            {t('invite.client.code_label')}
          </Small>
          <code className="cstk-mono mt-1 block break-all text-h2 tracking-wider text-text">
            {code}
          </code>
        </div>
        <Body className="text-small text-text-mute">
          {t('invite.client.instructions', {
            name: clientCreated.display_name ?? t('invite.client.them'),
          })}
        </Body>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="primary"
            block
            onClick={() =>
              window.open(
                whatsappShareUrl(clientCreated.phone ?? '', message),
                '_blank',
                'noopener',
              )
            }
          >
            {t('invite.link.share_whatsapp')}
          </Button>
          <Button
            variant="secondary"
            block
            onClick={async () => {
              try {
                await navigator.clipboard?.writeText(code)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              } catch {
                /* clipboard blocked */
              }
            }}
          >
            {copied ? t('invite.link.copied') : t('invite.client.copy_code')}
          </Button>
        </div>
        <Button variant="ghost" block onClick={reset}>
          {t('invite.link.another')}
        </Button>
      </div>
    )
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
        <Button variant="ghost" block onClick={reset}>
          {t('invite.link.another')}
        </Button>
      </div>
    )
  }

  const isClient = role === CLIENT

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextField
          label={isClient ? t('invite.client.phone.label') : t('invite.phone.label')}
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
          onChange={(e) => setRole(e.target.value as InviteRole)}
        >
          {INVITABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {t(ROLE_KEY[r])}
              {FREE_SEAT_ROLES.includes(r) ? ` · ${t('invite.free_seat')}` : ''}
            </option>
          ))}
          <option value={CLIENT}>{t('invite.role.client')}</option>
        </SelectField>

        {isClient && (
          <SelectField
            label={t('invite.client.site_label')}
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
          >
            {(sites ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        )}

        {error && (
          <p role="alert" className="font-body text-small font-medium text-risk">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          disabled={busy || (isClient && !siteId)}
        >
          {busy
            ? t('invite.action.creating')
            : isClient
              ? t('invite.client.action')
              : t('invite.action.create')}
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
