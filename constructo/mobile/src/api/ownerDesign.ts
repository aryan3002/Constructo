/**
 * Owner Design-Profiler API surface — the role-agnostic `/api/v1/design/*`
 * engine (Labs). The owner's Design hub / DesignSite / dp screens read the same
 * profiler the architect + homeowner use: profiles (per site), areas (rooms),
 * AI-drafted themes (palette + materials + rationale), and conflicts.
 *
 * Determinism doctrine: the LLM drafts theme prose + palettes; a named human
 * (owner/pm/architect) commits via theme decisions + conflict resolutions.
 */
import { request } from './client'

export type ProfileStatus =
  | 'not_started' | 'intake_started' | 'collecting_inputs' | 'ranking'
  | 'ai_interpreting' | 'needs_clarification' | 'theme_suggested'
  | 'homeowner_review' | 'approved' | 'locked' | 'materialized' | string
export type ProfileScope = 'whole_house' | 'rooms' | 'elements'
export type AreaKind = 'house_build' | 'interior' | 'element'
export type ThemeStatus = 'suggested' | 'approved' | 'adjusted' | 'rejected'
export type ConflictStatus = 'open' | 'resolved' | 'deferred_to_architect'

export interface Profile {
  id: string
  company_id: string
  site_id: string
  scope_type: ProfileScope
  status: ProfileStatus
  created_at: string
}

export interface Area {
  id: string
  area_kind: AreaKind
  area_key: string
  recommended_count: number
  status: string
  confidence: number
  has_conflict: boolean
}

export interface Contributor {
  id: string
  role: string
  is_decision_owner: boolean
}

export interface ProfileDetail extends Profile {
  areas: Area[]
  contributors: Contributor[]
}

export interface Theme {
  id: string
  area_id: string | null
  name: string
  confidence: number
  palette: string[]
  materials: string[]
  rationale: string | null
  evidence_reference_ids: string[]
  status: ThemeStatus
  created_at: string
}

export interface Conflict {
  id: string
  area_id: string
  dimension: string
  value: string
  contributor_a_id: string | null
  contributor_b_id: string | null
  resolution_status: ConflictStatus
  decision_note: string | null
}

export type ThemeAction = 'approve' | 'adjust' | 'reject'
export type ConflictResolution = 'keep_a' | 'keep_b' | 'compromise' | 'defer_to_architect'

export const design = {
  profiles: (siteId?: string) =>
    request<Profile[]>(`/api/v1/design/profiles${siteId ? `?site_id=${siteId}` : ''}`),

  profile: (id: string) => request<ProfileDetail>(`/api/v1/design/profiles/${id}`),

  themes: (profileId: string, areaId: string) =>
    request<Theme[]>(`/api/v1/design/profiles/${profileId}/areas/${areaId}/themes`),

  conflicts: (profileId: string) =>
    request<Conflict[]>(`/api/v1/design/profiles/${profileId}/conflicts`),

  decideTheme: (themeId: string, action: ThemeAction, note?: string) =>
    request<Theme>(`/api/v1/design/themes/${themeId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ action, note: note ?? null }),
    }),

  resolveConflict: (conflictId: string, resolution: ConflictResolution, note?: string) =>
    request<Conflict>(`/api/v1/design/conflicts/${conflictId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution, note: note ?? null }),
    }),

  /**
   * Attach an inspiration/reference image to an area (the designer uploads a
   * marked-up or found image; the vision pipeline extracts its attributes and
   * folds them into the area's taste model). `image_r2_key` is the stored key
   * from a prior media upload. contributor_id is omitted for a role-level add.
   */
  addReference: (body: { area_id: string; image_r2_key?: string; source_url?: string }) =>
    request<{ id: string }>('/api/v1/design/references', {
      method: 'POST',
      body: JSON.stringify({ source_type: 'upload', ...body }),
    }),
}

// ---- shared label/tone helpers --------------------------------------------

export function profileStatusLabel(s: ProfileStatus): string {
  const map: Record<string, string> = {
    not_started: 'Not started',
    intake_started: 'Intake started',
    collecting_inputs: 'Collecting inputs',
    ranking: 'Ranking',
    ai_interpreting: 'AI interpreting',
    needs_clarification: 'Needs clarification',
    theme_suggested: 'Direction suggested',
    homeowner_review: 'In owner review',
    approved: 'Approved',
    locked: 'Locked',
    materialized: 'In execution',
  }
  return map[s] ?? s.replace(/_/g, ' ')
}
