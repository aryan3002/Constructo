/**
 * API types mirroring the backend JSON shapes (snake_case).
 *
 * The first block is ported verbatim from the web client (`web/src/api/types.ts`)
 * so both clients share one contract. The second block adds the H0
 * homeowner-facing shapes (see `HOMEOWNER_H0.md`).
 */

export interface Paginated<T> {
  items: T[]
  next_cursor: string | null
}

// ---- Auth / roles ----
export type Role =
  | 'owner'
  | 'pm'
  | 'supervisor'
  | 'accountant'
  | 'procurement'
  | 'labor_contractor'
  | 'homeowner'

export type Language = 'en' | 'hi'

export interface LoginRequest {
  phone: string
  otp: string
}

export interface LoginResponse {
  token: string
}

export interface Me {
  id: string
  company_id: string
  name: string | null
  phone: string
  role: Role
  language: Language | null
}

// ---- Sites ----
export interface Site {
  id: string
  company_id: string
  name: string
  location: string
  type: string
  status: string
  created_at: string
}

// ---- H0: homeowner onboarding ----
export type HomeownerSubRole = 'primary_owner' | 'co_owner' | 'family' | 'advisor'

export interface HomeownerJoinRequest {
  join_code: string
  phone: string
  otp: string
}

export interface HomeownerJoinResponse {
  token: string
  site_id: string
  sub_role: HomeownerSubRole
  /** Optional — present once the backend ships JoinOut. */
  display_name?: string
  /** Optional — present once the backend ships JoinOut. */
  company_name?: string
}

/** Extended join response shape — alias for clarity in new screens. */
export type JoinOut = HomeownerJoinResponse

export interface HomeownerMember {
  id: string
  site_id: string
  user_id: string | null
  display_name: string | null
  sub_role: HomeownerSubRole
  notif_prefs: Record<string, unknown>
  phone: string | null
  join_code: string
  status: 'invited' | 'active'
  created_at: string
  invite_link: string
  /** Design scope — {} = no say, {all:true} = full, {space_id:'...'} = one room */
  can_design?: boolean
  design_space_id?: string | null
}

/** Body sent when inviting a household member (Primary/Co-owner only). */
export interface HouseholdInviteRequest {
  display_name: string
  phone: string
  sub_role: 'co_owner' | 'family' | 'advisor'
  site_id?: string
}

/** Body sent to PATCH /members/{id}/manage */
export interface MemberManageRequest {
  sub_role?: HomeownerSubRole
  can_design?: boolean
  design_space_id?: string | null
}

/** Extended capabilities returned from GET /me/capabilities */
export interface Capabilities {
  sub_role: HomeownerSubRole
  can_approve: boolean
  can_comment: boolean
  can_manage_members?: boolean
  can_design?: boolean
  design_space_id?: string | null
}

// ---- H0: feed reads ----
export type MilestoneStatus = 'upcoming' | 'now' | 'done'
export type UpdateType =
  | 'progress'
  | 'milestone'
  | 'decision_needed'
  | 'delay'
  | 'change'
  | 'quiet'
export type ComponentStatus = 'not_started' | 'in_progress' | 'done'

export interface Milestone {
  id: string
  site_id: string
  name: string
  status: MilestoneStatus
  started_on: string | null
  expected_on: string | null
  completed_on: string | null
  order: number
}

export interface Photo {
  id: string
  site_id: string
  image_url: string
  caption: string | null
  room_tag: string | null
  milestone_id: string | null
  is_starred: boolean
  published_at: string
}

export interface Update {
  id: string
  site_id: string
  type: UpdateType
  title: string
  body: string | null
  published_at: string
}

export interface WeeklySummary {
  id: string
  site_id: string
  week_start: string
  text: string
  published_at: string
}

export interface Change {
  id: string
  site_id: string
  description: string
  cost_delta: number | null
  schedule_delta_days: number | null
  reason: string | null
  approved_by: string | null
  requested_by: string | null
  running_total_cost: number
  approved_by_name: string | null
  requested_by_name: string | null
  created_at: string
}

export interface ChangesLog {
  items: Change[]
  total_cost_delta: number
  total_schedule_delta_days: number
}

export interface ComponentItem {
  id: string
  name: string
  kind: string | null
  status: ComponentStatus
}

export interface Space {
  id: string
  site_id: string
  parent_id: string | null
  name: string
  kind: string
  order: number
  components: ComponentItem[]
  progress: number | null
}

export interface Property {
  id: string
  site_id: string
  display_name: string
  type: string | null
  status: string | null
  started_on: string | null
  expected_handover_on: string | null
  spaces: Space[]
}

export interface AttentionItem {
  id: string
  title: string
  detail: string | null
  kind: string
  created_at: string
}

export interface SpendSummary {
  total_change_cost_delta: number
  change_count: number
}

/** A contractor-confirmed quiet card — "nothing visible today, here's why".
 *
 * Field names mirror QuietPeriodOut from backend/app/homeowner/schemas.py.
 * Only confirmed/published quiet windows are ever returned; drafts are
 * filtered server-side. The `reason` text is already in the user's language
 * when the backend translation pipeline is active (H6.T).
 */
export interface QuietPeriod {
  id: string
  site_id: string
  status: string
  gap_days: number
  /** Backend-translated reason text (render as-is; never hardcode English). */
  reason: string | null
  last_signal_at: string | null
  next_expected_at: string | null
  detected_at: string
}

export interface Home {
  property: Property | null
  milestone_now: Milestone | null
  milestone_next: Milestone | null
  needs_attention: AttentionItem[]
  recent_activity: Update[]
  spend_summary: SpendSummary | null
  /** Present when the site is in a confirmed quiet period. Null otherwise. */
  quiet: QuietPeriod | null
}

// ---- H0: design ----
export type ReferenceSource = 'upload' | 'pinterest'

export interface DesignProfile {
  id: string | null
  site_id: string
  profile: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
}

export interface DesignReference {
  id: string
  site_id: string
  image_url: string
  room_tag: string | null
  source: ReferenceSource
  created_at: string
}

export interface DesignSelection {
  id: string
  site_id: string
  space_id: string | null
  item: string
  choice: string
  status: string
  created_at: string
}

export interface ConsistencyCheck {
  fits: boolean
  feedback: string
}

// ---- H0: requests & decisions ----
export type RequestStatus = 'sent' | 'seen' | 'in_progress' | 'done'

export interface HomeownerRequest {
  id: string
  site_id: string
  raised_by: string | null
  title: string
  detail: string | null
  status: RequestStatus
  sla_due_at: string | null
  created_at: string
  updated_at: string
}

export interface HomeownerDecision {
  id: string
  site_id: string | null
  kind: string
  title: string
  detail: string | null
  state: string
  created_at: string
}

