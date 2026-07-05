/** The single source of designer-action truth for a design brief.
 *  Pure map from brief state -> the actions the designer may take.
 *  'regenerate' and 'materialize' are client pseudo-actions (they call
 *  designApi.generateBrief / designApi.materialize respectively); the other
 *  two ('architect_sign_off', 'request_changes') go through designApi.actOnBrief.
 *  Unknown/future states resolve to [] — forward-compat by default.
 *
 *  Faithful port of mobile/src/architect/brief_actions.util.ts. `label` is the
 *  EN fallback string; callers that render inside the web i18n system (Intake.tsx)
 *  should prefer `t('intake.action.<action>')` and fall back to `label`. */

export type DesignerActionType =
  | 'architect_sign_off'
  | 'request_changes'
  | 'regenerate'
  | 'materialize'

export interface DesignerAction {
  action: DesignerActionType
  label: string
  variant: 'primary' | 'secondary' | 'ghost'
  needsNote?: boolean
}

const _SIGN_OFF: DesignerAction = {
  action: 'architect_sign_off',
  label: 'Sign off brief',
  variant: 'primary',
}

const _REQUEST_CHANGES: DesignerAction = {
  action: 'request_changes',
  label: 'Request changes',
  variant: 'secondary',
  needsNote: true,
}

const _REGENERATE: DesignerAction = {
  action: 'regenerate',
  label: 'Regenerate brief',
  variant: 'primary',
}

const _MATERIALIZE: DesignerAction = {
  action: 'materialize',
  label: 'Create material selections',
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
