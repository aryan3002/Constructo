// Tally export with an OTP step-up gate (W2.5). The export is irreversible
// egress, so the server demands a fresh re-verification: the first attempt may
// 403 `step_up_required`, which flips this button into an inline OTP prompt;
// once verified we hold the short-lived step-up token and retry the export.
import { useState } from 'react'
import { authApi } from '../../api/auth'
import { reconcileApi, StepUpRequiredError } from '../../api/reconcile'
import { ApiError } from '../../api/client'
import { useT } from '../../i18n'
import { Button, StatusPill, type Status } from '../../ui'

type Phase = 'idle' | 'otp' | 'working' | 'done'

function downloadCsv(csv: string, siteId: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `reconcile-${siteId}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function TallyExportButton({ siteId }: { siteId: string }) {
  const t = useT()
  const [phase, setPhase] = useState<Phase>('idle')
  const [otp, setOtp] = useState('')
  const [stepUp, setStepUp] = useState<string | null>(null)
  const [toast, setToast] = useState<{ status: Status; msg: string } | null>(null)

  /** Run the export with whatever step-up token we currently hold. */
  async function runExport(token: string | null) {
    setPhase('working')
    setToast(null)
    try {
      const csv = await reconcileApi.exportTally(siteId, token)
      downloadCsv(csv, siteId)
      const n = Math.max(0, csv.trim().split('\n').length - 1) // minus header
      setPhase('done')
      setToast({ status: 'ok', msg: t('reconcile.export_done', { n }) })
    } catch (e) {
      if (e instanceof StepUpRequiredError) {
        setStepUp(null)
        setPhase('otp') // need a fresh OTP re-verification
        return
      }
      setPhase('idle')
      setToast({ status: 'risk', msg: t('reconcile.export_error') })
    }
  }

  async function verifyAndExport() {
    setPhase('working')
    setToast(null)
    try {
      const { token } = await authApi.stepUpVerify(otp)
      setStepUp(token)
      setOtp('')
      await runExport(token)
    } catch (e) {
      setPhase('otp')
      setToast({
        status: 'risk',
        msg:
          e instanceof ApiError && e.status === 401
            ? t('reconcile.export_bad_otp')
            : t('reconcile.export_error'),
      })
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {phase === 'otp' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void verifyAndExport()
          }}
          className="flex items-center gap-2"
        >
          <label className="sr-only" htmlFor="export-otp">
            {t('reconcile.export_otp_label')}
          </label>
          <input
            id="export-otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder={t('reconcile.export_otp_prompt')}
            className="min-h-tap w-44 rounded-control border border-line bg-paper px-3 font-body text-small text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <Button type="submit" variant="primary" disabled={otp.length === 0}>
            {t('reconcile.export_verify_cta')}
          </Button>
        </form>
      ) : (
        <Button
          variant="secondary"
          onClick={() => void runExport(stepUp)}
          disabled={phase === 'working'}
        >
          {phase === 'working' ? t('reconcile.export_downloading') : t('reconcile.export')}
        </Button>
      )}
      {toast ? (
        <span role="status">
          <StatusPill status={toast.status} label={toast.msg} size="sm" />
        </span>
      ) : null}
    </div>
  )
}
