// Company Profile (W4.1 shell, W4.2 fields) — the first form of the Setup &
// Administration control plane and the template every later admin form follows:
// React-Hook-Form + Zod (validation co-located, typed values), reading the
// current company via GET /auth/company and writing the owner-only PATCH.
//
// Editable: name, GST number, address, timezone, currency (all tracking-only —
// no payments rail). Empty optional fields are sent as null, not "".
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi, type CompanyUpdate } from '../../api/auth'
import { qk } from '../../api/queryKeys'
import { useCan } from '../../auth/useCan'
import { useT } from '../../i18n'
import { Body, Button, H2, Mono, Small, StatusPill, type Status } from '../../ui'
import { ErrorState, Spinner } from '../../components/states'
import { SelectField, TextField } from '../../pages/auth/fields'

interface CompanyForm {
  name: string
  gstin: string
  address: string
  timezone: string
  currency: string
}

const CURRENCIES = ['INR', 'USD', 'AED', 'GBP', 'EUR']

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
        gstin: z.string().trim().max(32, t('admin.company.gstin_too_long')),
        address: z.string().trim().max(500, t('admin.company.address_too_long')),
        timezone: z.string().trim().min(1, t('admin.company.timezone_required')).max(64),
        currency: z.string().trim().min(1).max(8),
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
    defaultValues: {
      name: '',
      gstin: '',
      address: '',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
    },
  })

  // Seed the form the moment the GET resolves (null optionals → empty strings).
  const data = company.data
  useEffect(() => {
    if (data) {
      reset({
        name: data.name,
        gstin: data.gstin ?? '',
        address: data.address ?? '',
        timezone: data.timezone,
        currency: data.currency,
      })
    }
  }, [data, reset])

  const [toast, setToast] = useState<{ status: Status; msg: string } | null>(null)

  const save = useMutation({
    mutationFn: (v: CompanyForm) => {
      const patch: CompanyUpdate = {
        name: v.name,
        gstin: v.gstin.trim() || null,
        address: v.address.trim() || null,
        timezone: v.timezone,
        currency: v.currency,
      }
      return authApi.updateCompany(patch)
    },
    onSuccess: (saved) => {
      qc.setQueryData(qk.company(), saved)
      reset({
        name: saved.name,
        gstin: saved.gstin ?? '',
        address: saved.address ?? '',
        timezone: saved.timezone,
        currency: saved.currency,
      })
      setToast({ status: 'ok', msg: t('admin.company.saved') })
    },
    onError: () => setToast({ status: 'risk', msg: t('admin.company.save_failed') }),
  })

  // -------------------------------------------------------------------------
  // Logo upload
  // -------------------------------------------------------------------------
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoErr, setLogoErr] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  async function onLogoFile(file: File) {
    setLogoErr(null)
    setLogoBusy(true)
    try {
      const content_type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      const ticket = await authApi.presignCompanyLogo({ content_type })
      if (ticket.upload_mode !== 'presigned' || !ticket.put_url) {
        setLogoErr(t('admin.company.logo_unavailable'))
        return
      }
      const put = await fetch(ticket.put_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': content_type },
      })
      if (!put.ok) throw new Error(`R2 PUT ${put.status}`)
      const saved = await authApi.updateCompany({ logo_key: ticket.key })
      qc.setQueryData(qk.company(), saved)
    } catch {
      setLogoErr(t('admin.company.logo_failed'))
    } finally {
      setLogoBusy(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  async function removeLogo() {
    const saved = await authApi.updateCompany({ logo_key: null })
    qc.setQueryData(qk.company(), saved)
  }

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

      {/* Logo block + letterhead preview — shown to all roles; upload controls owner-only. */}
      {(() => {
        const logoUrl = company.data?.logo_url ?? null
        return (
          <section className="flex flex-col gap-2">
            <div className="font-body text-small font-semibold text-text">{t('admin.company.logo_label')}</div>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-card border border-edge bg-surface-sunken">
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="font-body text-micro text-text-mute">—</span>
                )}
              </div>
              {canManage ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    aria-label={t('admin.company.logo_upload')}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void onLogoFile(f)
                    }}
                  />
                  <Button
                    variant="ghost"
                    disabled={logoBusy}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {logoBusy ? t('admin.company.logo_uploading') : t('admin.company.logo_upload')}
                  </Button>
                  {logoUrl ? (
                    <Button variant="ghost" onClick={() => void removeLogo()}>
                      {t('admin.company.logo_remove')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <Small className="!text-text-mute">{t('admin.company.logo_hint')}</Small>
            {logoErr ? (
              <Small className="!text-risk" role="alert">
                {logoErr}
              </Small>
            ) : null}
            {/* Letterhead preview — mirrors the PDF letterhead */}
            <div className="mt-2 rounded-card border border-edge p-4">
              <div className="font-body text-micro font-semibold uppercase tracking-wide text-text-mute">
                {t('admin.company.logo_preview_title')}
              </div>
              <div className="mt-2 border-b-2 border-celebrate pb-2">
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="mb-1 max-h-10 object-contain" />
                ) : null}
                <div className="font-heading text-h3 text-text">{company.data?.name}</div>
                {company.data?.gstin ? (
                  <div className="font-body text-micro text-text-mute">
                    GSTIN: {company.data.gstin}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        )
      })()}

      {canManage ? (
        <form
          onSubmit={handleSubmit((v) => save.mutate(v))}
          className="flex flex-col gap-4"
          noValidate
        >
          <Field error={errors.name?.message}>
            <TextField
              label={t('admin.company.name_label')}
              required
              placeholder={t('admin.company.name_placeholder')}
              aria-invalid={errors.name ? true : undefined}
              {...register('name')}
            />
          </Field>

          <Field error={errors.gstin?.message}>
            <TextField
              label={t('admin.company.gstin_label')}
              placeholder={t('admin.company.gstin_placeholder')}
              hint={t('admin.company.gstin_hint')}
              mono
              aria-invalid={errors.gstin ? true : undefined}
              {...register('gstin')}
            />
          </Field>

          <Field error={errors.address?.message}>
            <TextField
              label={t('admin.company.address_label')}
              placeholder={t('admin.company.address_placeholder')}
              aria-invalid={errors.address ? true : undefined}
              {...register('address')}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field error={errors.timezone?.message}>
              <TextField
                label={t('admin.company.timezone_label')}
                required
                mono
                aria-invalid={errors.timezone ? true : undefined}
                {...register('timezone')}
              />
            </Field>
            <Field>
              <SelectField label={t('admin.company.currency_label')} {...register('currency')}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectField>
            </Field>
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
        <dl className="flex flex-col gap-3">
          <ReadOnly label={t('admin.company.name_label')} value={company.data.name} />
          <ReadOnly label={t('admin.company.gstin_label')} value={company.data.gstin} mono />
          <ReadOnly label={t('admin.company.address_label')} value={company.data.address} />
          <ReadOnly label={t('admin.company.currency_label')} value={company.data.currency} />
          <Small className="!text-text-mute">{t('admin.company.read_only')}</Small>
        </dl>
      )}

      {/* Metadata. */}
      <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 border-t border-line pt-4">
        <dt className="font-body text-small text-text-mute">{t('admin.company.id_label')}</dt>
        <dd>
          <Mono className="text-small text-text-mute">{company.data.id}</Mono>
        </dd>
      </dl>
    </section>
  )
}

/** Field wrapper: renders an optional validation error below the control. */
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

function ReadOnly({
  label,
  value,
  mono,
}: {
  label: string
  value: string | null
  mono?: boolean
}) {
  return (
    <div>
      <Small className="!text-text-mute">{label}</Small>
      <Body className={`mt-0.5 font-semibold ${mono ? 'cstk-mono' : ''}`}>
        {value || '—'}
      </Body>
    </div>
  )
}
