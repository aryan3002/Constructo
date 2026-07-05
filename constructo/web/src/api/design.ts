/**
 * Design-profiler API client — Labs-aware.
 *
 * The profiler routes live under /api/v1/design/* and are gated by
 * settings.enable_labs on the backend. When Labs is off the server returns 404
 * for all profile lookups. This client absorbs 404 as null on read-endpoints so
 * callers can treat null as "unavailable" rather than an error.
 *
 * Exact backend shapes confirmed from:
 *   backend/app/profiler/router.py + schemas.py
 */

import { ApiError } from './client'
import { getToken } from './auth'
import { API_BASE, USE_MOCKS } from './config'

// ---------------------------------------------------------------------------
// Types (mirror backend TS snake_case shapes)
// ---------------------------------------------------------------------------

/** ProfileDetailOut — the most recent design profile for a site. */
export interface DesignProfile {
  id: string
  company_id: string
  site_id: string
  scope_type: string
  status: string
  created_at: string
  areas: DesignArea[]
  contributors: DesignContributor[]
  my_contributor_id: string | null
}

export interface DesignArea {
  id: string
  area_kind: string
  area_key: string
  recommended_count: number
  status: string
  confidence: number
  has_conflict: boolean
}

export interface DesignContributor {
  id: string
  role: string
  is_decision_owner: boolean
}

/** BriefRenderingOut — the architect-audience rendering of the latest brief.
 *
 * Shape: { id, brief_id, audience, scope, content_json, created_at }
 * content_json: { areas, scope_type, narrative: { headline, summary, sections } }
 */
export interface NarrativeSection {
  title: string
  body: string
}

export interface BriefNarrative {
  headline: string
  summary: string
  sections: NarrativeSection[]
}

export interface DesignBrief {
  /** The rendering ID */
  id: string
  /** The parent brief ID (used for materialize / actOnBrief / approvals) */
  brief_id: string
  audience: string
  scope: string
  content_json: {
    areas: BriefAreaPayload[]
    scope_type: string
    narrative: BriefNarrative
  }
  created_at: string
  /** Extracted from content_json for convenience */
  narrative: BriefNarrative
  areas: BriefAreaPayload[]
  version?: number
  /** The owning brief's lifecycle state (drives designerActions()). Null/undefined
   *  on backends that predate this field — callers must treat that as no actions. */
  state?: string | null
}

export interface BriefAreaPayload {
  area_key: string
  /** The taste model dimensions */
  dimensions?: Record<string, unknown>
  confidence?: number
  themes?: BriefAreaTheme[]
}

export interface BriefAreaTheme {
  name: string
  palette: string[]
  materials: string[]
  status: string
}

/** ThemeOut — a design theme row (from GET /profiles/{id}/areas/{area_id}/themes). */
export interface DesignTheme {
  id: string
  area_id: string | null
  name: string
  confidence: number
  palette: string[]
  materials: string[]
  rationale: string | null
  evidence_reference_ids: string[]
  status: 'suggested' | 'approved' | 'adjusted' | 'rejected' | string
  created_at: string
}

/** MaterializeOut — result of POST /briefs/{id}/materialize */
export interface MaterializeOut {
  materials_created: number
  materials_reused: number
  specs_created: number
  specs_reused: number
  skipped_areas: string[]
}

/** Minimal brief-generation result — POST /profiles/{id}/brief returns the freshly (re)generated brief. */
export interface GenerateBriefOut {
  id: string
  version: number
  state: string
}

/** DesignInboxSummary — GET /inbox-summary: what waits on the designer right now. */
export interface DesignInboxSummary {
  briefs_awaiting_signoff: number
  answered_clarifications: number
  deferred_conflicts: number
}

/** ClarificationOut — one homeowner Q&A row (GET /profiles/{id}/clarifications). */
export interface DesignClarification {
  id: string
  area_id: string | null
  question: string
  answer: string | null
  asked_at: string
  answered_at: string | null
}

/** ConflictOut — a taste conflict between two contributors on one dimension
 *  (GET /profiles/{id}/conflicts). resolution_status includes
 *  'deferred_to_architect' rows the homeowner side punted to the designer. */
export interface DesignConflict {
  id: string
  area_id: string
  dimension: string
  value: string
  contributor_a_id: string | null
  contributor_b_id: string | null
  resolution_status: 'open' | 'resolved' | 'deferred_to_architect' | string
  decision_note: string | null
}

/** BriefApprovalOut — one row of the brief's attributed approval timeline. */
export interface DesignBriefApproval {
  id: string
  brief_id: string
  actor_role: string
  action: string
  note: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      // AppError's envelope nests the real message under body.error.message
      // (see app/common/errors.py) — check that first, same as every other
      // web api/*.ts file's `call`/`request` helper.
      detail = body?.error?.message ?? body?.detail ?? body?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// Mock data — provides a rich AVAILABLE path for offline/dev use.
// ---------------------------------------------------------------------------

const MOCK_PROFILE_ID = 'mock-profile-1'
const MOCK_BRIEF_ID = 'mock-brief-1'
const MOCK_RENDERING_ID = 'mock-rendering-1'

const MOCK_THEMES_BY_AREA: Record<string, DesignTheme[]> = {
  'living-room': [
    {
      id: 'theme-1',
      area_id: 'area-lr',
      name: 'Warm Contemporary',
      confidence: 91,
      palette: ['#F5ECD7', '#C8B8A2', '#7D6E5A', '#4A3728'],
      materials: ['Ivory vitrified tile', 'Teak veneer', 'Matte brass fixtures'],
      rationale:
        'Strong consensus (4/5 contributors) on warm neutrals with natural wood accents. Consistent with the reference images from contributors A and B.',
      evidence_reference_ids: ['ref-1', 'ref-2'],
      status: 'suggested',
      created_at: '2026-06-10T10:00:00Z',
    },
    {
      id: 'theme-2',
      area_id: 'area-lr',
      name: 'Cool Minimalist',
      confidence: 78,
      palette: ['#F0F2F5', '#D9DDE3', '#8C95A2', '#2E3A4A'],
      materials: ['White polished marble', 'Brushed steel', 'Grey concrete texture'],
      rationale:
        'Minority preference (2/5 contributors). Conflicts with the dominant warm palette from other contributors.',
      evidence_reference_ids: ['ref-3'],
      status: 'suggested',
      created_at: '2026-06-10T10:05:00Z',
    },
  ],
  'master-bedroom': [
    {
      id: 'theme-3',
      area_id: 'area-mb',
      name: 'Earthy Sanctuary',
      confidence: 94,
      palette: ['#EDE3D6', '#C4A882', '#8B6E4E', '#3D2B1F'],
      materials: ['Warm beige wall texture', 'Solid walnut headboard', 'Handwoven jute rug'],
      rationale:
        'High-confidence consensus. All contributors ranked earth-tone references 4–5 stars. No conflicts.',
      evidence_reference_ids: ['ref-4', 'ref-5'],
      status: 'approved',
      created_at: '2026-06-09T14:00:00Z',
    },
  ],
}

const MOCK_PROFILE: DesignProfile = {
  id: MOCK_PROFILE_ID,
  company_id: 'co-1',
  site_id: '__mock__',
  scope_type: 'whole_house',
  status: 'intake_started',
  created_at: '2026-06-08T12:00:00Z',
  areas: [
    {
      id: 'area-lr',
      area_kind: 'room',
      area_key: 'living-room',
      recommended_count: 6,
      status: 'active',
      confidence: 84,
      has_conflict: false,
    },
    {
      id: 'area-mb',
      area_kind: 'room',
      area_key: 'master-bedroom',
      recommended_count: 6,
      status: 'active',
      confidence: 94,
      has_conflict: false,
    },
  ],
  contributors: [],
  my_contributor_id: null,
}

const MOCK_BRIEF: DesignBrief = {
  id: MOCK_RENDERING_ID,
  brief_id: MOCK_BRIEF_ID,
  audience: 'architect',
  scope: 'whole_house',
  content_json: {
    scope_type: 'whole_house',
    areas: [
      {
        area_key: 'living-room',
        confidence: 84,
        themes: [
          { name: 'Warm Contemporary', palette: ['#F5ECD7', '#C8B8A2'], materials: ['Ivory vitrified tile', 'Teak veneer'], status: 'suggested' },
          { name: 'Cool Minimalist', palette: ['#F0F2F5', '#D9DDE3'], materials: ['White polished marble'], status: 'suggested' },
        ],
      },
      {
        area_key: 'master-bedroom',
        confidence: 94,
        themes: [
          { name: 'Earthy Sanctuary', palette: ['#EDE3D6', '#C4A882'], materials: ['Warm beige wall texture', 'Walnut headboard'], status: 'approved' },
        ],
      },
    ],
    narrative: {
      headline: 'A warm, nature-rooted home with contemporary refinement',
      summary:
        'The Tripathi residence brief reflects a clear consensus toward warm earth tones, natural materials, and a calm, uncluttered spatial language. The living room has some divergence on palette which warrants your professional guidance. The master bedroom has strong agreement and is ready to specify.',
      sections: [
        {
          title: 'Living Room',
          body: 'Two competing directions emerged — a warm contemporary scheme (majority preference) and a cool minimalist option. Recommend the Warm Contemporary direction with teak and ivory tile as the primary. The cool palette can be reserved as an accent.\n\nKey materials to specify: ivory vitrified tile (Floor, ~450 sq ft), teak veneer panel (Feature wall), matte brass hardware.',
        },
        {
          title: 'Master Bedroom',
          body: 'High-confidence consensus across all contributors. The Earthy Sanctuary theme is approved and ready to materialize. Walnut headboard unit, jute rug, and warm beige wall texture are the anchor materials.\n\nNo conflicts outstanding.',
        },
        {
          title: 'Design Notes',
          body: 'Across all areas, contributors show strong preference for matte and natural finishes over gloss. Recommend specifying site-visit confirmation for exact tile grout colour before release.',
        },
      ],
    },
  },
  narrative: {
    headline: 'A warm, nature-rooted home with contemporary refinement',
    summary:
      'The Tripathi residence brief reflects a clear consensus toward warm earth tones, natural materials, and a calm, uncluttered spatial language. The living room has some divergence on palette which warrants your professional guidance. The master bedroom has strong agreement and is ready to specify.',
    sections: [
      {
        title: 'Living Room',
        body: 'Two competing directions emerged — a warm contemporary scheme (majority preference) and a cool minimalist option. Recommend the Warm Contemporary direction with teak and ivory tile as the primary.',
      },
      {
        title: 'Master Bedroom',
        body: 'High-confidence consensus. The Earthy Sanctuary theme is approved and ready to materialize.',
      },
      {
        title: 'Design Notes',
        body: 'Strong preference for matte and natural finishes across all areas.',
      },
    ],
  },
  areas: [
    { area_key: 'living-room', confidence: 84 },
    { area_key: 'master-bedroom', confidence: 94 },
  ],
  version: 2,
  created_at: '2026-06-10T12:00:00Z',
  state: 'architect_review',
}

// In-memory mock theme store (mutable so themeDecision updates status)
const _mockThemes: Map<string, DesignTheme> = new Map(
  Object.values(MOCK_THEMES_BY_AREA).flat().map((t) => [t.id, { ...t }])
)

// One answered clarification + one still waiting — exercises both halves of
// the "Homeowner Q&A" section.
const MOCK_CLARIFICATIONS: DesignClarification[] = [
  {
    id: 'clar-1',
    area_id: 'area-lr',
    question: 'Should the living room floor be matte or polished?',
    answer: 'Matte — easier to maintain with kids around.',
    asked_at: '2026-06-09T09:00:00Z',
    answered_at: '2026-06-09T14:30:00Z',
  },
  {
    id: 'clar-2',
    area_id: 'area-mb',
    question: 'Any preference between walnut and teak for the headboard?',
    answer: null,
    asked_at: '2026-06-11T08:00:00Z',
    answered_at: null,
  },
]

// One open conflict — exercises the resolve (keep_a/keep_b/compromise) panel.
const MOCK_CONFLICTS: DesignConflict[] = [
  {
    id: 'conflict-1',
    area_id: 'area-lr',
    dimension: 'palette',
    value: 'Warm Contemporary vs. Cool Minimalist',
    contributor_a_id: 'contrib-1',
    contributor_b_id: 'contrib-2',
    resolution_status: 'open',
    decision_note: null,
  },
]

// In-memory mock conflict store (mutable so resolveConflict updates status)
const _mockConflicts: Map<string, DesignConflict> = new Map(
  MOCK_CONFLICTS.map((c) => [c.id, { ...c }])
)

// Two approval rows — the timeline's minimum viable "it moved" proof.
const MOCK_APPROVALS: DesignBriefApproval[] = [
  {
    id: 'appr-1',
    brief_id: MOCK_BRIEF_ID,
    actor_role: 'homeowner',
    action: 'send_to_architect',
    note: null,
    created_at: '2026-06-10T11:00:00Z',
  },
  {
    id: 'appr-2',
    brief_id: MOCK_BRIEF_ID,
    actor_role: 'architect',
    action: 'architect_sign_off',
    note: null,
    created_at: '2026-06-10T15:00:00Z',
  },
]

// ---------------------------------------------------------------------------
// designApi
// ---------------------------------------------------------------------------

export const designApi = {
  /**
   * GET /api/v1/design/profiles/by-site/{siteId}
   * Returns null on 404 (Labs off, or no profile yet). Throws on other errors.
   */
  async profileBySite(siteId: string): Promise<DesignProfile | null> {
    if (USE_MOCKS) {
      return Promise.resolve({ ...MOCK_PROFILE, site_id: siteId })
    }
    try {
      return await call<DesignProfile>(`/api/v1/design/profiles/by-site/${encodeURIComponent(siteId)}`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  },

  /**
   * GET /api/v1/design/profiles/{profileId}/brief?audience=architect
   * Returns null on 404 (no brief generated yet). Throws on other errors.
   *
   * The response is BriefRenderingOut:
   *   { id, brief_id, audience, scope, content_json, created_at }
   * We normalise it into DesignBrief for convenience.
   */
  async brief(profileId: string, audience = 'architect'): Promise<DesignBrief | null> {
    if (USE_MOCKS) {
      return Promise.resolve({ ...MOCK_BRIEF })
    }
    try {
      const raw = await call<{
        id: string
        brief_id: string
        audience: string
        scope: string
        content_json: DesignBrief['content_json']
        created_at: string
        // BriefRenderingOut carries the owning brief's lifecycle state + version
        // directly — drives designerActions() without a separate lookup.
        state?: string | null
        version?: number | null
      }>(`/api/v1/design/profiles/${encodeURIComponent(profileId)}/brief?audience=${encodeURIComponent(audience)}`)
      return {
        id: raw.id,
        brief_id: raw.brief_id,
        audience: raw.audience,
        scope: raw.scope,
        content_json: raw.content_json,
        created_at: raw.created_at,
        narrative: raw.content_json?.narrative ?? { headline: '', summary: '', sections: [] },
        areas: raw.content_json?.areas ?? [],
        version: raw.version ?? undefined,
        state: raw.state ?? null,
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  },

  /**
   * GET /api/v1/design/profiles/{profileId}/areas/{areaId}/themes
   * Returns the theme list for one area, or [] on 404 (area has no themes yet /
   * partial Labs state). Throws on other errors.
   */
  async themesForArea(profileId: string, areaId: string): Promise<DesignTheme[]> {
    if (USE_MOCKS) {
      // Find by area_id in mock store
      const themes = Array.from(_mockThemes.values()).filter((t) => t.area_id === areaId)
      return Promise.resolve(themes.map((t) => ({ ...t })))
    }
    try {
      return await call<DesignTheme[]>(
        `/api/v1/design/profiles/${encodeURIComponent(profileId)}/areas/${encodeURIComponent(areaId)}/themes`
      )
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return []
      throw err
    }
  },

  /**
   * POST /api/v1/design/themes/{themeId}/decision
   * body: { action: 'approve' | 'adjust' | 'reject', note? }
   * Returns the updated ThemeOut.
   */
  async themeDecision(
    themeId: string,
    body: { action: 'approve' | 'adjust' | 'reject'; note?: string }
  ): Promise<DesignTheme> {
    if (USE_MOCKS) {
      const t = _mockThemes.get(themeId)
      if (!t) throw new ApiError(404, 'Theme not found')
      const statusMap = { approve: 'approved', adjust: 'adjusted', reject: 'rejected' } as const
      t.status = statusMap[body.action]
      return Promise.resolve({ ...t })
    }
    return call<DesignTheme>(`/api/v1/design/themes/${encodeURIComponent(themeId)}/decision`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /**
   * POST /api/v1/design/profiles/{profileId}/brief
   * (Re)generates the brief for a profile from its current themes/conflicts.
   * Returns GenerateBriefOut { id, version, state }.
   */
  async generateBrief(profileId: string): Promise<GenerateBriefOut> {
    if (USE_MOCKS) {
      return Promise.resolve({ id: 'mock-brief', version: 2, state: 'homeowner_review' })
    }
    return call<GenerateBriefOut>(`/api/v1/design/profiles/${encodeURIComponent(profileId)}/brief`, {
      method: 'POST',
    })
  },

  /**
   * GET /api/v1/design/inbox-summary
   * Contractor-side counts of what waits on the designer: briefs awaiting
   * sign-off, answered clarifications, conflicts deferred to the designer.
   * Throws on error (incl. 404 when the backend predates the endpoint) —
   * callers render nothing on failure.
   */
  async inboxSummary(): Promise<DesignInboxSummary> {
    if (USE_MOCKS) {
      return Promise.resolve({
        briefs_awaiting_signoff: 1,
        answered_clarifications: 0,
        deferred_conflicts: 0,
      })
    }
    return call<DesignInboxSummary>('/api/v1/design/inbox-summary')
  },

  /**
   * POST /api/v1/design/briefs/{briefId}/materialize
   * Returns MaterializeOut { specs_created, specs_reused, ... }
   */
  async materialize(briefId: string): Promise<MaterializeOut> {
    if (USE_MOCKS) {
      return Promise.resolve({
        materials_created: 5,
        materials_reused: 1,
        specs_created: 8,
        specs_reused: 0,
        skipped_areas: [],
      })
    }
    return call<MaterializeOut>(`/api/v1/design/briefs/${encodeURIComponent(briefId)}/materialize`, {
      method: 'POST',
    })
  },

  /**
   * POST /api/v1/design/briefs/{briefId}/approval
   * body: { action: 'approve' | 'request_changes' | 'send_to_architect' |
   *         'architect_sign_off' | 'contractor_received', note? }
   * Drives the brief's lifecycle (designerActions()). Returns the updated brief.
   */
  async actOnBrief(briefId: string, body: { action: string; note?: string }): Promise<{ id: string; state: string }> {
    if (USE_MOCKS) {
      return Promise.resolve({ id: briefId, state: 'contractor_brief_ready' })
    }
    return call<{ id: string; state: string }>(`/api/v1/design/briefs/${encodeURIComponent(briefId)}/approval`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /**
   * GET /api/v1/design/profiles/{profileId}/clarifications
   * The homeowner Q&A for this profile — answered rows plus rows still waiting.
   */
  async clarifications(profileId: string): Promise<DesignClarification[]> {
    if (USE_MOCKS) {
      return Promise.resolve(MOCK_CLARIFICATIONS.map((c) => ({ ...c })))
    }
    return call<DesignClarification[]>(
      `/api/v1/design/profiles/${encodeURIComponent(profileId)}/clarifications`
    )
  },

  /**
   * GET /api/v1/design/profiles/{profileId}/conflicts
   * Taste conflicts between contributors, including any the homeowner side
   * deferred to the architect ('deferred_to_architect').
   */
  async conflicts(profileId: string): Promise<DesignConflict[]> {
    if (USE_MOCKS) {
      return Promise.resolve(Array.from(_mockConflicts.values()).map((c) => ({ ...c })))
    }
    return call<DesignConflict[]>(`/api/v1/design/profiles/${encodeURIComponent(profileId)}/conflicts`)
  },

  /**
   * POST /api/v1/design/conflicts/{conflictId}/resolve
   * body: { resolution: 'keep_a' | 'keep_b' | 'compromise' | 'defer_to_architect', note? }
   * Returns the updated ConflictOut.
   */
  async resolveConflict(
    conflictId: string,
    body: { resolution: 'keep_a' | 'keep_b' | 'compromise' | 'defer_to_architect'; note?: string }
  ): Promise<DesignConflict> {
    if (USE_MOCKS) {
      const c = _mockConflicts.get(conflictId)
      if (!c) throw new ApiError(404, 'Conflict not found')
      c.resolution_status = body.resolution === 'defer_to_architect' ? 'deferred_to_architect' : 'resolved'
      c.decision_note = body.note ?? null
      return Promise.resolve({ ...c })
    }
    return call<DesignConflict>(`/api/v1/design/conflicts/${encodeURIComponent(conflictId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /**
   * GET /api/v1/design/briefs/{briefId}/approvals
   * The attributed approval timeline: every action with actor role + date.
   */
  async briefApprovals(briefId: string): Promise<DesignBriefApproval[]> {
    if (USE_MOCKS) {
      return Promise.resolve(MOCK_APPROVALS.map((a) => ({ ...a })))
    }
    return call<DesignBriefApproval[]>(`/api/v1/design/briefs/${encodeURIComponent(briefId)}/approvals`)
  },
}
