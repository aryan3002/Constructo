/**
 * DisputeModal — raise / resolve / withdraw a dispute on a contested capture
 * card (Phase D). Opened from a CaptureCard.
 *
 *  - Not contested → a raise form (any crew): reason → raise.
 *  - Contested → the open dispute's reason, then:
 *      owner/pm:  Keep as recorded | Accept correction (resolve)
 *      raiser:    Withdraw
 *      others:    read-only ("an owner/PM will resolve").
 *
 * RBAC mirrors the backend (it 403-gates resolve regardless). Tokens only.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal } from '../../../ui/Modal'
import { Button } from '../../../ui/Button'
import { useToast } from '../../../ui/Toast'
import { useMe, useMeRole } from '../../../auth/useCan'
import { disputesApi } from '../../../api/disputes'

export interface DisputeModalProps {
  open: boolean
  onClose: () => void
  eventId: string
  /** From the card's event — drives raise vs resolve mode. */
  contested: boolean
  /** Parent invalidates the thread so the card's contested flag refreshes. */
  onChanged?: () => void
}

export function DisputeModal({ open, onClose, eventId, contested, onChanged }: DisputeModalProps) {
  const { show } = useToast()
  const { data: me } = useMe()
  const role = useMeRole()
  const isAuthority = role === 'owner' || role === 'pm'
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const q = useQuery({
    queryKey: ['chat', 'disputes', eventId],
    queryFn: () => disputesApi.list(eventId),
    enabled: open && contested,
  })
  const openDispute = (q.data ?? []).find((d) => d.status === 'open') ?? null
  const isRaiser = !!me?.id && openDispute?.raised_by === me.id

  async function run(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true)
    try {
      await fn()
      onChanged?.()
      show({ status: 'ok', message: okMsg })
      onClose()
    } catch (e) {
      show({ status: 'risk', message: e instanceof Error ? e.message : 'Something went wrong' })
    } finally {
      setBusy(false)
    }
  }

  // ---- raise mode ----
  if (!contested) {
    const footer = (
      <div className="flex justify-end gap-3">
        <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          type="button"
          disabled={!reason.trim() || busy}
          onClick={() => run(() => disputesApi.raise(eventId, { reason: reason.trim() }), 'Dispute raised')}
        >
          Raise dispute
        </Button>
      </div>
    )
    return (
      <Modal open={open} onClose={onClose} title="Dispute this card" footer={footer}>
        <div className="flex flex-col gap-2">
          <label htmlFor="dispute-reason" className="font-body text-small font-medium text-text-primary">
            What's wrong?
          </label>
          <textarea
            id="dispute-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. quantity is 54, not 45"
            className="rounded-control border border-edge bg-surface-card px-3 py-2 font-body text-body text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <p className="font-body text-micro text-text-muted">
            This flags the card as contested — an owner/PM decides. No silent overwrites.
          </p>
        </div>
      </Modal>
    )
  }

  // ---- resolve / withdraw mode (contested) ----
  const footer = (
    <div className="flex justify-end gap-3">
      <Button variant="ghost" type="button" onClick={onClose}>Close</Button>
      {isRaiser && openDispute ? (
        <Button variant="danger" type="button" disabled={busy} onClick={() => run(() => disputesApi.withdraw(openDispute.id), 'Dispute withdrawn')}>
          Withdraw
        </Button>
      ) : null}
      {isAuthority && openDispute ? (
        <>
          <Button variant="ghost" type="button" disabled={busy} onClick={() => run(() => disputesApi.resolve(openDispute.id, { resolution_note: 'Kept as recorded' }), 'Kept as recorded')}>
            Keep as recorded
          </Button>
          <Button variant="primary" type="button" disabled={busy || !openDispute.proposed_fields} onClick={() => run(() => disputesApi.resolve(openDispute.id, { resolved_fields: openDispute.proposed_fields ?? undefined, resolution_note: 'Accepted correction' }), 'Correction accepted')}>
            Accept correction
          </Button>
        </>
      ) : null}
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title="Contested card" footer={footer}>
      {q.isPending ? (
        <p className="font-body text-small text-text-muted">Loading…</p>
      ) : !openDispute ? (
        <p className="font-body text-small text-text-muted">No open dispute on this card.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="font-body text-small text-text-muted">Raised by {openDispute.raised_by_role ?? 'someone'}:</p>
          <p className="font-body text-body text-text-primary">{openDispute.reason}</p>
          {!isAuthority && !isRaiser ? (
            <p className="font-body text-micro text-text-muted">An owner/PM will resolve this.</p>
          ) : null}
        </div>
      )}
    </Modal>
  )
}
