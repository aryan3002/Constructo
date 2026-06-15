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
import { useT } from '../../i18n'
import { useMeRole } from '../../auth/useCan'
import { designApi, type DesignTheme, type DesignArea, type DesignProfile } from '../../api/design'
import { qk } from '../../api/queryKeys'
import { H1, H2, Body, Small, Button, StatusPill, ConfidenceMeter } from '../../ui'
import { ConfirmDialog } from '../../ui/Modal'
import { useToast } from '../../ui/Toast'
import { Spinner, ErrorState, EmptyState } from '../../components/states'
import type { Status } from '../../ui'

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
// BriefBody — renders the full brief once available
// ---------------------------------------------------------------------------

interface BriefBodyProps {
  profile: DesignProfile
  briefId: string
  siteId: string
  narrative: {
    headline: string
    summary: string
    sections: Array<{ title: string; body: string }>
  }
  version?: number
  canDecide: boolean
}

function BriefBody({ profile, briefId, siteId, narrative, version, canDecide }: BriefBodyProps) {
  const t = useT()
  const qc = useQueryClient()
  const { show } = useToast()

  // Materialize dialog
  const [showMaterialize, setShowMaterialize] = useState(false)

  // Theme decision mutation
  const [decidingId, setDecidingId] = useState<string | null>(null)

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

      {/* Design themes per area */}
      <div className="space-y-5">
        <H2>{t('intake.themes.section_title')}</H2>
        {profile.areas.map((area) => (
          <div key={area.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="font-body font-semibold text-text">{areaTitle(area.area_key)}</p>
              {area.has_conflict && (
                <StatusPill status="warn" label="Conflict" size="sm" />
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

      {/* Materialize CTA */}
      {canDecide && (
        <div className="pt-2">
          <Button
            variant="primary"
            onClick={() => setShowMaterialize(true)}
            data-testid="materialize-btn"
          >
            {t('intake.materialize.button')}
          </Button>
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Intake — main export
// ---------------------------------------------------------------------------

export interface IntakeProps {
  siteId?: string
}

export function Intake({ siteId }: IntakeProps) {
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
        siteId={siteId}
        narrative={brief.narrative}
        version={brief.version}
        canDecide={canDecide}
      />
    </div>
  )
}
