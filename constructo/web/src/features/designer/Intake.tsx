/**
 * Intake — D5: Labs-aware design brief surface.
 *
 * Four states:
 *   1. Loading: Spinner while querying the profile.
 *   2. Unavailable (null): honest EmptyState — Labs off or no profile.
 *   3. Available (profile) + no brief: honest EmptyState — profile exists but no brief yet.
 *   4. Available (profile) + brief: full brief surface (headline/summary/sections +
 *      per-area themes with decisions + materialize CTA).
 *
 * Architecture:
 *   - designApi.profileBySite() returns null on 404 (Labs off / no profile).
 *     The component treats null as "unavailable" — no dead controls.
 *   - designApi.brief() also returns null on 404 (no brief generated yet).
 *   - Themes are fetched per-area from the profile's areas list (not embedded
 *     in the brief rendering, since BriefRenderingOut.content_json has summary
 *     theme data only). Full ThemeOut rows come from GET /areas/{id}/themes.
 *   - theme decision: POST /themes/{id}/decision → invalidate themes cache → toast.
 *   - materialize: POST /briefs/{brief_id}/materialize → toast with spec count.
 *   - canDecide: architect / owner / pm may approve/adjust/reject themes and
 *     hit materialize. Supervisor, accountant, etc. see read-only.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useT, type TranslationKey } from '../../i18n'
import { useMeRole } from '../../auth/useCan'
import {
  designApi,
  type DesignTheme,
  type DesignArea,
  type DesignProfile,
  type DesignClarification,
  type DesignConflict,
  type DesignBriefApproval,
} from '../../api/design'
import { qk } from '../../api/queryKeys'
import { H1, H2, Body, Small, Micro, Button, StatusPill, ConfidenceMeter, TimelineItem } from '../../ui'
import { ConfirmDialog } from '../../ui/Modal'
import { useToast } from '../../ui/Toast'
import { Spinner, ErrorState, EmptyState } from '../../components/states'
import type { Status } from '../../ui'
import { designerActions, actionLabel, type DesignerActionType } from './briefActions'
import { formatDateTime } from '../../lib/format'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map theme status → StatusPill status spine. */
function themeStatusToSpine(status: string): Status {
  switch (status) {
    case 'approved':
      return 'ok'
    case 'adjusted':
      return 'warn'
    case 'rejected':
      return 'risk'
    default: // suggested
      return 'info'
  }
}

/** Role gate: who may decide themes and materialize. */
function canDecideRole(role: string | undefined): boolean {
  return role === 'architect' || role === 'owner' || role === 'pm'
}

/** Format the area_key as a human title (living-room → Living Room). */
function areaTitle(key: string): string {
  return key
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Title-case a snake_case string (e.g. 'palette' -> 'Palette'). */
function cap(s: string): string {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

/** i18n lookup for a designer action's label, falling back to the ported
 *  util's static EN label (never a KeyError-equivalent undefined render). */
const ACTION_I18N_KEY: Record<DesignerActionType, TranslationKey> = {
  architect_sign_off: 'intake.action.architect_sign_off',
  request_changes: 'intake.action.request_changes',
  regenerate: 'intake.action.regenerate',
  materialize: 'intake.action.materialize',
}

// ---------------------------------------------------------------------------
// ThemeCard — one area's theme row with decision controls
// ---------------------------------------------------------------------------

interface ThemeCardProps {
  theme: DesignTheme
  canDecide: boolean
  onDecide: (themeId: string, action: 'approve' | 'adjust' | 'reject') => void
  decidingId: string | null
}

function ThemeCard({ theme, canDecide, onDecide, decidingId }: ThemeCardProps) {
  const t = useT()
  const spine = themeStatusToSpine(theme.status)
  const STATUS_LABEL_MAP: Record<string, Parameters<typeof t>[0]> = {
    suggested: 'intake.status.suggested',
    approved: 'intake.status.approved',
    adjusted: 'intake.status.adjusted',
    rejected: 'intake.status.rejected',
  }
  const statusLabel = t(STATUS_LABEL_MAP[theme.status] ?? 'intake.status.suggested')
  const busy = decidingId === theme.id

  return (
    <div className="rounded-card border border-line bg-card p-4 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-body font-semibold text-text">{theme.name}</p>
          <Small className="text-text-mute">{t('intake.themes.ai_framing')}</Small>
        </div>
        <StatusPill status={spine} label={statusLabel} size="sm" />
      </div>

      {/* Confidence meter */}
      {theme.confidence > 0 && (
        <ConfidenceMeter
          confidence={theme.confidence * 100}
          labels={{
            high: t('intake.confidence.high'),
            review: t('intake.confidence.review'),
            confirm: t('intake.confidence.confirm'),
          }}
        />
      )}

      {/* Palette swatches */}
      {theme.palette.length > 0 && (
        <div>
          <Small className="font-semibold text-text-mute mb-1 block">
            {t('intake.themes.palette_label')}
          </Small>
          <div className="flex flex-wrap gap-1.5" aria-label={t('intake.themes.palette_label')}>
            {theme.palette.map((color, i) => (
              <span
                key={i}
                title={color}
                aria-label={color}
                className="inline-block h-5 w-5 rounded-full ring-1 ring-line"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Materials */}
      {theme.materials.length > 0 && (
        <div>
          <Small className="font-semibold text-text-mute mb-1 block">
            {t('intake.themes.materials_label')}
          </Small>
          <div className="flex flex-wrap gap-1.5">
            {theme.materials.map((mat, i) => (
              <span
                key={i}
                className="inline-flex rounded-pill bg-surface px-2 py-0.5 font-body text-micro text-text"
              >
                {mat}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rationale */}
      {theme.rationale && (
        <div>
          <Small className="font-semibold text-text-mute mb-1 block">
            {t('intake.themes.rationale_label')}
          </Small>
          <Small className="text-text">{theme.rationale}</Small>
        </div>
      )}

      {/* Decision controls — only shown to deciders */}
      {canDecide && theme.status === 'suggested' && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => onDecide(theme.id, 'approve')}
            aria-label={`${t('intake.decision.approve')} ${theme.name}`}
          >
            {t('intake.decision.approve')}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => onDecide(theme.id, 'adjust')}
            aria-label={`${t('intake.decision.adjust')} ${theme.name}`}
          >
            {t('intake.decision.adjust')}
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => onDecide(theme.id, 'reject')}
            aria-label={`${t('intake.decision.reject')} ${theme.name}`}
          >
            {t('intake.decision.reject')}
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AreaThemesSection — loads + renders themes for one area
// ---------------------------------------------------------------------------

interface AreaThemesSectionProps {
  profile: DesignProfile
  area: DesignArea
  canDecide: boolean
  onDecide: (themeId: string, action: 'approve' | 'adjust' | 'reject') => void
  decidingId: string | null
}

function AreaThemesSection({
  profile,
  area,
  canDecide,
  onDecide,
  decidingId,
}: AreaThemesSectionProps) {
  const t = useT()
  const { data: themes, isLoading } = useQuery<DesignTheme[]>({
    queryKey: qk.designThemes(profile.id, area.id),
    queryFn: () => designApi.themesForArea(profile.id, area.id),
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="py-4">
        <Small className="text-text-mute">{t('intake.themes.loading')}</Small>
      </div>
    )
  }

  if (!themes || themes.length === 0) {
    return (
      <div className="py-4">
        <Small className="text-text-mute">{t('intake.themes.empty')}</Small>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {themes.map((theme) => (
        <ThemeCard
          key={theme.id}
          theme={theme}
          canDecide={canDecide}
          onDecide={onDecide}
          decidingId={decidingId}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ActionsRow — brief-state-driven action buttons (sign off / request changes /
// regenerate) + the inline request-changes note panel. 'materialize' is
// deliberately excluded here — the brief already has a dedicated Materialize
// CTA + confirm dialog further down, so designerActions()'s materialize entry
// would otherwise render a duplicate button.
// ---------------------------------------------------------------------------

interface ActionsRowProps {
  state: string
  acting: DesignerActionType | null
  onRun: (action: DesignerActionType, note?: string) => void
}

function ActionsRow({ state, acting, onRun }: ActionsRowProps) {
  const t = useT()
  const [pendingNoteAction, setPendingNoteAction] = useState<DesignerActionType | null>(null)
  const [note, setNote] = useState('')
  const actions = designerActions(state).filter((a) => a.action !== 'materialize')

  if (actions.length === 0) return null

  const canConfirm = note.trim().length >= 3

  return (
    <div className="flex flex-col gap-3" data-testid="designer-actions-row">
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a.action}
            variant={a.variant === 'ghost' ? 'ghost' : a.variant === 'secondary' ? 'secondary' : 'primary'}
            disabled={acting !== null && acting !== a.action}
            onClick={() =>
              a.needsNote ? setPendingNoteAction(a.action) : onRun(a.action)
            }
          >
            {t(ACTION_I18N_KEY[a.action] ?? ('' as TranslationKey)) || a.label}
          </Button>
        ))}
      </div>

      {pendingNoteAction ? (
        <div className="rounded-card border border-line bg-card p-4 flex flex-col gap-2">
          <p className="font-body font-semibold text-text">{t('intake.request_changes.title')}</p>
          <Small className="text-text-mute">{t('intake.request_changes.hint')}</Small>
          <textarea
            data-testid="request-changes-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('intake.request_changes.placeholder')}
            rows={4}
            className={[
              'w-full rounded-control border border-line bg-card px-3 py-2',
              'font-body text-small text-text placeholder-text-mute',
              'resize-y min-h-[96px]',
              'focus:outline-none focus:ring-2 focus:ring-primary',
              'disabled:opacity-50 cstk-animate',
            ].join(' ')}
            disabled={acting !== null}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              onClick={() => {
                setPendingNoteAction(null)
                setNote('')
              }}
              disabled={acting !== null}
            >
              {t('intake.request_changes.cancel')}
            </Button>
            <Button
              variant="primary"
              data-testid="request-changes-confirm"
              disabled={!canConfirm || acting !== null}
              onClick={() => {
                onRun(pendingNoteAction, note.trim())
                setPendingNoteAction(null)
                setNote('')
              }}
            >
              {t('intake.request_changes.send')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// HomeownerQA — answered clarifications (prominent) + waiting ones (quiet)
// ---------------------------------------------------------------------------

function HomeownerQA({ rows }: { rows: DesignClarification[] }) {
  const t = useT()
  if (rows.length === 0) return null

  const byNewest = (a: DesignClarification, b: DesignClarification) =>
    new Date(b.asked_at).getTime() - new Date(a.asked_at).getTime()
  const answered = rows.filter((r) => r.answer != null).sort(byNewest)
  const waiting = rows.filter((r) => r.answer == null).sort(byNewest)

  return (
    <div className="space-y-3">
      <H2>{t('intake.qa.section_title')}</H2>
      <div className="rounded-card border border-line bg-card divide-y divide-line">
        {[...answered, ...waiting].map((row) => (
          <div key={row.id} className="p-4 flex flex-col gap-1">
            <Body className="text-text-mute">{row.question}</Body>
            {row.answer != null ? (
              <>
                <p className="font-body font-semibold text-text">{row.answer}</p>
                {row.answered_at ? (
                  <Micro>
                    {t('intake.qa.answered_prefix')} · {formatDateTime(row.answered_at)}
                  </Micro>
                ) : null}
              </>
            ) : (
              <Small className="text-text-mute italic">{t('intake.qa.waiting')}</Small>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ConflictsPanel — resolve open conflicts; already-deferred rows show a badge
// ---------------------------------------------------------------------------

interface ConflictsPanelProps {
  conflicts: DesignConflict[]
  pendingId: string | null
  onResolve: (conflictId: string, resolution: 'keep_a' | 'keep_b' | 'compromise', note?: string) => void
}

function ConflictsPanel({ conflicts, pendingId, onResolve }: ConflictsPanelProps) {
  const t = useT()
  if (conflicts.length === 0) return null

  return (
    <div className="space-y-3">
      <H2>{t('intake.conflicts.section_title')}</H2>
      <div className="flex flex-col gap-3">
        {conflicts.map((c) => (
          <ConflictCard
            key={c.id}
            conflict={c}
            pending={pendingId === c.id}
            onResolve={(resolution, note) => onResolve(c.id, resolution, note)}
          />
        ))}
      </div>
    </div>
  )
}

function ConflictCard({
  conflict,
  pending,
  onResolve,
}: {
  conflict: DesignConflict
  pending: boolean
  onResolve: (resolution: 'keep_a' | 'keep_b' | 'compromise', note?: string) => void
}) {
  const t = useT()
  const [compromiseNote, setCompromiseNote] = useState('')
  const isDeferred = conflict.resolution_status === 'deferred_to_architect'
  const isResolved = conflict.resolution_status === 'resolved'

  return (
    <div className="rounded-card border border-warn/30 bg-warn/5 p-4 flex flex-col gap-2" data-testid="conflict-card">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status="warn" label={cap(conflict.dimension)} size="sm" />
        {isDeferred ? (
          <StatusPill status="info" label={t('intake.conflicts.deferred_badge')} size="sm" />
        ) : null}
        {isResolved ? (
          <StatusPill status="ok" label={t('intake.conflicts.resolved')} size="sm" />
        ) : null}
      </div>
      <Body>{conflict.value}</Body>
      {!isResolved ? (
        <>
          <Small className="text-text-mute">{t('intake.conflicts.subtitle')}</Small>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => onResolve('keep_a')}
            >
              {t('intake.conflicts.keep_a')}
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => onResolve('keep_b')}
            >
              {t('intake.conflicts.keep_b')}
            </Button>
          </div>
          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
            <input
              type="text"
              value={compromiseNote}
              onChange={(e) => setCompromiseNote(e.target.value)}
              placeholder={t('intake.conflicts.compromise_placeholder')}
              disabled={pending}
              className={[
                'flex-1 rounded-control border border-line bg-card px-3 py-2',
                'font-body text-small text-text placeholder-text-mute',
                'focus:outline-none focus:ring-2 focus:ring-primary',
                'disabled:opacity-50 cstk-animate',
              ].join(' ')}
            />
            <Button
              variant="primary"
              disabled={pending || compromiseNote.trim().length === 0}
              onClick={() => onResolve('compromise', compromiseNote.trim())}
            >
              {t('intake.conflicts.compromise_cta')}
            </Button>
          </div>
        </>
      ) : conflict.decision_note ? (
        <Small className="text-text-mute">{conflict.decision_note}</Small>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ApprovalTimeline — the attributed approval history for the brief
// ---------------------------------------------------------------------------

function ApprovalTimeline({ rows }: { rows: DesignBriefApproval[] }) {
  const t = useT()
  if (rows.length === 0) return null

  return (
    <div className="space-y-3">
      <H2>{t('intake.approvals.section_title')}</H2>
      <ul className="flex flex-col">
        {rows.map((row, i) => (
          <TimelineItem
            key={row.id}
            typeLabel={cap(row.actor_role)}
            summary={actionLabel(row.action) || row.action}
            occurredOn={formatDateTime(row.created_at)}
            isLast={i === rows.length - 1}
          />
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BriefBody — renders the full brief once available
// ---------------------------------------------------------------------------

interface BriefBodyProps {
  profile: DesignProfile
  briefId: string
  briefState: string | null | undefined
  siteId: string
  narrative: {
    headline: string
    summary: string
    sections: Array<{ title: string; body: string }>
  }
  version?: number
  canDecide: boolean
  onViewSelections?: () => void
}

function BriefBody({
  profile,
  briefId,
  briefState,
  siteId,
  narrative,
  version,
  canDecide,
  onViewSelections,
}: BriefBodyProps) {
  const t = useT()
  const qc = useQueryClient()
  const { show } = useToast()

  // Materialize dialog
  const [showMaterialize, setShowMaterialize] = useState(false)
  const [materializedCount, setMaterializedCount] = useState<number | null>(null)

  // Theme decision mutation
  const [decidingId, setDecidingId] = useState<string | null>(null)

  // Brief-lifecycle action mutation (sign off / request changes / regenerate)
  const [acting, setActing] = useState<DesignerActionType | null>(null)

  const clarificationsQuery = useQuery<DesignClarification[]>({
    queryKey: qk.designClarifications(profile.id),
    queryFn: () => designApi.clarifications(profile.id),
    staleTime: 30_000,
  })

  const conflictsQuery = useQuery<DesignConflict[]>({
    queryKey: qk.designConflicts(profile.id),
    queryFn: () => designApi.conflicts(profile.id),
    staleTime: 30_000,
  })

  const approvalsQuery = useQuery<DesignBriefApproval[]>({
    queryKey: qk.designApprovals(briefId),
    queryFn: () => designApi.briefApprovals(briefId),
    staleTime: 30_000,
  })

  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null)

  const resolveConflictMutation = useMutation({
    mutationFn: ({
      conflictId,
      resolution,
      note,
    }: {
      conflictId: string
      resolution: 'keep_a' | 'keep_b' | 'compromise'
      note?: string
    }) => designApi.resolveConflict(conflictId, { resolution, note }),
    onMutate: ({ conflictId }) => setResolvingConflictId(conflictId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.designConflicts(profile.id) })
      show({ message: t('intake.conflicts.toast.success'), status: 'ok' })
      setResolvingConflictId(null)
    },
    onError: () => {
      show({ message: t('intake.conflicts.toast.error'), status: 'risk' })
      setResolvingConflictId(null)
    },
  })

  // Runs the non-materialize lifecycle actions (sign off / request changes /
  // regenerate). Materialize keeps its own dedicated CTA + confirm dialog below.
  async function runBriefAction(action: DesignerActionType, note?: string) {
    setActing(action)
    try {
      if (action === 'regenerate') {
        await designApi.generateBrief(profile.id)
      } else {
        await designApi.actOnBrief(briefId, { action, note })
      }
      qc.invalidateQueries({ queryKey: qk.designBrief(profile.id) })
      qc.invalidateQueries({ queryKey: qk.designApprovals(briefId) })
      // The inbox badge (DesignerWorkspace's unread-count pill) must refresh
      // immediately too, not just on the next poll.
      qc.invalidateQueries({ queryKey: ['design', 'inbox-summary'] })
      show({ message: t('intake.action.toast.success'), status: 'ok' })
    } catch {
      show({ message: t('intake.action.toast.error'), status: 'risk' })
    } finally {
      setActing(null)
    }
  }

  const decisionMutation = useMutation({
    mutationFn: ({ themeId, action }: { themeId: string; action: 'approve' | 'adjust' | 'reject' }) =>
      designApi.themeDecision(themeId, { action }),
    onMutate: ({ themeId }) => {
      setDecidingId(themeId)
    },
    onSuccess: (_, { action }) => {
      // Invalidate all area theme queries for this profile
      profile.areas.forEach((area) => {
        qc.invalidateQueries({ queryKey: qk.designThemes(profile.id, area.id) })
      })
      const toastKeys = {
        approve: 'intake.decision.toast.approved',
        adjust: 'intake.decision.toast.adjusted',
        reject: 'intake.decision.toast.rejected',
      } as const
      show({ message: t(toastKeys[action]), status: 'ok' })
      setDecidingId(null)
    },
    onError: () => {
      show({ message: t('intake.decision.toast.error'), status: 'risk' })
      setDecidingId(null)
    },
  })

  // Materialize mutation
  const materializeMutation = useMutation({
    mutationFn: () => designApi.materialize(briefId),
    onSuccess: (result) => {
      setShowMaterialize(false)
      setMaterializedCount(result.specs_created)
      show({
        message: t('intake.materialize.toast.success', { count: result.specs_created }),
        status: 'ok' as const,
      })
      // Invalidate specs so Selections reflects new lines
      qc.invalidateQueries({ queryKey: qk.specs(siteId) })
      qc.invalidateQueries({ queryKey: qk.specDesk(siteId) })
    },
    onError: () => {
      setShowMaterialize(false)
      show({ message: t('intake.materialize.toast.error'), status: 'risk' })
    },
  })

  function handleDecide(themeId: string, action: 'approve' | 'adjust' | 'reject') {
    decisionMutation.mutate({ themeId, action })
  }

  // Overall confidence: average of area confidences (0–1 scale from backend)
  const avgConfidence =
    profile.areas.length > 0
      ? (profile.areas.reduce((sum, a) => sum + a.confidence, 0) / profile.areas.length) * 100
      : 0

  return (
    <div className="space-y-6">
      {/* Brief header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {version !== undefined && (
            <span className="inline-flex rounded-pill border border-info/30 bg-info/10 px-2.5 py-0.5 font-body text-small font-semibold text-info">
              {t('intake.version_chip', { version })}
            </span>
          )}
          <span className="inline-flex rounded-pill border border-line bg-surface px-2.5 py-0.5 font-body text-small text-text-mute">
            {t('intake.scope_chip', { scope: profile.scope_type.replace(/_/g, ' ') })}
          </span>
        </div>
        <H1>{narrative.headline}</H1>
        <Body className="text-text-mute">{narrative.summary}</Body>

        {/* Overall confidence meter */}
        {avgConfidence > 0 && (
          <ConfidenceMeter
            confidence={avgConfidence}
            labels={{
              high: t('intake.confidence.high'),
              review: t('intake.confidence.review'),
              confirm: t('intake.confidence.confirm'),
            }}
            className="mt-3 max-w-sm"
          />
        )}
      </div>

      {/* Brief-lifecycle actions (sign off / request changes / regenerate) */}
      {canDecide && briefState && (
        <ActionsRow state={briefState} acting={acting} onRun={runBriefAction} />
      )}

      {/* Narrative sections */}
      {narrative.sections.length > 0 && (
        <div className="space-y-4">
          {narrative.sections.map((section, i) => (
            <div key={i} className="rounded-card border border-line bg-card p-5">
              <H2 className="mb-2">{section.title}</H2>
              {/* Preserve line breaks in body text */}
              {section.body.split('\n\n').map((para, j) => (
                <Body key={j} className="text-text-mute mb-2 last:mb-0">
                  {para}
                </Body>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Homeowner Q&A */}
      <HomeownerQA rows={clarificationsQuery.data ?? []} />

      {/* Conflicts */}
      {canDecide && (
        <ConflictsPanel
          conflicts={conflictsQuery.data ?? []}
          pendingId={resolvingConflictId}
          onResolve={(conflictId, resolution, note) =>
            resolveConflictMutation.mutate({ conflictId, resolution, note })
          }
        />
      )}

      {/* Design themes per area */}
      <div className="space-y-5">
        <H2>{t('intake.themes.section_title')}</H2>
        {profile.areas.map((area) => (
          <div key={area.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="font-body font-semibold text-text">{areaTitle(area.area_key)}</p>
              {area.has_conflict && (
                <StatusPill status="warn" label={t('intake.themes.conflict')} size="sm" />
              )}
            </div>
            <AreaThemesSection
              profile={profile}
              area={area}
              canDecide={canDecide}
              onDecide={handleDecide}
              decidingId={decidingId}
            />
          </div>
        ))}
      </div>

      {/* Materialize CTA — hidden while the brief is still in homeowner_review
          (or any state designerActions() doesn't offer materialize for), even
          for a decider role: there's nothing to materialize yet. */}
      {canDecide && designerActions(briefState ?? '').some((a) => a.action === 'materialize') && (
        <div className="pt-2">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              onClick={() => setShowMaterialize(true)}
              data-testid="materialize-btn"
            >
              {t('intake.materialize.button')}
            </Button>
            {materializedCount !== null && onViewSelections && (
              <Button
                variant="secondary"
                onClick={onViewSelections}
              >
                {t('intake.materialize.view_selections')}
              </Button>
            )}
          </div>
          <Small className="mt-2 block text-text-mute">
            {t('intake.materialize.confirm_message')}
          </Small>
        </div>
      )}

      {/* Materialize confirm dialog */}
      <ConfirmDialog
        open={showMaterialize}
        onClose={() => setShowMaterialize(false)}
        onConfirm={() => materializeMutation.mutate()}
        title={t('intake.materialize.confirm_title')}
        message={t('intake.materialize.confirm_message')}
        confirmLabel={t('intake.materialize.confirm_cta')}
        cancelLabel={t('action.cancel')}
        busy={materializeMutation.isPending}
      />

      {/* Approval timeline */}
      <ApprovalTimeline rows={approvalsQuery.data ?? []} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Intake — main export
// ---------------------------------------------------------------------------

export interface IntakeProps {
  siteId?: string
  onViewSelections?: () => void
}

export function Intake({ siteId, onViewSelections }: IntakeProps) {
  const t = useT()
  const role = useMeRole()
  const canDecide = canDecideRole(role)

  // Step 1: resolve the profile for this site
  const profileQuery = useQuery<DesignProfile | null>({
    queryKey: qk.designProfile(siteId ?? '__none__'),
    queryFn: () => (siteId ? designApi.profileBySite(siteId) : Promise.resolve(null)),
    staleTime: 60_000,
    enabled: !!siteId,
  })

  // Step 2: once profile is loaded, fetch the architect brief rendering
  const profileId = profileQuery.data?.id
  const briefQuery = useQuery({
    queryKey: qk.designBrief(profileId ?? '__none__'),
    queryFn: () => (profileId ? designApi.brief(profileId, 'architect') : Promise.resolve(null)),
    staleTime: 60_000,
    enabled: !!profileId,
  })

  // --- State 1: no siteId yet ---
  if (!siteId) {
    return (
      <div className="py-6">
        <EmptyState
          title={t('intake.unavailable_title')}
          hint={t('intake.unavailable_hint')}
        />
      </div>
    )
  }

  // --- State 2: Loading profile ---
  if (profileQuery.isLoading) {
    return <Spinner label={t('intake.loading')} />
  }

  // --- State 3: Error (non-404) ---
  if (profileQuery.isError) {
    return (
      <ErrorState
        message={t('intake.error')}
        onRetry={() => profileQuery.refetch()}
        retryLabel={t('action.retry')}
      />
    )
  }

  // --- State 4: null → Labs off / no profile ---
  if (profileQuery.data === null || profileQuery.data === undefined) {
    return (
      <div className="py-6">
        <EmptyState
          title={t('intake.unavailable_title')}
          hint={t('intake.unavailable_hint')}
        />
      </div>
    )
  }

  const profile = profileQuery.data

  // --- State 5: Loading brief ---
  if (briefQuery.isLoading) {
    return <Spinner label={t('intake.loading')} />
  }

  // --- State 6: brief error ---
  if (briefQuery.isError) {
    return (
      <ErrorState
        message={t('intake.error')}
        onRetry={() => briefQuery.refetch()}
        retryLabel={t('action.retry')}
      />
    )
  }

  // --- State 7: profile exists but no brief generated yet ---
  if (briefQuery.data === null || briefQuery.data === undefined) {
    return (
      <div className="py-6">
        <EmptyState
          title={t('intake.no_brief_title')}
          hint={t('intake.no_brief_hint')}
        />
      </div>
    )
  }

  const brief = briefQuery.data

  // --- State 8: full brief surface ---
  return (
    <div className="py-2">
      <BriefBody
        profile={profile}
        briefId={brief.brief_id}
        briefState={brief.state}
        siteId={siteId}
        narrative={brief.narrative}
        version={brief.version}
        canDecide={canDecide}
        onViewSelections={onViewSelections}
      />
    </div>
  )
}
