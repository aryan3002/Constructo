import { useState } from 'react'
import { useCreateGroup, useGroups, useSites } from '../api/hooks'
import { type Role } from '../api/auth'
import { useMeRole } from '../auth/useCan'
import { EmptyState, ErrorState, Spinner } from '../components/states'
import { useT } from '../i18n'
import {
  AppShell,
  Body,
  Button,
  Display,
  H2,
  Mono,
  Small,
  StatusPill,
  useRoleTabs,
  type Role as ShellRole,
} from '../ui'

/**
 * WhatsApp group mapping — retrofitted onto the Blueprint kit. Map a group to a
 * site so its messages flow into the timeline. Site-themed form + list, ≥48px
 * controls, i18n labels.
 */
export function Groups() {
  const t = useT()
  const groups = useGroups()
  const sites = useSites()
  const createGroup = useCreateGroup()
  const role: Role = useMeRole() ?? 'owner'
  const tabs = useRoleTabs(role as ShellRole)

  const [externalGroupId, setExternalGroupId] = useState('')
  const [label, setLabel] = useState('')
  const [siteId, setSiteId] = useState('')
  const [source, setSource] = useState('whatsapp')

  const siteName = (id: string) =>
    sites.data?.items.find((s) => s.id === id)?.name ?? id

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    createGroup.mutate(
      { external_group_id: externalGroupId, source, site_id: siteId, label },
      {
        onSuccess: () => {
          setExternalGroupId('')
          setLabel('')
          setSiteId('')
        },
      },
    )
  }

  const fieldClass =
    'mt-1 w-full min-h-tap rounded-control border border-line bg-paper-2 px-3 ' +
    'font-body text-body text-text focus:border-primary focus:outline-none ' +
    'focus:ring-2 focus:ring-primary/40'
  const labelClass = 'block font-body text-small font-semibold text-text'

  return (
    <AppShell role={role as ShellRole} tabs={tabs}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <Display as="h1" className="!text-h1">
            {t('groups.title')}
          </Display>
          <Small className="mt-1 block">{t('groups.subtitle')}</Small>

          <form
            onSubmit={handleSubmit}
            className="mt-4 space-y-4 rounded-card border border-line bg-card p-5 shadow-card"
          >
            <div>
              <label htmlFor="label" className={labelClass}>
                {t('groups.field.label')}
              </label>
              <input
                id="label"
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t('groups.field.label_placeholder')}
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="external_group_id" className={labelClass}>
                {t('groups.field.external_id')}
              </label>
              <input
                id="external_group_id"
                required
                value={externalGroupId}
                onChange={(e) => setExternalGroupId(e.target.value)}
                placeholder={t('groups.field.external_id_placeholder')}
                className={`${fieldClass} cstk-mono`}
              />
            </div>

            <div>
              <label htmlFor="site_id" className={labelClass}>
                {t('groups.field.site')}
              </label>
              <select
                id="site_id"
                required
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className={fieldClass}
              >
                <option value="" disabled>
                  {t('groups.field.site_placeholder')}
                </option>
                {sites.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="source" className={labelClass}>
                {t('groups.field.source')}
              </label>
              <input
                id="source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className={fieldClass}
              />
            </div>

            {createGroup.isError && (
              <p role="alert" className="font-body text-small font-medium text-risk">
                {(createGroup.error as Error).message}
              </p>
            )}
            {createGroup.isSuccess && (
              <p role="status">
                <StatusPill status="ok" size="sm" label={t('groups.success')} />
              </p>
            )}

            <Button type="submit" variant="primary" block disabled={createGroup.isPending}>
              {createGroup.isPending ? t('groups.action.mapping') : t('groups.action.map')}
            </Button>
          </form>
        </section>

        <section>
          <H2>{t('groups.mapped.title')}</H2>
          <div className="mt-3">
            {groups.isLoading && <Spinner label={t('common.loading')} />}
            {groups.isError && (
              <ErrorState
                message={(groups.error as Error)?.message ?? t('common.error')}
                onRetry={() => groups.refetch()}
                retryLabel={t('action.retry')}
              />
            )}
            {!groups.isLoading &&
              !groups.isError &&
              groups.data &&
              groups.data.items.length === 0 && (
                <EmptyState
                  title={t('groups.mapped.empty.title')}
                  hint={t('groups.mapped.empty.hint')}
                />
              )}
            {!groups.isLoading &&
              !groups.isError &&
              groups.data &&
              groups.data.items.length > 0 && (
                <ul className="space-y-3">
                  {groups.data.items.map((g) => (
                    <li
                      key={g.id}
                      className="rounded-card border border-line bg-card p-4 shadow-card"
                    >
                      <Body className="font-semibold !text-text">{g.label}</Body>
                      <Small className="mt-1 block">→ {siteName(g.site_id)}</Small>
                      <Mono className="mt-0.5 block text-micro text-text-mute">
                        {g.source} · {g.external_group_id}
                      </Mono>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
