import { useState } from 'react'
import {
  Body,
  Button,
  EvidenceCard,
  Mono,
  Small,
  StatusPill,
  type EvidenceItem,
} from '../../ui'
import { useT } from '../../i18n'
import {
  reconcileApi,
  type GrnDraft,
  type ReconcileEventSide,
  type ReconcileItem,
} from '../../api/reconcile'
import { ApiError } from '../../api/client'
import { formatDate } from '../../lib/format'
import { RECONCILE_STATUS, formatInr, formatQty, reasonKey, statusKey } from './helpers'

/** Build the EvidenceCard rows for one side (delivery or invoice). */
function sideEvidence(
  side: ReconcileEventSide | null,
  kind: 'challan' | 'message',
  t: ReturnType<typeof useT>,
  noProof: string,
): EvidenceItem[] {
  if (!side) {
    return [{ kind: 'message', label: noProof }]
  }
  const lines: string[] = []
  if (side.vendor) lines.push(`${t('reconcile.field.vendor')}: ${side.vendor}`)
  if (side.material) lines.push(`${t('reconcile.field.item')}: ${side.material}`)
  if (side.quantity != null)
    lines.push(`${t('reconcile.field.quantity')}: ${formatQty(side.quantity, side.unit)}`)
  if (side.amount != null)
    lines.push(`${t('reconcile.field.amount')}: ${formatInr(side.amount)}`)
  if (side.invoice_number)
    lines.push(`${t('reconcile.field.invoice_number')}: ${side.invoice_number}`)
  return [
    {
      kind,
      label: side.summary,
      detail: lines.join(' · '),
      meta: formatDate(side.occurred_on),
    },
  ]
}

export interface ReconcileDetailProps {
  item: ReconcileItem
  /** Notify the parent so it can refetch after a successful hold. */
  onHeld?: () => void
}

/**
 * Detail view for a single reconciliation row: an EvidenceCard for BOTH sides
 * of the comparison, the amount-at-risk, a "Hold payment" action that creates a
 * B0 decision routed to the owner, and a draft GRN.
 */
export function ReconcileDetail({ item, onHeld }: ReconcileDetailProps) {
  const t = useT()
  const status = RECONCILE_STATUS[item.status]
  const [note, setNote] = useState('')
  const [holding, setHolding] = useState(false)
  const [held, setHeld] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [grn, setGrn] = useState<GrnDraft | null>(null)
  const [grnError, setGrnError] = useState<string | null>(null)
  const [grnLoading, setGrnLoading] = useState(false)

  const canHold = item.status !== 'matched'

  async function handleHold() {
    setHolding(true)
    setError(null)
    try {
      const res = await reconcileApi.holdPayment({
        invoice_event_id: item.invoice?.event_id ?? null,
        delivery_event_id: item.delivery?.event_id ?? null,
        amount_at_risk: item.amount_at_risk,
        note: note.trim() || null,
      })
      setHeld(res.decision_id)
      onHeld?.()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('reconcile.hold.error'))
    } finally {
      setHolding(false)
    }
  }

  async function handleGrn() {
    if (!item.delivery) return
    setGrnLoading(true)
    setGrnError(null)
    try {
      setGrn(await reconcileApi.grnDraft(item.delivery.event_id))
    } catch (err) {
      setGrnError(err instanceof ApiError ? err.message : t('reconcile.grn.error'))
    } finally {
      setGrnLoading(false)
    }
  }

  return (
    <section aria-label={t('reconcile.detail_heading')} className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Body as="h2" className="font-semibold !text-text">
            {item.vendor ?? '—'}
          </Body>
          <Small>{item.item ?? '—'}</Small>
        </div>
        <StatusPill status={status} label={t(statusKey(item.status))} />
      </header>

      {item.amount_at_risk > 0 && (
        <div className="rounded-card border border-risk/30 bg-risk/10 px-4 py-3">
          <Small className="!text-risk">{t('reconcile.amount_at_risk')}</Small>
          <Mono className="block text-h1 font-semibold text-risk">
            {formatInr(item.amount_at_risk)}
          </Mono>
        </div>
      )}

      {item.reasons.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="reasons">
          {item.reasons.map((r) => (
            <li key={r}>
              <StatusPill status={status} size="sm" label={t(reasonKey(r))} />
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <EvidenceCard
          claim={t('reconcile.side.delivery')}
          status={item.delivery ? status : 'info'}
          detail={item.delivery?.vendor ?? undefined}
          defaultOpen
          evidence={sideEvidence(item.delivery, 'challan', t, t('reconcile.no_proof'))}
        />
        <EvidenceCard
          claim={t('reconcile.side.invoice')}
          status={item.invoice ? status : 'info'}
          detail={item.invoice?.invoice_number ?? undefined}
          defaultOpen
          evidence={sideEvidence(item.invoice, 'message', t, t('reconcile.no_proof'))}
        />
      </div>

      {/* Draft GRN from the delivery side */}
      {item.delivery && (
        <div className="rounded-card border border-line bg-card p-4">
          {!grn ? (
            <Button variant="secondary" onClick={handleGrn} disabled={grnLoading}>
              {grnLoading ? t('reconcile.grn.loading') : t('reconcile.action.view_grn')}
            </Button>
          ) : (
            <div className="space-y-1">
              <Body as="h3" className="font-semibold !text-text">
                {t('reconcile.grn.title')}
              </Body>
              <Small>
                {t('reconcile.grn.reference')}: <Mono>{grn.reference}</Mono>
              </Small>
              <Small className="block">
                {t('reconcile.grn.received_on')}: {formatDate(grn.received_on)}
              </Small>
              <Small className="block">{grn.note}</Small>
            </div>
          )}
          {grnError && (
            <Small className="mt-2 block !text-risk" role="alert">
              {grnError}
            </Small>
          )}
        </div>
      )}

      {/* Hold payment -> creates a B0 decision routed to the owner */}
      {canHold && !held && (
        <div className="rounded-card border border-line bg-card p-4 space-y-3">
          <label className="block">
            <Small className="mb-1 block font-semibold !text-text">
              {t('reconcile.hold.note_label')}
            </Small>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('reconcile.hold.note_placeholder')}
              rows={2}
              className="w-full rounded-control border border-line bg-paper px-3 py-2 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
          <Button variant="danger" onClick={handleHold} disabled={holding} block>
            {holding ? t('reconcile.action.holding') : t('reconcile.hold.confirm')}
          </Button>
          <Small className="block text-text-mute">{t('reconcile.hold.routed')}</Small>
          {error && (
            <Small className="block !text-risk" role="alert">
              {error}
            </Small>
          )}
        </div>
      )}

      {held && (
        <div role="status">
          <StatusPill status="ok" label={t('reconcile.hold.success')} />
        </div>
      )}
    </section>
  )
}
