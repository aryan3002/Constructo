// Billing (W4.8) — the Setup & Administration billing-tracking section.
// TRACKING-ONLY: no payment rail, no charges (design-system invariant). Records
// the plan + invoice contact the company tells us. Backed by GET/PUT
// /api/v1/billing (owner-only write).
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi, type CompanyBilling } from '../../api/auth'
import { qk } from '../../api/queryKeys'
import { useCan } from '../../auth/useCan'
import { useT } from '../../i18n'
import { Body, Button, H2, Small, StatusPill, type Status } from '../../ui'
import { ErrorState, Spinner } from '../../components/states'
import { TextField } from '../../pages/auth/fields'

interface BillingForm {
  plan: string
  billing_email: string
  billing_contact: string
  notes: string
}

export function Billing() {
  const t = useT()
  const qc = useQueryClient()
  const canManage = useCan('manage_settings')

  const billing = useQuery({
    queryKey: qk.billing(),
    queryFn: () => authApi.getBilling(),
  })

  const schema = useMemo(
    () =>
      z.object({
        plan: z.string().trim().max(64),
        billing_email: z
          .string()
          .trim()
          .refine(
            (v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
            t('admin.billing.email_invalid'),
          ),
        billing_contact: z.string().trim().max(120),
        notes: z.string().trim().max(1000),
      }),
    [t],
  )

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<BillingForm>({
    resolver: zodResolver(schema),
    defaultValues: { plan: '', billing_email: '', billing_contact: '', notes: '' },
  })

  const data = billing.data
  useEffect(() => {
    if (data) {
      reset({
        plan: data.plan ?? '',
        billing_email: data.billing_email ?? '',
        billing_contact: data.billing_contact ?? '',
        notes: data.notes ?? '',
      })
    }
  }, [data, reset])

  const [toast, setToast] = useState<{ status: Status; msg: string } | null>(null)

  const save = useMutation({
    mutationFn: (v: BillingForm) => {
      const patch: Partial<CompanyBilling> = {
        plan: v.plan.trim() || null,
        billing_email: v.billing_email.trim() || null,
        billing_contact: v.billing_contact.trim() || null,
        notes: v.notes.trim() || null,
      }
      return authApi.updateBilling(patch)
    },
    onSuccess: (saved) => {
      qc.setQueryData(qk.billing(), saved)
      reset({
        plan: saved.plan ?? '',
        billing_email: saved.billing_email ?? '',
        billing_contact: saved.billing_contact ?? '',
        notes: saved.notes ?? '',
      })
      setToast({ status: 'ok', msg: t('admin.billing.saved') })
    },
    onError: () => setToast({ status: 'risk', msg: t('admin.billing.save_failed') }),
  })

  if (billing.isLoading) return <Spinner label={t('admin.billing.loading')} />
  if (billing.isError || !billing.data) {
    return (
      <ErrorState
        message={(billing.error as Error)?.message ?? t('admin.billing.error')}
        onRetry={() => billing.refetch()}
      />
    )
  }

  return (
    <section aria-labelledby="admin-billing-heading" className="flex flex-col gap-5">
      <header>
        <H2 id="admin-billing-heading" as="h2">
          {t('admin.billing.title')}
        </H2>
        <Small className="mt-1 block !text-text-mute">{t('admin.billing.subtitle')}</Small>
      </header>

      {/* Tracking-only invariant, stated plainly. */}
      <p className="rounded-card border border-dashed border-line bg-paper p-3 font-body text-small text-text-mute">
        {t('admin.billing.tracking_note')}
      </p>

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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <TextField
                label={t('admin.billing.plan_label')}
                placeholder={t('admin.billing.plan_placeholder')}
                {...register('plan')}
              />
            </Field>
            <Field error={errors.billing_email?.message}>
              <TextField
                label={t('admin.billing.email_label')}
                type="email"
                mono
                placeholder={t('admin.billing.email_placeholder')}
                aria-invalid={errors.billing_email ? true : undefined}
                {...register('billing_email')}
              />
            </Field>
            <Field>
              <TextField
                label={t('admin.billing.contact_label')}
                placeholder={t('admin.billing.contact_placeholder')}
                {...register('billing_contact')}
              />
            </Field>
            <Field>
              <TextField
                label={t('admin.billing.notes_label')}
                placeholder={t('admin.billing.notes_placeholder')}
                {...register('notes')}
              />
            </Field>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={!isDirty || isSubmitting || save.isPending}
            >
              {save.isPending ? t('admin.billing.saving') : t('admin.billing.save')}
            </Button>
            {isDirty ? (
              <Small className="!text-text-mute">{t('admin.billing.unsaved')}</Small>
            ) : null}
          </div>
        </form>
      ) : (
        <Body className="!text-text-mute">{t('admin.billing.read_only')}</Body>
      )}
    </section>
  )
}

function Field({ error, children }: { error?: string; children: React.ReactNode }) {
  return (
    <div>
      {children}
      {error ? (
        <p role="alert" className="mt-1 font-body text-small font-medium text-risk">
          {error}
        </p>
      ) : null}
    </div>
  )
}
