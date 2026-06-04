// Notifications & SLA (W4.7) — the Setup & Administration section for the
// company's escalation + digest preferences. `escalate_overdue` is honoured by
// the SLA sweep immediately; `sla_hours` is the documented target window;
// `daily_digest` governs the nightly brief. Backed by GET/PUT
// /api/v1/notifications/settings (owner-only write).
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { approvalsApi, type NotificationSettings as Settings } from '../../api/approvals'
import { qk } from '../../api/queryKeys'
import { useCan } from '../../auth/useCan'
import { useT } from '../../i18n'
import { Body, Button, H2, Small, StatusPill, type Status } from '../../ui'
import { ErrorState, Spinner } from '../../components/states'
import { TextField } from '../../pages/auth/fields'
import { Toggle } from '../../pages/settings/Toggle'

interface SettingsForm {
  sla_hours: string
  escalate_overdue: boolean
  daily_digest: boolean
}

export function NotificationSettings() {
  const t = useT()
  const qc = useQueryClient()
  const canManage = useCan('manage_settings')

  const settings = useQuery({
    queryKey: qk.notificationSettings(),
    queryFn: () => approvalsApi.getSettings(),
  })

  const schema = useMemo(
    () =>
      z.object({
        sla_hours: z
          .string()
          .trim()
          .refine(
            (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 168,
            t('admin.notif.sla_invalid'),
          ),
        escalate_overdue: z.boolean(),
        daily_digest: z.boolean(),
      }),
    [t],
  )

  const {
    handleSubmit,
    register,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<SettingsForm>({
    resolver: zodResolver(schema),
    defaultValues: { sla_hours: '24', escalate_overdue: true, daily_digest: true },
  })

  const data = settings.data
  useEffect(() => {
    if (data) {
      reset({
        sla_hours: String(data.sla_hours),
        escalate_overdue: data.escalate_overdue,
        daily_digest: data.daily_digest,
      })
    }
  }, [data, reset])

  const [toast, setToast] = useState<{ status: Status; msg: string } | null>(null)

  const save = useMutation({
    mutationFn: (v: SettingsForm) => {
      const patch: Partial<Settings> = {
        sla_hours: Number(v.sla_hours),
        escalate_overdue: v.escalate_overdue,
        daily_digest: v.daily_digest,
      }
      return approvalsApi.updateSettings(patch)
    },
    onSuccess: (saved) => {
      qc.setQueryData(qk.notificationSettings(), saved)
      reset({
        sla_hours: String(saved.sla_hours),
        escalate_overdue: saved.escalate_overdue,
        daily_digest: saved.daily_digest,
      })
      setToast({ status: 'ok', msg: t('admin.notif.saved') })
    },
    onError: () => setToast({ status: 'risk', msg: t('admin.notif.save_failed') }),
  })

  if (settings.isLoading) return <Spinner label={t('admin.notif.loading')} />
  if (settings.isError || !settings.data) {
    return (
      <ErrorState
        message={(settings.error as Error)?.message ?? t('admin.notif.error')}
        onRetry={() => settings.refetch()}
      />
    )
  }

  const escalate = watch('escalate_overdue')
  const digest = watch('daily_digest')

  return (
    <section aria-labelledby="admin-notif-heading" className="flex flex-col gap-5">
      <header>
        <H2 id="admin-notif-heading" as="h2">
          {t('admin.notif.title')}
        </H2>
        <Small className="mt-1 block !text-text-mute">{t('admin.notif.subtitle')}</Small>
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
          <div className="max-w-xs">
            <TextField
              label={t('admin.notif.sla_label')}
              type="number"
              inputMode="numeric"
              min={1}
              max={168}
              mono
              hint={t('admin.notif.sla_hint')}
              aria-invalid={errors.sla_hours ? true : undefined}
              {...register('sla_hours')}
            />
            {errors.sla_hours ? (
              <p role="alert" className="mt-1 font-body text-small font-medium text-risk">
                {errors.sla_hours.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col divide-y divide-line rounded-card border border-line px-4">
            <Toggle
              label={t('admin.notif.escalate_label')}
              hint={t('admin.notif.escalate_hint')}
              checked={escalate}
              onChange={(v) => setValue('escalate_overdue', v, { shouldDirty: true })}
            />
            <Toggle
              label={t('admin.notif.digest_label')}
              hint={t('admin.notif.digest_hint')}
              checked={digest}
              onChange={(v) => setValue('daily_digest', v, { shouldDirty: true })}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={!isDirty || isSubmitting || save.isPending}
            >
              {save.isPending ? t('admin.notif.saving') : t('admin.notif.save')}
            </Button>
            {isDirty ? (
              <Small className="!text-text-mute">{t('admin.notif.unsaved')}</Small>
            ) : null}
          </div>
        </form>
      ) : (
        <Body className="!text-text-mute">{t('admin.notif.read_only')}</Body>
      )}
    </section>
  )
}
