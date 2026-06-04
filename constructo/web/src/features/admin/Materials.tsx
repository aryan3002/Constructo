// Materials (W4.6) — the Setup & Administration material catalog. Mirrors
// Vendors: add a material (name + category + unit), then archive/restore rows.
// Backed by GET/POST/PATCH /api/v1/materials (owner/pm).
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { qk } from '../../api/queryKeys'
import type { Material } from '../../api/types'
import { useCan } from '../../auth/useCan'
import { useT, type TranslationKey } from '../../i18n'
import { Body, Button, H2, Mono, Small, StatusPill, type Status } from '../../ui'
import { ErrorState, Spinner } from '../../components/states'
import { SelectField, TextField } from '../../pages/auth/fields'

const CATEGORIES = ['binder', 'steel', 'aggregate', 'finishing', 'other']
const catKey = (c: string) => `admin.materials.cat_${c}` as TranslationKey

interface MaterialForm {
  name: string
  category: string
  unit: string
}

export function Materials() {
  const t = useT()
  const qc = useQueryClient()
  const canManage = useCan('manage_settings')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [toast, setToast] = useState<{ status: Status; msg: string } | null>(null)

  const materials = useQuery({
    queryKey: qk.materials(includeArchived),
    queryFn: () => api.listMaterials(includeArchived),
  })

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('admin.materials.name_required')).max(200),
        category: z.string(),
        unit: z.string().trim().max(32),
      }),
    [t],
  )

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MaterialForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', category: 'binder', unit: '' },
  })

  const create = useMutation({
    mutationFn: (v: MaterialForm) =>
      api.createMaterial({
        name: v.name,
        category: v.category || null,
        unit: v.unit.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materials'] })
      reset({ name: '', category: 'binder', unit: '' })
      setToast({ status: 'ok', msg: t('admin.materials.added') })
    },
    onError: () => setToast({ status: 'risk', msg: t('admin.materials.save_failed') }),
  })

  const archive = useMutation<Material, Error, { id: string; is_active: boolean }, { prev?: Material[] }>({
    mutationFn: ({ id, is_active }) => api.updateMaterial(id, { is_active }),
    async onMutate({ id, is_active }) {
      const key = qk.materials(includeArchived)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Material[]>(key)
      if (prev) {
        const next = includeArchived
          ? prev.map((m) => (m.id === id ? { ...m, is_active } : m))
          : prev.filter((m) => m.id !== id || is_active)
        qc.setQueryData<Material[]>(key, next)
      }
      return { prev }
    },
    onError(_e, _v, ctx) {
      if (ctx?.prev) qc.setQueryData(qk.materials(includeArchived), ctx.prev)
      setToast({ status: 'risk', msg: t('admin.materials.save_failed') })
    },
    onSettled() {
      qc.invalidateQueries({ queryKey: ['materials'] })
    },
  })

  return (
    <section aria-labelledby="admin-materials-heading" className="flex flex-col gap-5">
      <header>
        <H2 id="admin-materials-heading" as="h2">
          {t('admin.materials.title')}
        </H2>
        <Small className="mt-1 block !text-text-mute">{t('admin.materials.subtitle')}</Small>
      </header>

      {toast ? (
        <p role="status" aria-live="polite">
          <StatusPill status={toast.status} label={toast.msg} />
        </p>
      ) : null}

      {canManage ? (
        <form
          onSubmit={handleSubmit((v) => create.mutate(v))}
          className="flex flex-col gap-3 rounded-card border border-line bg-paper p-4"
          noValidate
        >
          <Small className="font-semibold text-text">{t('admin.materials.add_title')}</Small>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <TextField
                label={t('admin.materials.name_label')}
                required
                placeholder={t('admin.materials.name_placeholder')}
                aria-invalid={errors.name ? true : undefined}
                {...register('name')}
              />
              {errors.name ? (
                <p role="alert" className="mt-1 font-body text-small font-medium text-risk">
                  {errors.name.message}
                </p>
              ) : null}
            </div>
            <SelectField label={t('admin.materials.category_label')} {...register('category')}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(catKey(c))}
                </option>
              ))}
            </SelectField>
            <TextField
              label={t('admin.materials.unit_label')}
              mono
              placeholder={t('admin.materials.unit_placeholder')}
              {...register('unit')}
            />
          </div>
          <div>
            <Button type="submit" variant="primary" disabled={isSubmitting || create.isPending}>
              {create.isPending ? t('admin.materials.adding') : t('admin.materials.add')}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Small className="font-semibold uppercase tracking-wide text-text-mute">
          {t('admin.materials.list_title')}
        </Small>
        <label className="flex items-center gap-2 font-body text-small text-text-mute">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          {t('admin.materials.show_archived')}
        </label>
      </div>

      {materials.isLoading ? (
        <Spinner label={t('admin.materials.loading')} />
      ) : materials.isError ? (
        <ErrorState
          message={(materials.error as Error)?.message ?? t('admin.materials.error')}
          onRetry={() => materials.refetch()}
        />
      ) : materials.data && materials.data.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-card p-4 text-center font-body text-small text-text-mute">
          {t('admin.materials.empty')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line">
          {(materials.data ?? []).map((m) => (
            <li
              key={m.id}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${
                m.is_active ? 'bg-card' : 'bg-surface-sunken'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-body text-small font-semibold text-text">
                  <span className="truncate">{m.name}</span>
                  {m.category ? (
                    <span className="rounded-pill bg-surface-sunken px-1.5 py-0.5 font-body text-micro font-semibold text-text-mute">
                      {CATEGORIES.includes(m.category) ? t(catKey(m.category)) : m.category}
                    </span>
                  ) : null}
                  {!m.is_active ? (
                    <StatusPill status="warn" label={t('admin.materials.archived')} />
                  ) : null}
                </p>
                {m.unit ? (
                  <Mono className="mt-0.5 block text-micro text-text-mute">
                    {t('admin.materials.per_unit', { unit: m.unit })}
                  </Mono>
                ) : null}
              </div>
              {canManage ? (
                <Button
                  variant="ghost"
                  disabled={archive.isPending}
                  onClick={() => archive.mutate({ id: m.id, is_active: !m.is_active })}
                >
                  {m.is_active ? t('admin.materials.archive') : t('admin.materials.restore')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!canManage ? (
        <Body className="!text-text-mute">{t('admin.materials.read_only')}</Body>
      ) : null}
    </section>
  )
}
