// Vendors (W4.5) — the Setup & Administration master list of suppliers. Add a
// vendor (name + optional category/GST/phone), then archive/restore rows. Backed
// by GET/POST/PATCH /api/v1/vendors (owner/pm). The first net-new master-data
// section; Materials will mirror this shape.
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { qk } from '../../api/queryKeys'
import type { Vendor } from '../../api/types'
import { useCan } from '../../auth/useCan'
import { useT, type TranslationKey } from '../../i18n'
import { Body, Button, H2, Mono, Small, StatusPill, type Status } from '../../ui'
import { ErrorState, Spinner } from '../../components/states'
import { SelectField, TextField } from '../../pages/auth/fields'

const CATEGORIES = ['material', 'labour', 'equipment', 'service', 'other']
const catKey = (c: string) => `admin.vendors.cat_${c}` as TranslationKey

interface VendorForm {
  name: string
  category: string
  gstin: string
  phone: string
}

export function Vendors() {
  const t = useT()
  const qc = useQueryClient()
  const canManage = useCan('manage_settings')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [toast, setToast] = useState<{ status: Status; msg: string } | null>(null)

  const vendors = useQuery({
    queryKey: qk.vendors(includeArchived),
    queryFn: () => api.listVendors(includeArchived),
  })

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('admin.vendors.name_required')).max(200),
        category: z.string(),
        gstin: z.string().trim().max(32, t('admin.vendors.gstin_too_long')),
        phone: z.string().trim().max(32),
      }),
    [t],
  )

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VendorForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', category: 'material', gstin: '', phone: '' },
  })

  const create = useMutation({
    mutationFn: (v: VendorForm) =>
      api.createVendor({
        name: v.name,
        category: v.category || null,
        gstin: v.gstin.trim() || null,
        phone: v.phone.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] })
      reset({ name: '', category: 'material', gstin: '', phone: '' })
      setToast({ status: 'ok', msg: t('admin.vendors.added') })
    },
    onError: () => setToast({ status: 'risk', msg: t('admin.vendors.save_failed') }),
  })

  const archive = useMutation<Vendor, Error, { id: string; is_active: boolean }, { prev?: Vendor[] }>({
    mutationFn: ({ id, is_active }) => api.updateVendor(id, { is_active }),
    async onMutate({ id, is_active }) {
      const key = qk.vendors(includeArchived)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Vendor[]>(key)
      if (prev) {
        // When not showing archived, an archived row drops out of the list.
        const next = includeArchived
          ? prev.map((v) => (v.id === id ? { ...v, is_active } : v))
          : prev.filter((v) => v.id !== id || is_active)
        qc.setQueryData<Vendor[]>(key, next)
      }
      return { prev }
    },
    onError(_e, _v, ctx) {
      if (ctx?.prev) qc.setQueryData(qk.vendors(includeArchived), ctx.prev)
      setToast({ status: 'risk', msg: t('admin.vendors.save_failed') })
    },
    onSettled() {
      qc.invalidateQueries({ queryKey: ['vendors'] })
    },
  })

  return (
    <section aria-labelledby="admin-vendors-heading" className="flex flex-col gap-5">
      <header>
        <H2 id="admin-vendors-heading" as="h2">
          {t('admin.vendors.title')}
        </H2>
        <Small className="mt-1 block !text-text-mute">{t('admin.vendors.subtitle')}</Small>
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
          <Small className="font-semibold text-text">{t('admin.vendors.add_title')}</Small>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <TextField
                label={t('admin.vendors.name_label')}
                required
                placeholder={t('admin.vendors.name_placeholder')}
                aria-invalid={errors.name ? true : undefined}
                {...register('name')}
              />
              {errors.name ? (
                <p role="alert" className="mt-1 font-body text-small font-medium text-risk">
                  {errors.name.message}
                </p>
              ) : null}
            </div>
            <SelectField label={t('admin.vendors.category_label')} {...register('category')}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(catKey(c))}
                </option>
              ))}
            </SelectField>
            <TextField
              label={t('admin.vendors.gstin_label')}
              mono
              placeholder={t('admin.vendors.gstin_placeholder')}
              {...register('gstin')}
            />
            <TextField
              label={t('admin.vendors.phone_label')}
              mono
              placeholder={t('admin.vendors.phone_placeholder')}
              {...register('phone')}
            />
          </div>
          <div>
            <Button type="submit" variant="primary" disabled={isSubmitting || create.isPending}>
              {create.isPending ? t('admin.vendors.adding') : t('admin.vendors.add')}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Small className="font-semibold uppercase tracking-wide text-text-mute">
          {t('admin.vendors.list_title')}
        </Small>
        <label className="flex items-center gap-2 font-body text-small text-text-mute">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          {t('admin.vendors.show_archived')}
        </label>
      </div>

      {vendors.isLoading ? (
        <Spinner label={t('admin.vendors.loading')} />
      ) : vendors.isError ? (
        <ErrorState
          message={(vendors.error as Error)?.message ?? t('admin.vendors.error')}
          onRetry={() => vendors.refetch()}
        />
      ) : vendors.data && vendors.data.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-card p-4 text-center font-body text-small text-text-mute">
          {t('admin.vendors.empty')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line">
          {(vendors.data ?? []).map((v) => (
            <li
              key={v.id}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${
                v.is_active ? 'bg-card' : 'bg-surface-sunken'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-body text-small font-semibold text-text">
                  <span className="truncate">{v.name}</span>
                  {v.category ? (
                    <span className="rounded-pill bg-surface-sunken px-1.5 py-0.5 font-body text-micro font-semibold text-text-mute">
                      {CATEGORIES.includes(v.category) ? t(catKey(v.category)) : v.category}
                    </span>
                  ) : null}
                  {!v.is_active ? (
                    <StatusPill status="warn" label={t('admin.vendors.archived')} />
                  ) : null}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 font-body text-micro text-text-mute">
                  {v.gstin ? <Mono className="text-micro">{v.gstin}</Mono> : null}
                  {v.phone ? <Mono className="text-micro">{v.phone}</Mono> : null}
                </p>
              </div>
              {canManage ? (
                <Button
                  variant="ghost"
                  disabled={archive.isPending}
                  onClick={() => archive.mutate({ id: v.id, is_active: !v.is_active })}
                >
                  {v.is_active ? t('admin.vendors.archive') : t('admin.vendors.restore')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!canManage ? (
        <Body className="!text-text-mute">{t('admin.vendors.read_only')}</Body>
      ) : null}
    </section>
  )
}
