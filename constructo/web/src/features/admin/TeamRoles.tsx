// Team & roles (W4.3) — the Setup & Administration section where an owner sees
// every teammate and changes their role or deactivates them. Backed by
// GET /api/v1/users + the owner-only PATCH /api/v1/users/{id}. The server is the
// authority (owner-only, no self-edit, deactivation blocks login + tokens); this
// shapes the UI to match and updates optimistically.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  authApi,
  type Me,
  type Role,
  type TeamMember,
  type TeamMemberUpdate,
} from '../../api/auth'
import { qk } from '../../api/queryKeys'
import { useCan } from '../../auth/useCan'
import { useT, type TranslationKey } from '../../i18n'
import { Body, Button, H2, Mono, Small, StatusPill, type Status } from '../../ui'
import { ErrorState, Spinner } from '../../components/states'

/** Roles an owner may assign from this screen (the field/homeowner roles join
 *  via the app, not here, but all back-office roles are switchable). */
const ASSIGNABLE_ROLES: Role[] = [
  'owner',
  'pm',
  'supervisor',
  'accountant',
  'procurement',
  'labor_contractor',
]

const roleKey = (r: Role) => `invite.role.${r}` as TranslationKey

interface MutateVars {
  id: string
  patch: TeamMemberUpdate
}

export function TeamRoles() {
  const t = useT()
  const qc = useQueryClient()
  const canManage = useCan('manage_team')

  const me = useQuery({ queryKey: qk.me(), queryFn: () => authApi.me() })
  const team = useQuery({ queryKey: qk.team(), queryFn: () => authApi.listTeam() })

  const [toast, setToast] = useState<{ status: Status; msg: string } | null>(null)

  const mutation = useMutation<
    TeamMember,
    Error,
    MutateVars,
    { prev?: TeamMember[] }
  >({
    mutationFn: ({ id, patch }) => authApi.updateTeamMember(id, patch),
    async onMutate({ id, patch }) {
      await qc.cancelQueries({ queryKey: qk.team() })
      const prev = qc.getQueryData<TeamMember[]>(qk.team())
      if (prev) {
        qc.setQueryData<TeamMember[]>(
          qk.team(),
          prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        )
      }
      return { prev }
    },
    onError(_e, _v, ctx) {
      if (ctx?.prev) qc.setQueryData(qk.team(), ctx.prev)
      setToast({ status: 'risk', msg: t('admin.team.save_failed') })
    },
    onSuccess() {
      setToast({ status: 'ok', msg: t('admin.team.saved') })
    },
    onSettled() {
      qc.invalidateQueries({ queryKey: qk.team() })
    },
  })

  if (team.isLoading) return <Spinner label={t('admin.team.loading')} />
  if (team.isError || !team.data) {
    return (
      <ErrorState
        message={(team.error as Error)?.message ?? t('admin.team.error')}
        onRetry={() => team.refetch()}
      />
    )
  }

  const members = team.data
  const selfId = (me.data as Me | undefined)?.id

  return (
    <section aria-labelledby="admin-team-heading" className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <H2 id="admin-team-heading" as="h2">
            {t('admin.team.title')}
          </H2>
          <Small className="mt-1 block !text-text-mute">{t('admin.team.subtitle')}</Small>
        </div>
        <a
          href="/invite"
          className="inline-flex min-h-tap items-center gap-1.5 rounded-pill border border-primary/50 bg-card px-4 font-body text-small font-semibold text-primary-deep cstk-animate transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t('admin.team.invite')} <span aria-hidden>→</span>
        </a>
      </header>

      {toast ? (
        <p role="status" aria-live="polite">
          <StatusPill status={toast.status} label={toast.msg} />
        </p>
      ) : null}

      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line">
        {members.map((m) => {
          const isSelf = m.id === selfId
          const locked = !canManage || isSelf || mutation.isPending
          return (
            <li
              key={m.id}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${
                m.is_active ? 'bg-card' : 'bg-surface-sunken'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-body text-small font-semibold text-text">
                  <span className="truncate">{m.name || t('admin.team.unnamed')}</span>
                  {isSelf ? (
                    <span className="rounded-pill bg-surface-sunken px-1.5 py-0.5 font-body text-micro font-semibold text-text-mute">
                      {t('admin.team.you')}
                    </span>
                  ) : null}
                  {!m.is_active ? <StatusPill status="warn" label={t('admin.team.inactive')} /> : null}
                </p>
                <Mono className="mt-0.5 block text-micro text-text-mute">{m.phone}</Mono>
              </div>

              <label className="sr-only" htmlFor={`role-${m.id}`}>
                {t('invite.role.label')}
              </label>
              <select
                id={`role-${m.id}`}
                value={m.role}
                disabled={locked}
                onChange={(e) =>
                  mutation.mutate({ id: m.id, patch: { role: e.target.value as Role } })
                }
                className="min-h-tap rounded-control border border-line bg-paper-2 px-2 font-body text-small text-text disabled:opacity-60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(roleKey(r))}
                  </option>
                ))}
              </select>

              <Button
                variant="ghost"
                disabled={locked}
                onClick={() =>
                  mutation.mutate({ id: m.id, patch: { is_active: !m.is_active } })
                }
              >
                {m.is_active ? t('admin.team.deactivate') : t('admin.team.reactivate')}
              </Button>
            </li>
          )
        })}
      </ul>

      {!canManage ? (
        <Body className="!text-text-mute">{t('admin.team.read_only')}</Body>
      ) : null}
    </section>
  )
}
