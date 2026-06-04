// Company Profile (W4.1) — the first form of the Setup & Administration control
// plane and the template every later admin form follows: React-Hook-Form + Zod
// (validation co-located, typed values), reading the current company via
// GET /auth/company and writing the rename via the owner-only PATCH.
//
// Only `name` is editable today (the backend Company model is name-only). The
// richer fields (GST, address, timezone, currency, logo) are shown as an honest
// "needs backend" note rather than dead inputs that POST nowhere — same posture
// as the Show-proof placeholder (P5: never fake a capability).
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '../../api/auth'
import { qk } from '../../api/queryKeys'
import { useCan } from '../../auth/useCan'
import { useT } from '../../i18n'
import { Body, Button, H2, Mono, Small, StatusPill, type Status } from '../../ui'
import { ErrorState, Spinner } from '../../components/states'
import { TextField } from '../../pages/auth/fields'

interface CompanyForm {
  name: string
}

export function CompanyProfile() {
  const t = useT()
  const qc = useQueryClient()
  const canManage = useCan('manage_settings')

  const company = useQuery({
    queryKey: qk.company(),
    queryFn: () => authApi.getCompany(),
  })

  // Schema built with the translator so messages are localized.
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('admin.company.name_required'))
          .max(120, t('admin.company.name_too_long')),
      }),
    [t],
  )

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<CompanyForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  })

  // Seed the form the moment the GET resolves (and after it changes server-side).
  const loadedName = company.data?.name
  useEffect(() => {
    if (loadedName !== undefined) reset({ name: loadedName })
  }, [loadedName, reset])

  const [toast, setToast] = useState<{ status: Status; msg: string } | null>(null)

  const save = useMutation({
    mutationFn: (v: CompanyForm) => authApi.renameCompany(v.name),
    onSuccess: (saved) => {
      qc.setQueryData(qk.company(), saved)
      reset({ name: saved.name })
      setToast({ status: 'ok', msg: t('admin.company.saved') })
    },
    onError: () => setToast({ status: 'risk', msg: t('admin.company.save_failed') }),
  })

  if (company.isLoading) return <Spinner label={t('admin.company.loading')} />
  if (company.isError || !company.data) {
    return (
      <ErrorState
        message={(company.error as Error)?.message ?? t('admin.company.error')}
        onRetry={() => company.refetch()}
      />
    )
  }

  return (
    <section aria-labelledby="admin-company-heading" className="flex flex-col gap-5">
      <header>
        <H2 id="admin-company-heading" as="h2">
          {t('admin.company.title')}
        </H2>
        <Small className="mt-1 !text-text-mute">{t('admin.company.subtitle')}</Small>
      </header>

      {toast ? (
        <p role="status" aria-live="polite">
          <StatusPill status={toast.status} label={toast.msg} />
        </p>
      ) : null}

      {canManage ? (
        <form
          onSubmit={handleSubmit((v) => save.mutate(v))}
          className="flex flex-col gap-4"
          noValidate
        >
          <div>
            <TextField
              label={t('admin.company.name_label')}
              required
              placeholder={t('admin.company.name_placeholder')}
              aria-invalid={errors.name ? true : undefined}
              {...register('name')}
            />
            {errors.name ? (
              <p role="alert" className="mt-1 font-body text-small font-medium text-risk">
                {errors.name.message}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={!isDirty || isSubmitting || save.isPending}
            >
              {save.isPending ? t('admin.company.saving') : t('admin.company.save')}
            </Button>
            {isDirty ? (
              <Small className="!text-text-mute">{t('admin.company.unsaved')}</Small>
            ) : null}
          </div>
        </form>
      ) : (
        // Read-only for non-owners (the server also enforces owner-only writes).
        <div>
          <Small className="!text-text-mute">{t('admin.company.name_label')}</Small>
          <Body className="mt-0.5 font-semibold">{company.data.name}</Body>
          <Small className="mt-2 block !text-text-mute">{t('admin.company.read_only')}</Small>
        </div>
      )}

      {/* Metadata + honest forward note. */}
      <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 border-t border-line pt-4">
        <dt className="font-body text-small text-text-mute">{t('admin.company.id_label')}</dt>
        <dd>
          <Mono className="text-small text-text-mute">{company.data.id}</Mono>
        </dd>
      </dl>
      <p className="rounded-card border border-dashed border-line bg-paper p-3 font-body text-small text-text-mute">
        {t('admin.company.more_fields_soon')}
      </p>
    </section>
  )
}
