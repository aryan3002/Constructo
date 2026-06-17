/**
 * SelectionDrawer — the D0 Drawer panel for a single DeskLine.
 *
 * Shows:
 *   1. Material card (element, room, brand/sku/colour/finish)
 *   2. Qty · unit / rate / wastage → line total (Mono)
 *   3. Notes
 *   4. Lifecycle timeline: Drafted → Routed → Approved/Returned → Released
 *   5. Role-shaped actions (the propose→commit spine)
 *
 * Role shaping — identity over show-and-disable:
 *   canPropose: owner | pm | architect  — can route + edit + release
 *   canCommit:  owner only              — can approve + return
 *   The designer (architect) who proposed CANNOT approve their own proposal
 *   in the UX (even though the backend permits it). This is intentional UX
 *   honesty. The backend is the real authority; we just shape the form.
 *
 * Actions by routing_status × role:
 *   draft | returned + canPropose  → "Route to owner →" (ConfirmDialog) + Edit
 *   out_for_approval + canCommit   → Approve (inline form with code) + Return (ConfirmDialog)
 *   out_for_approval + !canCommit  → "Awaiting owner sign-off" (calm status line)
 *   approved + canPropose          → "Release to site" (ConfirmDialog)
 *   released                       → Done state ("Released to site on {date}")
 */
import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Drawer, ConfirmDialog, Button, Mono, Small, Body } from '../../ui'
import type { DeskLine, DeskOut, RoutingStatus } from '../../api/specs'
import { specsApi } from '../../api/specs'
import { useToast } from '../../ui'
import { qk } from '../../api/queryKeys'
import { useT } from '../../i18n'
import type { TFunction } from '../../i18n'
import type { Role } from '../../api/auth'
import { formatRupees } from '../../lib/money'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Null-safe ₹ formatter: em-dash for missing/non-finite values. */
function inr(value: string | null | undefined): string {
  if (value == null) return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return formatRupees(n)
}

/** Human-readable short date from ISO string. */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Lifecycle timeline
// ---------------------------------------------------------------------------

interface TimelineStep {
  labelKey: string
  date: string | null
  done: boolean
  active?: boolean
  code?: string | null
}

function buildTimeline(line: DeskLine): TimelineStep[] {
  const status = line.routing_status
  return [
    {
      labelKey: 'selections.drawer.timeline.drafted',
      date: null,
      done: true,
    },
    {
      labelKey: 'selections.drawer.timeline.routed',
      date: fmtDate(line.sent_at) || null,
      done: ['out_for_approval', 'approved', 'returned', 'released'].includes(status),
      active: status === 'out_for_approval',
    },
    {
      labelKey: line.approval_status === 'rejected' ? 'selections.drawer.timeline.returned' : 'selections.drawer.timeline.approved',
      date: line.approval_status === 'approved' || line.approval_status === 'rejected'
        ? fmtDate(line.sent_at) || null  // sent_at is the closest proxy
        : null,
      done: ['approved', 'returned', 'released'].includes(status),
      active: status === 'approved' || status === 'returned',
      code: line.client_final_code,
    },
    {
      labelKey: 'selections.drawer.timeline.released',
      date: fmtDate(line.released_at) || null,
      done: status === 'released',
      active: status === 'released',
    },
  ]
}

function LifecycleTimeline({ line }: { line: DeskLine }) {
  const t = useT()
  const steps = buildTimeline(line)

  return (
    <div aria-label={t('selections.drawer.timeline')}>
      <Small className="mb-3 block font-semibold !text-text">{t('selections.drawer.timeline')}</Small>
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            {/* Dot + rail */}
            <div className="flex flex-col items-center pt-0.5">
              <span
                className={[
                  'h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-card',
                  step.done || step.active ? 'bg-primary' : 'bg-line',
                ].join(' ')}
              />
              {i < steps.length - 1 && (
                <span className="mt-1 w-px flex-1 bg-line" style={{ minHeight: 16 }} />
              )}
            </div>

            {/* Label + date + committed code */}
            <div className="pb-2">
              <Small
                className={[
                  'block font-semibold',
                  step.done || step.active ? '!text-text' : '!text-text-mute',
                ].join(' ')}
              >
                {t(step.labelKey as Parameters<TFunction>[0])}
              </Small>
              {step.date && (
                <Mono className="text-micro text-text-mute">{step.date}</Mono>
              )}
              {step.code && (
                <span className="mt-0.5 inline-flex items-center gap-1">
                  <Small className="!text-text-mute">{t('selections.drawer.committed_code')}:</Small>
                  <Mono className="text-small font-semibold text-ok">{step.code}</Mono>
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline edit form
// ---------------------------------------------------------------------------

interface EditValues {
  qty: string
  unit: string
  unit_rate: string
  wastage_pct: string
  notes: string
}

function EditForm({
  line,
  onSave,
  onCancel,
}: {
  line: DeskLine
  onSave: (patch: Partial<EditValues>) => Promise<void>
  onCancel: () => void
}) {
  const t = useT()
  const [values, setValues] = useState<EditValues>({
    qty: line.qty ?? '',
    unit: line.unit ?? '',
    unit_rate: line.unit_rate ?? '',
    wastage_pct: line.wastage_pct ?? '',
    notes: line.notes ?? '',
  })
  const [saving, setSaving] = useState(false)

  function field(
    key: keyof EditValues,
    labelKey: Parameters<TFunction>[0],
    placeholder?: string,
  ) {
    return (
      <label className="flex flex-col gap-1">
        <Small className="font-semibold !text-text">{t(labelKey)}</Small>
        <input
          type="text"
          value={values[key]}
          onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          placeholder={placeholder}
          className={[
            'min-h-tap rounded-control border border-line bg-card px-3',
            'font-body text-body text-text',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          ].join(' ')}
          aria-label={t(labelKey)}
        />
      </label>
    )
  }

  async function handleSave() {
    setSaving(true)
    try {
      const patch: Partial<EditValues> = {}
      if (values.qty !== (line.qty ?? '')) patch.qty = values.qty || undefined as unknown as string
      if (values.unit !== (line.unit ?? '')) patch.unit = values.unit || undefined as unknown as string
      if (values.unit_rate !== (line.unit_rate ?? '')) patch.unit_rate = values.unit_rate || undefined as unknown as string
      if (values.wastage_pct !== (line.wastage_pct ?? '')) patch.wastage_pct = values.wastage_pct || undefined as unknown as string
      if (values.notes !== (line.notes ?? '')) patch.notes = values.notes || undefined as unknown as string
      await onSave(patch)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 rounded-card border border-primary/30 bg-primary/5 p-4">
      <div className="grid grid-cols-2 gap-3">
        {field('qty', 'selections.edit.qty')}
        {field('unit', 'selections.edit.unit')}
        {field('unit_rate', 'selections.edit.rate')}
        {field('wastage_pct', 'selections.edit.wastage')}
      </div>
      {field('notes', 'selections.edit.notes', 'Optional notes…')}
      <div className="flex gap-2 pt-1">
        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          disabled={saving}
          className="flex-1"
        >
          {saving ? t('selections.action.saving') : t('selections.action.save_edit')}
        </Button>
        <Button variant="ghost" size="md" onClick={onCancel}>
          {t('selections.action.cancel_edit')}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Approve inline form (owner commits with client_final_code)
// ---------------------------------------------------------------------------

function ApproveForm({
  onApprove,
  busy,
}: {
  onApprove: (code: string) => void
  busy: boolean
}) {
  const t = useT()
  const [code, setCode] = useState('')

  return (
    <div className="space-y-3">
      <label className="flex flex-col gap-1">
        <Small className="font-semibold !text-text">{t('selections.action.approve_code_label')}</Small>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('selections.action.approve_code_placeholder')}
          data-testid="approve-code-input"
          className={[
            'min-h-tap rounded-control border border-line bg-card px-3',
            'font-body text-body text-text',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          ].join(' ')}
        />
      </label>
      <Button
        variant="primary"
        block
        onClick={() => onApprove(code)}
        disabled={busy}
      >
        {busy ? t('selections.action.approving') : t('selections.action.approve')}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SelectionDrawer
// ---------------------------------------------------------------------------

export interface SelectionDrawerProps {
  open: boolean
  onClose: () => void
  /** The id of the line to display — used to look up the live line in query cache. */
  lineId: string
  room: string
  siteId: string
  /** The current user's role — drives role-shaped actions. */
  role: Role | undefined
}

type DialogKind = 'route' | 'return' | 'release' | null

/** Look up the live DeskLine by id from the desk query cache. */
function useLiveLine(siteId: string, lineId: string): DeskLine | null {
  const qc = useQueryClient()
  const deskData = qc.getQueryData<DeskOut>(qk.specDesk(siteId))
  if (!deskData) return null
  for (const r of deskData.rooms) {
    const found = r.lines.find((l) => l.id === lineId)
    if (found) return found
  }
  return null
}

export function SelectionDrawer({
  open,
  onClose,
  lineId,
  room,
  siteId,
  role,
}: SelectionDrawerProps) {
  const t = useT()
  const { show } = useToast()
  const qc = useQueryClient()

  const [busy, setBusy] = useState(false)
  const [dialogKind, setDialogKind] = useState<DialogKind>(null)
  const [editing, setEditing] = useState(false)

  // Live line — reads from the query cache so a refetch advances the open drawer
  const line = useLiveLine(siteId, lineId)

  // Role flags
  const canPropose = role === 'owner' || role === 'pm' || role === 'architect'
  const canCommit = role === 'owner'

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: qk.specDesk(siteId) })
  }, [qc, siteId])

  // ── Route action ──
  async function handleRoute() {
    if (!line) return
    setBusy(true)
    try {
      await specsApi.route(line.id)
      invalidate()
      show({ status: 'ok', message: t('selections.routed') })
      setDialogKind(null)
      // Drawer stays open — user closes it themselves
    } catch {
      show({ status: 'risk', message: t('common.error') })
    } finally {
      setBusy(false)
    }
  }

  // ── Approve action ──
  async function handleApprove(code: string) {
    if (!line) return
    setBusy(true)
    try {
      await specsApi.approve(line.id, { status: 'approved', client_final_code: code || undefined })
      invalidate()
      show({ status: 'ok', message: t('selections.approved') })
      // Drawer stays open — lifecycle pill + timeline tick forward on refetch
    } catch {
      show({ status: 'risk', message: t('common.error') })
    } finally {
      setBusy(false)
    }
  }

  // ── Return action ──
  async function handleReturn() {
    if (!line) return
    setBusy(true)
    try {
      await specsApi.approve(line.id, { status: 'rejected' })
      invalidate()
      show({ status: 'warn', message: t('selections.returned') })
      setDialogKind(null)
      // Drawer stays open
    } catch {
      show({ status: 'risk', message: t('common.error') })
    } finally {
      setBusy(false)
    }
  }

  // ── Release action ──
  async function handleRelease() {
    if (!line) return
    setBusy(true)
    try {
      await specsApi.release(line.id)
      invalidate()
      show({ status: 'ok', message: t('selections.released') })
      setDialogKind(null)
      // Drawer stays open
    } catch {
      show({ status: 'risk', message: t('common.error') })
    } finally {
      setBusy(false)
    }
  }

  // ── Edit save ──
  async function handleEditSave(patch: Record<string, string | undefined>) {
    if (!line) return
    await specsApi.update(line.id, patch)
    invalidate()
    show({ status: 'ok', message: t('selections.saved') })
    setEditing(false)
  }

  // If line not yet in cache (shouldn't happen in practice), show nothing
  if (!line) return null

  const status: RoutingStatus = line.routing_status
  const isReleased = status === 'released'
  const canEdit = canPropose && !isReleased

  // Drawer title = element + room
  const drawerTitle = `${line.element} — ${room}`

  // Determine the material descriptor
  const matPrimary = [line.brand, line.colour].filter(Boolean).join(' · ') || line.category || null
  const matSecondary = [line.sku, line.finish].filter(Boolean).join(' · ') || null

  // Compute line total inline if available
  const lineTotal = line.line_total
    ? inr(line.line_total)
    : line.qty && line.unit_rate
    ? inr(
        String(
          Number(line.qty) *
            Number(line.unit_rate) *
            (1 + Number(line.wastage_pct ?? '0') / 100),
        ),
      )
    : '—'

  // ── Footer ── role-shaped, single clear action per role×status
  function renderActions() {
    // Released: done state, no actions
    if (isReleased) {
      return (
        <div className="rounded-card border border-ok/30 bg-ok/10 px-4 py-3">
          <Small className="font-semibold !text-ok">
            {t('selections.released_on')}
            {line.released_at ? ` · ${fmtDate(line.released_at)}` : ''}
          </Small>
        </div>
      )
    }

    // out_for_approval: owner commits OR designer waits
    if (status === 'out_for_approval') {
      if (canCommit) {
        // Owner: inline approve form + return button
        return (
          <div className="space-y-3">
            <ApproveForm onApprove={handleApprove} busy={busy} />
            <Button
              variant="ghost"
              block
              onClick={() => setDialogKind('return')}
              disabled={busy}
            >
              {t('selections.action.return')}
            </Button>
          </div>
        )
      }
      // Designer/others: calm awaiting state
      return (
        <div className="rounded-card border border-warn/30 bg-warn/10 px-4 py-3">
          <Small className="font-semibold !text-warn">
            {t('selections.awaiting_signoff')}
          </Small>
        </div>
      )
    }

    // approved + canPropose: release to site
    if (status === 'approved' && canPropose) {
      return (
        <div className="space-y-3">
          <Button
            variant="primary"
            block
            onClick={() => setDialogKind('release')}
            disabled={busy}
          >
            {t('selections.action.release')}
          </Button>
          {canEdit && !editing && (
            <Button variant="ghost" block onClick={() => setEditing(true)}>
              {t('selections.action.edit')}
            </Button>
          )}
        </div>
      )
    }

    // draft | returned + canPropose: route to owner (+ edit)
    if ((status === 'draft' || status === 'returned') && canPropose) {
      if (editing) {
        // Edit form is rendered in the body; no additional footer buttons needed
        return null
      }
      return (
        <div className="space-y-3">
          <Button
            variant="primary"
            block
            onClick={() => setDialogKind('route')}
            disabled={busy}
          >
            {t('selections.action.route')}
          </Button>
          {canEdit && (
            <Button variant="ghost" block onClick={() => setEditing(true)}>
              {t('selections.action.edit')}
            </Button>
          )}
        </div>
      )
    }

    return null
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={() => {
          setEditing(false)
          setDialogKind(null)
          onClose()
        }}
        title={drawerTitle}
        footer={renderActions() ?? undefined}
        widthClass="max-w-xl"
      >
        <div className="space-y-6">
          {/* Material card */}
          {(matPrimary || matSecondary) && (
            <section aria-label={t('selections.drawer.material')}>
              <Small className="mb-2 block font-semibold !text-text">{t('selections.drawer.material')}</Small>
              <div className="rounded-card border border-line bg-paper px-4 py-3 space-y-1">
                {matPrimary && (
                  <Body className="font-semibold">{matPrimary}</Body>
                )}
                {matSecondary && (
                  <Small className="!text-text-mute">{matSecondary}</Small>
                )}
              </div>
            </section>
          )}

          {/* Quantities and cost */}
          <section aria-label={t('selections.drawer.qty')}>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <div>
                <dt><Small className="font-semibold !text-text-mute">{t('selections.drawer.qty')}</Small></dt>
                <dd>
                  <Mono className="text-body font-semibold text-text">
                    {line.qty
                      ? `${line.qty}${line.unit ? ' ' + line.unit : ''}`
                      : '—'}
                  </Mono>
                </dd>
              </div>
              <div>
                <dt><Small className="font-semibold !text-text-mute">{t('selections.drawer.rate')}</Small></dt>
                <dd><Mono className="text-body font-semibold text-text">{inr(line.unit_rate)}</Mono></dd>
              </div>
              <div>
                <dt><Small className="font-semibold !text-text-mute">{t('selections.drawer.wastage')}</Small></dt>
                <dd>
                  <Mono className="text-body font-semibold text-text">
                    {line.wastage_pct ? `${line.wastage_pct}%` : '—'}
                  </Mono>
                </dd>
              </div>
              <div>
                <dt><Small className="font-semibold !text-text-mute">{t('selections.drawer.line_total')}</Small></dt>
                <dd><Mono className="text-body font-bold text-text">{lineTotal}</Mono></dd>
              </div>
            </dl>
          </section>

          {/* Notes */}
          {line.notes && (
            <section aria-label={t('selections.drawer.notes')}>
              <Small className="mb-1 block font-semibold !text-text">{t('selections.drawer.notes')}</Small>
              <Body className="text-text-mute">{line.notes}</Body>
            </section>
          )}

          {/* Edit form — shown inline when editing */}
          {editing && (
            <EditForm
              line={line}
              onSave={handleEditSave}
              onCancel={() => setEditing(false)}
            />
          )}

          {/* Divider */}
          <div className="border-t border-line" />

          {/* Lifecycle timeline */}
          <LifecycleTimeline line={line} />
        </div>
      </Drawer>

      {/* Route confirm */}
      <ConfirmDialog
        open={dialogKind === 'route'}
        onClose={() => setDialogKind(null)}
        onConfirm={handleRoute}
        title={t('selections.action.route_confirm.title')}
        message={t('selections.action.route_confirm.message')}
        confirmLabel={t('selections.action.route_confirm.cta')}
        busy={busy}
      />

      {/* Return confirm */}
      <ConfirmDialog
        open={dialogKind === 'return'}
        onClose={() => setDialogKind(null)}
        onConfirm={handleReturn}
        title={t('selections.action.return_confirm.title')}
        message={t('selections.action.return_confirm.message')}
        confirmLabel={t('selections.action.return_confirm.cta')}
        busy={busy}
      />

      {/* Release confirm */}
      <ConfirmDialog
        open={dialogKind === 'release'}
        onClose={() => setDialogKind(null)}
        onConfirm={handleRelease}
        title={t('selections.action.release_confirm.title')}
        message={t('selections.action.release_confirm.message')}
        confirmLabel={t('selections.action.release_confirm.cta')}
        busy={busy}
      />
    </>
  )
}
