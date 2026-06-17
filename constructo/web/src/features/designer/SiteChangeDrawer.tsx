/**
 * SiteChangeDrawer — detail panel for a single site change.
 *
 * Shows: full note, site photo (larger; click → new tab for URLs), reported_by,
 * created_at, and designer actions (gated to architect/owner/pm via useMeRole).
 *
 * Designer actions:
 *   1. Impact note — textarea → update(id, {impact}) → toast
 *   2. Link to drawing — DrawingLinkPicker → update(id, {linked_drawing_id}) → toast
 *   3. Resolve — ConfirmDialog → update(id, {status:'resolved'}) → toast
 *
 * Resolved state: shows resolved_at, no further actions.
 * Non-reviewer role: read-only notice, all actions hidden.
 */

import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Drawer } from '../../ui/Drawer'
import { ConfirmDialog } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import { StatusPill } from '../../ui/StatusPill'
import { useToast } from '../../ui/Toast'
import { Small, H2 } from '../../ui'
import { useT } from '../../i18n'
import { useMeRole } from '../../auth/useCan'
import { siteChangesApi } from '../../api/siteChanges'
import { drawingsApi } from '../../api/drawings'
import { qk } from '../../api/queryKeys'
import { DrawingLinkPicker } from './DrawingLinkPicker'
import { changeStatusToSpine } from './SiteChangeCard'
import type { SiteChange } from '../../api/siteChanges'

const REVIEWER_ROLES = new Set(['architect', 'owner', 'pm'])

interface SiteChangeDrawerProps {
  change: SiteChange | null
  open: boolean
  onClose: () => void
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SiteChangeDrawer({ change, open, onClose }: SiteChangeDrawerProps) {
  const t = useT()
  const role = useMeRole()
  const { show } = useToast()
  const qc = useQueryClient()

  const [impactDraft, setImpactDraft] = useState<string>('')
  const [savingImpact, setSavingImpact] = useState(false)
  const [linkingDrawing, setLinkingDrawing] = useState(false)
  const [resolveBusy, setResolveBusy] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)

  // Effect-less approach: sync draft when a new change is opened.
  // (avoid useEffect complexity in a tightly scoped component)
  const [lastChangeId, setLastChangeId] = useState<string | null>(null)
  if (open && change && change.id !== lastChangeId) {
    setLastChangeId(change.id)
    setImpactDraft(change.impact ?? '')
    setResolveOpen(false)
  }

  const isReviewer = Boolean(role && REVIEWER_ROLES.has(role))
  const isResolved = change?.status === 'resolved'

  // Load the drawings register so we can show the linked drawing title for resolved changes.
  // Only fetch when the drawer is open and the change has a linked drawing.
  const { data: drawings } = useQuery({
    queryKey: qk.drawings(change?.site_id),
    queryFn: () => drawingsApi.listRegister(change!.site_id),
    enabled: Boolean(open && change?.linked_drawing_id),
  })
  const linkedDrawing = change?.linked_drawing_id
    ? drawings?.find((d) => d.id === change.linked_drawing_id)
    : undefined

  const invalidate = useCallback(() => {
    if (!change) return
    qc.invalidateQueries({ queryKey: qk.siteChanges() })
    qc.invalidateQueries({ queryKey: qk.siteChange(change.id) })
  }, [qc, change])

  const handleSaveImpact = async () => {
    if (!change) return
    setSavingImpact(true)
    try {
      await siteChangesApi.update(change.id, { impact: impactDraft })
      invalidate()
      show({ status: 'ok', message: t('sitechanges.impact_saved') })
    } catch {
      show({ status: 'risk', message: t('sitechanges.error.impact') })
    } finally {
      setSavingImpact(false)
    }
  }

  const handleLinkDrawing = async (drawingId: string, drawingTitle?: string, drawingVersion?: string) => {
    if (!change) return
    setLinkingDrawing(true)
    try {
      await siteChangesApi.update(change.id, { linked_drawing_id: drawingId })
      invalidate()
      const toastMsg = drawingTitle
        ? t('sitechanges.linked', { title: drawingTitle, version: drawingVersion ?? '' })
        : t('sitechanges.impact_saved')
      show({ status: 'ok', message: toastMsg })
    } catch {
      show({ status: 'risk', message: t('sitechanges.error.link') })
    } finally {
      setLinkingDrawing(false)
    }
  }

  const handleResolve = async () => {
    if (!change) return
    setResolveBusy(true)
    try {
      await siteChangesApi.update(change.id, { status: 'resolved' })
      invalidate()
      setResolveOpen(false)
      show({ status: 'ok', message: t('sitechanges.resolved') })
    } catch {
      show({ status: 'risk', message: t('sitechanges.error.resolve') })
    } finally {
      setResolveBusy(false)
    }
  }

  if (!change) return null

  const isResolvedUrl =
    change.photo_url !== null &&
    (change.photo_url.startsWith('http://') || change.photo_url.startsWith('https://'))

  const pillLabel =
    change.status === 'new'
      ? t('sitechanges.badge.new')
      : change.status === 'linked'
        ? t('sitechanges.badge.linked')
        : t('sitechanges.badge.resolved')

  const impactChanged = impactDraft !== (change.impact ?? '')

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={change.title}
        widthClass="max-w-xl"
        footer={
          isReviewer && !isResolved ? (
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={handleSaveImpact}
                disabled={savingImpact || !impactChanged}
                type="button"
                data-testid="save-impact-btn"
              >
                {savingImpact
                  ? t('sitechanges.drawer.saving')
                  : t('sitechanges.drawer.save_impact')}
              </Button>
              <Button
                variant="danger"
                onClick={() => setResolveOpen(true)}
                disabled={resolveBusy}
                type="button"
                data-testid="resolve-btn"
              >
                {t('sitechanges.drawer.resolve_action')}
              </Button>
            </div>
          ) : null
        }
      >
        {/* ── Status pill + room ── */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <StatusPill
            status={changeStatusToSpine(change.status)}
            label={pillLabel}
          />
          {change.room && (
            <span className="font-body text-small text-text-mute font-semibold uppercase tracking-wide">
              {change.room}
            </span>
          )}
        </div>

        {/* ── Site photo ── */}
        {change.photo_url && (
          <div className="mb-5">
            <Small className="mb-2 uppercase tracking-wide font-semibold">
              {t('sitechanges.drawer.photo')}
            </Small>
            {isResolvedUrl ? (
              <a
                href={change.photo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                aria-label={t('sitechanges.drawer.photo_link')}
              >
                <img
                  src={change.photo_url}
                  alt={change.title}
                  className="w-full max-h-56 rounded-card object-cover border border-line hover:opacity-95 cstk-animate"
                />
              </a>
            ) : (
              <a
                href={change.photo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-body text-small text-primary underline underline-offset-2 hover:opacity-80"
              >
                {t('sitechanges.drawer.photo_link')}
              </a>
            )}
          </div>
        )}

        {/* ── Field note ── */}
        <div className="mb-5">
          <Small className="mb-1 uppercase tracking-wide font-semibold">
            {t('sitechanges.drawer.note')}
          </Small>
          <p className="font-body text-body text-text leading-relaxed whitespace-pre-wrap">
            {change.note}
          </p>
        </div>

        {/* ── Meta: reported by / created / resolved ── */}
        <div className="mb-5 space-y-1 border-t border-[var(--divider)] pt-4">
          <div className="flex gap-2">
            <Small className="w-28 shrink-0 font-semibold text-text-mute">
              {t('sitechanges.drawer.reported_by')}
            </Small>
            {/* Use resolved name; fall back to localized label — never render the raw UUID. */}
            <Small className="text-text">
              {change.reported_by_name ?? t('sitechanges.reported_by_unknown')}
            </Small>
          </div>
          <div className="flex gap-2">
            <Small className="w-28 shrink-0 font-semibold text-text-mute">
              {t('sitechanges.drawer.reported_at')}
            </Small>
            <Small className="text-text cstk-mono">
              {formatTimestamp(change.created_at)}
            </Small>
          </div>
          {change.resolved_at && (
            <div className="flex gap-2">
              <Small className="w-28 shrink-0 font-semibold text-text-mute">
                {t('sitechanges.drawer.resolved_at')}
              </Small>
              <Small className="text-ok cstk-mono">
                {formatTimestamp(change.resolved_at)}
              </Small>
            </div>
          )}
        </div>

        {/* ── Resolved done state ── */}
        {isResolved && (
          <div className="mb-5 rounded-card border border-ok/30 bg-ok/10 px-4 py-3">
            <p className="font-body text-small font-semibold text-ok">
              {t('sitechanges.drawer.resolved_state')}
            </p>
            <Small className="mt-0.5 text-ok/80">
              {t('sitechanges.drawer.resolved_hint')}
            </Small>
          </div>
        )}

        {/* ── Read-only notice for non-reviewers ── */}
        {!isReviewer && (
          <div className="mb-5 rounded-card border border-warn/30 bg-warn/10 px-4 py-3">
            <p className="font-body text-small text-warn-fg">
              {t('sitechanges.drawer.readonly_hint')}
            </p>
          </div>
        )}

        {/* ── Impact note (reviewers + not resolved) ── */}
        {isReviewer && !isResolved && (
          <div className="mb-5">
            <label
              htmlFor="sc-impact"
              className="block font-body text-small font-semibold text-text mb-1.5"
            >
              {t('sitechanges.drawer.impact_label')}
            </label>
            <textarea
              id="sc-impact"
              data-testid="impact-textarea"
              value={impactDraft}
              onChange={(e) => setImpactDraft(e.target.value)}
              placeholder={t('sitechanges.drawer.impact_placeholder')}
              rows={4}
              className={[
                'w-full rounded-control border border-line bg-card px-3 py-2',
                'font-body text-small text-text placeholder-text-mute',
                'resize-y min-h-[96px]',
                'focus:outline-none focus:ring-2 focus:ring-primary',
                'disabled:opacity-50 cstk-animate',
              ].join(' ')}
              disabled={savingImpact}
            />
          </div>
        )}

        {/* Impact note (read-only, if present, for non-reviewers or resolved) */}
        {(!isReviewer || isResolved) && change.impact && (
          <div className="mb-5">
            <Small className="mb-1 uppercase tracking-wide font-semibold">
              {t('sitechanges.drawer.impact_label')}
            </Small>
            <p className="font-body text-body text-text leading-relaxed whitespace-pre-wrap">
              {change.impact}
            </p>
          </div>
        )}

        {/* ── Drawing link (reviewers + not resolved) ── */}
        {isReviewer && !isResolved && (
          <div className="mb-2">
            <H2 as="h3" className="text-small font-semibold mb-3">
              {t('sitechanges.drawer.link_heading')}
            </H2>
            <DrawingLinkPicker
              siteId={change.site_id}
              linkedDrawingId={change.linked_drawing_id}
              onLink={handleLinkDrawing}
              busy={linkingDrawing}
            />
          </div>
        )}

        {/* Linked drawing (read-only, resolved state) — shows title+version as a link to the register */}
        {isResolved && change.linked_drawing_id && (
          <div className="mb-2" data-testid="resolved-linked-drawing">
            <Small className="mb-1 uppercase tracking-wide font-semibold">
              {t('sitechanges.drawer.linked_drawing')}
            </Small>
            {linkedDrawing ? (
              <Link
                to="/settings/documents"
                data-testid="linked-drawing-chip"
                className={[
                  'inline-flex items-center gap-1.5 rounded-card border border-info/30 bg-info/10 px-3 py-2',
                  'font-body text-small font-semibold text-info',
                  'hover:bg-info/15 hover:border-info/50 transition cstk-animate',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                ].join(' ')}
                aria-label={t('sitechanges.drawer.view_drawing_register')}
              >
                {linkedDrawing.title}
                <span className="ml-1 font-normal text-text-mute">{linkedDrawing.version}</span>
                <svg
                  viewBox="0 0 16 16"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="ml-1 shrink-0 opacity-60"
                >
                  <path d="M6 3H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3M10 2h4m0 0v4m0-4L7 9" />
                </svg>
              </Link>
            ) : (
              <p className="font-body text-small text-text-mute">
                {t('sitechanges.drawer.linked_drawing')}
              </p>
            )}
          </div>
        )}
      </Drawer>

      {/* Resolve confirm dialog */}
      <ConfirmDialog
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        onConfirm={handleResolve}
        title={t('sitechanges.drawer.resolve_confirm.title')}
        message={t('sitechanges.drawer.resolve_confirm.message')}
        confirmLabel={t('sitechanges.drawer.resolve_confirm.cta')}
        cancelLabel={t('action.cancel')}
        variant="danger"
        busy={resolveBusy}
      />
    </>
  )
}
