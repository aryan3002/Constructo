/**
 * ReportsPage (E5 — W5 Slice 1).
 *
 * Left panel: template list (filtered by role/cap).
 * Right panel: builder for the selected template — site selector, date/range
 *   inputs, Generate button, PDF preview or CSV download.
 *
 * PDF generation: calls reportsApi.* → Blob → URL.createObjectURL → <object>
 *   preview + <a download> link.
 *
 * Tally CSV: mirrors TallyExportButton's OTP state machine exactly:
 *   idle → working → (StepUpRequiredError) → otp → working → done.
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '../../api/auth'
import { qk } from '../../api/queryKeys'
import { reportsApi } from '../../api/reports'
import { reconcileApi } from '../../api/reconcile'
import { StepUpRequiredError } from '../../api/errors'
import { ApiError } from '../../api/client'
import { useSites } from '../../api/hooks'
import { useCan, useMeRole } from '../../auth/useCan'
import { useT } from '../../i18n'
import { AppShell, Button, useRoleTabs, type Role as ShellRole } from '../../ui'
import { EmptyState, ErrorState, Spinner } from '../../components/states'
import { TEMPLATES, type TemplateId, type TemplateDef } from './templates'

// ---------------------------------------------------------------------------
// Role-based template visibility
// ---------------------------------------------------------------------------

function useVisibleTemplates(): TemplateDef[] {
  const role = useMeRole()
  const canExportTally = useCan('export_tally')

  return TEMPLATES.filter((tpl) => {
    if (tpl.id === 'payroll') return true // always shown, but disabled
    if (tpl.id === 'tally') return canExportTally
    if (tpl.id === 'dpr') return role === 'owner' || role === 'accountant' || role === 'pm'
    if (tpl.id === 'progress') return role === 'owner' || role === 'accountant'
    return false
  })
}

// ---------------------------------------------------------------------------
// PDF generation state
// ---------------------------------------------------------------------------

type PdfPhase = 'idle' | 'generating' | 'ready' | 'error'

// ---------------------------------------------------------------------------
// OTP / CSV state machine (mirror of TallyExportButton)
// ---------------------------------------------------------------------------

type CsvPhase = 'idle' | 'otp' | 'working' | 'done' | 'error'

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// ReportBuilder — right-hand panel
// ---------------------------------------------------------------------------

interface BuilderProps {
  tpl: TemplateDef
  sites: Array<{ id: string; name: string }>
}

function ReportBuilder({ tpl, sites }: BuilderProps) {
  const t = useT()

  // shared form state
  const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? '')
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [from, setFrom] = useState<string>(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  )
  const [to, setTo] = useState<string>(new Date().toISOString().slice(0, 10))

  // PDF state
  const [pdfPhase, setPdfPhase] = useState<PdfPhase>('idle')
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const prevUrlRef = useRef<string | null>(null)

  // CSV / OTP state
  const [csvPhase, setCsvPhase] = useState<CsvPhase>('idle')
  const [csvError, setCsvError] = useState<string | null>(null)
  const [otp, setOtp] = useState<string>('')
  const [stepUpToken, setStepUpToken] = useState<string | null>(null)

  // Revoke the previous object URL when generating a new PDF or unmounting.
  function revokePrev() {
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current)
      prevUrlRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      revokePrev()
    }
  }, [])

  // Reset state when the template changes.
  useEffect(() => {
    setPdfPhase('idle')
    setPdfError(null)
    revokePrev()
    setPdfUrl(null)
    setCsvPhase('idle')
    setCsvError(null)
    setOtp('')
    setStepUpToken(null)
  }, [tpl.id])

  // --- PDF generation ---
  async function handleGeneratePdf() {
    revokePrev()
    setPdfUrl(null)
    setPdfPhase('generating')
    setPdfError(null)
    try {
      let blob: Blob
      if (tpl.id === 'dpr') {
        blob = await reportsApi.dprPackPdf(siteId, date)
      } else {
        blob = await reportsApi.progressPdf(tpl.needsSite ? siteId : null, from, to)
      }
      const url = URL.createObjectURL(blob)
      prevUrlRef.current = url
      setPdfUrl(url)
      setPdfPhase('ready')
    } catch {
      setPdfPhase('error')
      setPdfError(t('reports.error'))
    }
  }

  // --- CSV / OTP flow ---
  async function runCsvExport(token: string | null) {
    setCsvPhase('working')
    setCsvError(null)
    try {
      const csv = await reconcileApi.exportTally(siteId, token)
      downloadCsv(csv, `tally-${siteId}.csv`)
      setCsvPhase('done')
    } catch (e) {
      if (e instanceof StepUpRequiredError) {
        setStepUpToken(null)
        setCsvPhase('otp')
        return
      }
      setCsvPhase('error')
      setCsvError(t('reports.otp_error'))
    }
  }

  async function verifyAndExport() {
    setCsvPhase('working')
    setCsvError(null)
    try {
      const { token } = await authApi.stepUpVerify(otp)
      setStepUpToken(token)
      setOtp('')
      await runCsvExport(token)
    } catch (e) {
      setCsvPhase('otp')
      setCsvError(
        e instanceof ApiError && e.status === 401
          ? t('reports.otp_bad')
          : t('reports.otp_error'),
      )
    }
  }

  async function handleGenerate() {
    if (tpl.fmt === 'pdf') {
      await handleGeneratePdf()
    } else {
      // CSV — start the OTP-gated flow
      await runCsvExport(stepUpToken)
    }
  }

  const formValid =
    (!tpl.needsSite || Boolean(siteId)) &&
    (tpl.id !== 'dpr' || Boolean(date)) &&
    (tpl.id !== 'progress' || (Boolean(from) && Boolean(to)))

  return (
    <div className="flex flex-col gap-5">
      {/* --- Site selector --- */}
      {tpl.needsSite && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor="report-site"
            className="font-body text-small font-semibold text-text-mute"
          >
            {t('reports.site_label')}
          </label>
          <select
            id="report-site"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="min-h-tap rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* --- Date input (DPR) --- */}
      {tpl.id === 'dpr' && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor="report-date"
            className="font-body text-small font-semibold text-text-mute"
          >
            {t('reports.date_label')}
          </label>
          <input
            id="report-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-tap rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
      )}

      {/* --- From / To inputs (progress) --- */}
      {tpl.id === 'progress' && (
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label
              htmlFor="report-from"
              className="font-body text-small font-semibold text-text-mute"
            >
              {t('reports.from_label')}
            </label>
            <input
              id="report-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="min-h-tap w-full rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label
              htmlFor="report-to"
              className="font-body text-small font-semibold text-text-mute"
            >
              {t('reports.to_label')}
            </label>
            <input
              id="report-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="min-h-tap w-full rounded-control border border-line bg-paper px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
        </div>
      )}

      {/* --- OTP prompt (tally, step-up gate) --- */}
      {csvPhase === 'otp' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void verifyAndExport()
          }}
          className="flex flex-col gap-2"
        >
          <p className="font-body text-small font-semibold text-text">
            {t('reports.otp_required')}
          </p>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="reports-otp">
              {t('reports.otp_label')}
            </label>
            <input
              id="reports-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder={t('reports.otp_prompt')}
              className="min-h-tap w-44 rounded-control border border-line bg-paper px-3 font-body text-small text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <Button type="submit" variant="primary" disabled={otp.length === 0}>
              {t('reports.otp_verify')}
            </Button>
          </div>
          {csvError && (
            <p role="alert" className="font-body text-small text-risk">
              {csvError}
            </p>
          )}
        </form>
      )}

      {/* --- Generate button (not shown during OTP flow) --- */}
      {csvPhase !== 'otp' && (
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            onClick={() => void handleGenerate()}
            disabled={
              !formValid ||
              pdfPhase === 'generating' ||
              csvPhase === 'working'
            }
          >
            {pdfPhase === 'generating' || csvPhase === 'working'
              ? t('reports.generating')
              : t('reports.generate')}
          </Button>
        </div>
      )}

      {/* --- Error state (PDF) --- */}
      {pdfPhase === 'error' && pdfError && (
        <ErrorState
          message={pdfError}
          onRetry={() => void handleGeneratePdf()}
          retryLabel={t('action.retry')}
        />
      )}

      {/* --- Error state (CSV non-OTP) --- */}
      {csvPhase === 'error' && csvError && (
        <ErrorState message={csvError} onRetry={() => void handleGenerate()} />
      )}

      {/* --- PDF preview + download --- */}
      {pdfPhase === 'ready' && pdfUrl && (
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-card border border-line shadow-card">
            <object
              data={pdfUrl}
              type="application/pdf"
              aria-label={t('reports.preview')}
              className="h-96 w-full"
            >
              {/* Fallback for browsers that don't render PDF inline. */}
              <p className="p-4 font-body text-small text-text-mute">{t('reports.preview')}</p>
            </object>
          </div>
          <a
            href={pdfUrl}
            download={tpl.id === 'dpr' ? `dpr-${siteId}-${date}.pdf` : `progress-${from}-${to}.pdf`}
            className="inline-flex min-h-tap items-center justify-center rounded-control bg-primary px-4 font-body text-small font-semibold text-white cstk-animate hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {t('reports.download')}
          </a>
        </div>
      )}

      {/* --- CSV done state --- */}
      {csvPhase === 'done' && (
        <p role="status" className="font-body text-small text-ok">
          {t('reports.download')}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TemplateList — left panel
// ---------------------------------------------------------------------------

interface TemplateListProps {
  templates: TemplateDef[]
  selected: TemplateId | null
  onSelect: (id: TemplateId) => void
}

function TemplateList({ templates, selected, onSelect }: TemplateListProps) {
  const t = useT()
  return (
    <ul className="flex flex-col gap-1" role="listbox" aria-label={t('reports.title')}>
      {templates.map((tpl) => {
        const isSelected = tpl.id === selected
        const isDisabled = !tpl.enabled
        return (
          <li key={tpl.id} role="option" aria-selected={isSelected}>
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => !isDisabled && onSelect(tpl.id)}
              className={[
                'flex w-full items-center justify-between rounded-control border px-4 py-3 text-left font-body text-body cstk-animate',
                isSelected
                  ? 'border-primary bg-primary/5 font-semibold text-primary'
                  : 'border-line bg-card text-text hover:border-primary/50',
                isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span>{t(tpl.labelKey as Parameters<typeof t>[0])}</span>
              {isDisabled && (
                <span className="font-body text-small text-text-mute">{t('reports.payroll_soon')}</span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// ReportsPage — main export
// ---------------------------------------------------------------------------

export function ReportsPage() {
  const t = useT()
  const role = useMeRole() ?? 'owner'
  const tabs = useRoleTabs(role as ShellRole)
  const templates = useVisibleTemplates()
  const [selectedId, setSelectedId] = useState<TemplateId | null>(
    templates.find((t) => t.enabled)?.id ?? null,
  )

  // Sites query — reuse the same hook as Sites.tsx / ReconcilePage.
  const { data, isLoading, isError, error, refetch } = useSites()

  // Auth me query for AppShell (follows the same pattern as Sites.tsx).
  const me = useQuery({
    queryKey: qk.me(),
    queryFn: () => authApi.me(),
    staleTime: Infinity,
    retry: 1,
  })

  const sites = (data?.items ?? []).map((s) => ({ id: s.id, name: s.name }))
  const selectedTpl = templates.find((t) => t.id === selectedId) ?? null

  return (
    <AppShell role={role as ShellRole} tabs={tabs}>
      <header className="mb-6">
        <h1 className="font-display text-h1 font-bold text-text">{t('reports.title')}</h1>
      </header>

      {/* Sites loading/error guards */}
      {isLoading && <Spinner label={t('common.loading')} />}
      {isError && (
        <ErrorState
          message={(error as Error)?.message ?? t('reports.error')}
          onRetry={() => refetch()}
          retryLabel={t('action.retry')}
        />
      )}
      {!isLoading && !isError && sites.length === 0 && (
        <EmptyState title={t('reports.no_sites')} />
      )}

      {!isLoading && !isError && sites.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-[220px_1fr]">
          {/* Left: template list */}
          <TemplateList
            templates={templates}
            selected={selectedId}
            onSelect={(id) => setSelectedId(id)}
          />

          {/* Right: builder for the selected template */}
          <div className="rounded-card border border-line bg-card p-5 shadow-card">
            {selectedTpl ? (
              <ReportBuilder
                key={selectedTpl.id}
                tpl={selectedTpl}
                sites={sites}
              />
            ) : (
              <p className="font-body text-small text-text-mute">
                {t('reports.empty')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Suppress unused me query warning — AppShell uses it. */}
      {me.data ? null : null}
    </AppShell>
  )
}
