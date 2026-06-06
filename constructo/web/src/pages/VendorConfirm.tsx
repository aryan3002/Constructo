import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { vendorConfirmApi, type VendorPublicView } from '../api/vendorConfirm'
import { Body, Button, Display, Micro, Small, ThemeProvider } from '../ui'
import { CheckCircleIcon } from '../ui/icons'
import { AuthCard } from './auth/fields'

/**
 * Public vendor confirm page (Phase 3.8) — NO login. The token in the URL is the
 * capability. The vendor sees only the quantity claim (no prices) and confirms
 * or disputes it; a confirmation the vendor agrees to is a two-party-verified
 * GRN. Bilingual-lite inline copy (vendor language unknown).
 */
export function VendorConfirm() {
  const { token = '' } = useParams()
  const [view, setView] = useState<VendorPublicView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [disputing, setDisputing] = useState(false)
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    let alive = true
    vendorConfirmApi
      .view(token)
      .then((v) => alive && setView(v))
      .catch(() => alive && setLoadError('This link is invalid or has expired.'))
    return () => {
      alive = false
    }
  }, [token])

  async function send(confirmed: boolean) {
    setError(null)
    setBusy(true)
    try {
      const updated = await vendorConfirmApi.respond(token, {
        confirmed,
        qty: qty.trim() ? Number(qty) : undefined,
        note: note.trim() || undefined,
      })
      setView(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save — please try again.')
    } finally {
      setBusy(false)
    }
  }

  const claim = view
    ? [view.claimed_qty != null ? String(view.claimed_qty) : '', view.claimed_unit ?? '', view.material ?? '']
        .filter(Boolean)
        .join(' ')
    : ''

  return (
    <ThemeProvider defaultTheme="site">
      <AuthCard>
        {loadError ? (
          <p role="alert" className="font-body text-body font-medium text-risk">
            {loadError}
          </p>
        ) : !view ? (
          <Body className="text-text-mute">Loading…</Body>
        ) : view.already_responded ? (
          <div className="space-y-4 text-center">
            <span className="mx-auto block text-4xl text-ok" aria-hidden>
              <CheckCircleIcon />
            </span>
            <Display as="h1" className="!text-h1">
              {view.status === 'confirmed' ? 'Thank you — confirmed' : 'Thank you — noted'}
            </Display>
            <Body className="text-text-mute">
              {view.status === 'confirmed'
                ? `You confirmed ${claim || 'this delivery'} for ${view.site_name}.`
                : `You flagged a difference on ${claim || 'this delivery'}. The site team will follow up.`}
            </Body>
          </div>
        ) : (
          <div className="space-y-4">
            <Micro className="font-semibold uppercase tracking-widest text-primary-deep">
              Delivery confirmation
            </Micro>
            <div>
              <Display as="h1" className="!text-h1">
                {claim || 'Confirm this delivery'}
              </Display>
              <Body className="mt-1 text-text-mute">
                {view.vendor_name} → {view.site_name}
                {view.delivered_on ? ` · ${view.delivered_on}` : ''}
              </Body>
              <Small className="mt-1 block text-text-mute">
                Did you deliver this? आपने यह डिलीवर किया?
              </Small>
            </div>

            {error && (
              <p role="alert" className="font-body text-small font-medium text-risk">
                {error}
              </p>
            )}

            {disputing ? (
              <div className="space-y-3">
                <input
                  type="number"
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder={`Actual qty${view.claimed_unit ? ` (${view.claimed_unit})` : ''}`}
                  className="w-full rounded-control border border-line bg-paper-2 px-3 py-2 font-body text-body"
                />
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="w-full rounded-control border border-line bg-paper-2 px-3 py-2 font-body text-body"
                />
                <Button variant="primary" size="lg" block disabled={busy} onClick={() => send(false)}>
                  {busy ? 'Sending…' : 'Submit difference'}
                </Button>
                <Button variant="ghost" size="md" block onClick={() => setDisputing(false)}>
                  Back
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Button variant="primary" size="lg" block disabled={busy} onClick={() => send(true)}>
                  {busy ? 'Sending…' : 'Yes, this is correct'}
                </Button>
                <Button variant="secondary" size="lg" block disabled={busy} onClick={() => setDisputing(true)}>
                  No — the amount is different
                </Button>
              </div>
            )}
          </div>
        )}
      </AuthCard>
    </ThemeProvider>
  )
}
