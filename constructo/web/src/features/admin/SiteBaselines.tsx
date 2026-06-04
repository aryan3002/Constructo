// Site baselines (W4.4) — the Setup & Administration section where an owner sets
// each site's expected daily headcount (and notes). The baseline is what lets
// the labor-shortfall risk fire deterministically against an explicit
// expectation; clearing the number reverts the site to the auto-learn fallback.
//
// Backend already complete: GET/PUT /api/v1/sites/{id}/baseline (owner/pm). This
// is a web-only slice — a site picker + an RHF/Zod form, same pattern as the
// Company section.
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import { useSites } from '../../api/hooks'
import { qk } from '../../api/queryKeys'
import { useCan } from '../../auth/useCan'
import { useT } from '../../i18n'
import { Body, Button, H2, Small, StatusPill, type Status } from '../../ui'
import { ErrorState, Spinner } from '../../components/states'
import { SelectField, TextField } from '../../pages/auth/fields'

interface BaselineForm {
  headcount: string
  notes: string
}

export function SiteBaselines() {
  const t = useT()
  const qc = useQueryClient()
  const canManage = useCan('manage_sites')

  const sites = useSites()
  const siteItems = sites.data?.items ?? []
  const [siteId, setSiteId] = useState<string>('')

  // Default to the first site once they load.
  useEffect(() => {
    if (!siteId && siteItems.length > 0) setSiteId(siteItems[0].id)
  }, [siteId, siteItems])

  const baseline = useQuery({
    queryKey: qk.baseline(siteId),
    queryFn: () => api.getBaseline(siteId),
    enabled: Boolean(siteId),
  })

  const schema = useMemo(
    () =>
      z.object({
        headcount: z
          .string()
          .trim()
          .refine(
            (v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1),
            t('admin.baselines.headcount_invalid'),
          ),
        notes: z.string().trim().max(1000, t('admin.baselines.notes_too_long')),
      }),
    [t],
  )

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<BaselineForm>({
    resolver: zodResolver(schema),
    defaultValues: { headcount: '', notes: '' },
  })

  // Re-seed the form whenever the selected site's baseline resolves.
  const data = baseline.data
  useEffect(() => {
    if (data) {
      reset({
        headcount:
          data.expected_daily_headcount != null
            ? String(data.expected_daily_headcount)
            : '',
        notes: data.notes ?? '',
      })
    }
  }, [data, reset])

  const [toast, setToast] = useState<{ status: Status; msg: string } | null>(null)

  const save = useMutation({
    mutationFn: (v: BaselineForm) =>
      api.setBaseline(siteId, {
        expected_daily_headcount: v.headcount.trim() === '' ? null : Number(v.headcount),
        notes: v.notes.trim() || null,
      }),
    onSuccess: (saved) => {
      qc.setQueryData(qk.baseline(siteId), saved)
      reset({
        headcount:
          saved.expected_daily_headcount != null
            ? String(saved.expected_daily_headcount)
            : '',
        notes: saved.notes ?? '',
      })
      // The brief's labor-shortfall / progress reads the baseline — refresh it.
      qc.invalidateQueries({ queryKey: ['home'] })
      setToast({ status: 'ok', msg: t('admin.baselines.saved') })
    },
    onError: () => setToast({ status: 'risk', msg: t('admin.baselines.save_failed') }),
  })

  return (
    <section aria-labelledby="admin-baselines-heading" className="flex flex-col gap-5">
      <header>
        <H2 id="admin-baselines-heading" as="h2">
          {t('admin.baselines.title')}
        </H2>
        <Small className="mt-1 block !text-text-mute">{t('admin.baselines.subtitle')}</Small>
      </header>

      {sites.isLoading ? (
        <Spinner label={t('admin.baselines.loading')} />
      ) : siteItems.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-paper p-4 text-center font-body text-small text-text-mute">
          {t('admin.baselines.no_sites')}
        </p>
      ) : (
        <>
          <SelectField
            label={t('admin.baselines.site_label')}
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
          >
            {siteItems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>

          {toast ? (
            <p role="status" aria-live="polite">
              <StatusPill status={toast.status} label={toast.msg} />
            </p>
          ) : null}

          {baseline.isLoading ? (
            <Spinner label={t('admin.baselines.loading')} />
          ) : baseline.isError ? (
            <ErrorState
              message={(baseline.error as Error)?.message ?? t('admin.baselines.error')}
              onRetry={() => baseline.refetch()}
            />
          ) : canManage ? (
            <form
              onSubmit={handleSubmit((v) => save.mutate(v))}
              className="flex flex-col gap-4"
              noValidate
            >
              <div>
                <TextField
                  label={t('admin.baselines.headcount_label')}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  mono
                  placeholder={t('admin.baselines.headcount_placeholder')}
                  hint={t('admin.baselines.headcount_hint')}
                  aria-invalid={errors.headcount ? true : undefined}
                  {...register('headcount')}
                />
                {errors.headcount ? (
                  <p role="alert" className="mt-1 font-body text-small font-medium text-risk">
                    {errors.headcount.message}
                  </p>
                ) : null}
              </div>

              <div>
                <TextField
                  label={t('admin.baselines.notes_label')}
                  placeholder={t('admin.baselines.notes_placeholder')}
                  aria-invalid={errors.notes ? true : undefined}
                  {...register('notes')}
                />
                {errors.notes ? (
                  <p role="alert" className="mt-1 font-body text-small font-medium text-risk">
                    {errors.notes.message}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!isDirty || isSubmitting || save.isPending}
                >
                  {save.isPending ? t('admin.baselines.saving') : t('admin.baselines.save')}
                </Button>
                {isDirty ? (
                  <Small className="!text-text-mute">{t('admin.baselines.unsaved')}</Small>
                ) : null}
              </div>
            </form>
          ) : (
            <Body className="!text-text-mute">{t('admin.baselines.read_only')}</Body>
          )}
        </>
      )}
    </section>
  )
}
