/** The single source of designer-action truth for a design brief.
 *  Pure map from brief state -> the actions the designer may take.
 *  'regenerate' and 'materialize' are client pseudo-actions (they call
 *  design.generateBrief / design.materialize respectively); the other
 *  two ('architect_sign_off', 'request_changes') go through design.actOnBrief.
 *  Unknown/future states resolve to [] — forward-compat by default. */

export type DesignerActionType =
  | 'architect_sign_off'
  | 'request_changes'
  | 'regenerate'
  | 'materialize'

export interface DesignerAction {
  action: DesignerActionType
  label: string
  labelHi: string
  variant: 'primary' | 'secondary' | 'ghost'
  needsNote?: boolean
}

const _SIGN_OFF: DesignerAction = {
  action: 'architect_sign_off',
  label: 'Sign off brief',
  labelHi: 'ब्रीफ़ स्वीकृत करें',
  variant: 'primary',
}

const _REQUEST_CHANGES: DesignerAction = {
  action: 'request_changes',
  label: 'Request changes',
  labelHi: 'बदलाव माँगें',
  variant: 'secondary',
  needsNote: true,
}

const _REGENERATE: DesignerAction = {
  action: 'regenerate',
  label: 'Regenerate brief',
  labelHi: 'ब्रीफ़ फिर बनाएँ',
  variant: 'primary',
}

const _MATERIALIZE: DesignerAction = {
  action: 'materialize',
  label: 'Create material selections',
  labelHi: 'सामग्री चयन बनाएँ',
  variant: 'primary',
}

/** Brief-state -> designer actions. Mirrors the backend BriefState enum:
 *  homeowner_review, revision_requested, architect_review,
 *  contractor_brief_ready, approved, locked. */
export function designerActions(state: string): DesignerAction[] {
  switch (state) {
    case 'architect_review':
      return [_SIGN_OFF, _REQUEST_CHANGES]
    case 'revision_requested':
      return [_REGENERATE]
    case 'contractor_brief_ready':
    case 'approved':
    case 'locked':
      return [_MATERIALIZE]
    case 'homeowner_review':
    default:
      return []
  }
}

/** The 5-entry approval-timeline label map — one row title per action. */
const _ACTION_LABELS: Record<string, string> = {
  send_to_architect: 'Brief sent to designer',
  request_changes: 'Changes requested',
  architect_sign_off: 'Designer signed off',
  approve: 'Approved by owner',
  contractor_received: 'Received by contractor',
}

export function actionLabel(action: string): string {
  return _ACTION_LABELS[action] ?? action
}

/** Brief-state -> StatusPill tone for the architect hub's per-card pill.
 *  Mirrors the backend BriefState enum; unknown/future states read as
 *  'quiet' rather than surfacing a wrong signal. */
const _STATE_TONE: Record<string, 'quiet' | 'info' | 'warn' | 'ok'> = {
  homeowner_review: 'quiet',
  architect_review: 'info',
  revision_requested: 'warn',
  contractor_brief_ready: 'ok',
  approved: 'ok',
  locked: 'quiet',
}

export function stateTone(state: string): 'quiet' | 'info' | 'warn' | 'ok' {
  return _STATE_TONE[state] ?? 'quiet'
}

/** Brief-state -> a short, homeowner/designer-legible label for the hub pill. */
const _STATE_LABEL: Record<string, string> = {
  homeowner_review: 'With homeowner',
  architect_review: 'For your review',
  revision_requested: 'Changes requested',
  contractor_brief_ready: 'Signed off',
  approved: 'Approved',
  locked: 'Locked',
}

export function stateLabel(state: string): string {
  return _STATE_LABEL[state] ?? state
}
