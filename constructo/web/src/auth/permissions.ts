import type { Role } from '../api/auth'

/**
 * Client-side capability model (RBAC primitive — vault 11/04 §5.1).
 *
 * The SERVER is the source of truth for authorization; these capabilities only
 * shape the UI (which nav items, chips, and routes a role sees) and degrade
 * gracefully — e.g. a PM sees "Propose to owner →" where an owner sees
 * "Approve ₹". Never rely on these for security; the API enforces it.
 */
export type Capability =
  | 'view_brief' // owner/pm cross-site exceptions brief
  | 'approve_money' // OWNER ONLY — release/approve spend (no payments rail; tracking + decision)
  | 'propose_decision' // pm/accountant/procurement — propose / flag to owner
  | 'review_dpr' // pm — review & send the auto-DPR (proposes, never auto-sends)
  | 'reconcile' // accountant (procurement feeds) — three-way match
  | 'export_tally' // accountant, owner — CSV export (OTP step-up later)
  | 'capture' // field capture (supervisor/mukadam/anyone on app)
  | 'manage_team' // owner (+ pm invite) — team & roles
  | 'manage_sites' // owner, pm — site CRUD
  | 'manage_settings' // owner — company/integrations/billing
  | 'view_documents' // owner/pm/architect/supervisor — the company registers (Drawings + Documents): view AND manage. Gates the nav item, the page, and both tabs' write actions.
  | 'manage_specs' // architect/owner/pm — the Material Specification schedule (spec-desk)
  | 'view_payments' // owner/accountant/pm/procurement — tracking ledger (read)
  | 'view_permits'
  | 'search'

const ALL: Capability[] = [
  'view_brief',
  'approve_money',
  'propose_decision',
  'review_dpr',
  'reconcile',
  'export_tally',
  'capture',
  'manage_team',
  'manage_sites',
  'manage_settings',
  'view_documents',
  'manage_specs',
  'view_payments',
  'view_permits',
  'search',
]

/**
 * Role → capabilities. Keyed by the wire `Role` strings (+ the legacy
 * `contractor` alias of `labor_contractor`). Unknown roles get nothing.
 */
const CAPS: Record<string, Capability[]> = {
  owner: ALL,
  pm: [
    'view_brief',
    'propose_decision',
    'review_dpr',
    'capture',
    'manage_sites',
    'view_documents',
    'manage_specs',
    'view_payments',
    'view_permits',
    'search',
  ],
  // Architect (interior fit-out) — owns the Material Specification schedule and
  // is part of the company-registers group (drawings + documents).
  architect: ['view_documents', 'manage_specs', 'view_permits', 'search'],
  accountant: [
    'propose_decision',
    'reconcile',
    'export_tally',
    'view_payments',
    'view_permits',
    'search',
  ],
  procurement: [
    'propose_decision',
    'reconcile',
    'capture',
    'view_payments',
    'view_permits',
    'search',
  ],
  // Site engineer (supervisor) — captures on site and is part of the
  // company-registers group (drawings + documents).
  supervisor: ['capture', 'view_documents', 'view_permits', 'search'],
  labor_contractor: ['capture'],
  contractor: ['capture'], // legacy alias
}

export function capsFor(role: Role | string | undefined | null): Set<Capability> {
  if (!role) return new Set<Capability>()
  return new Set<Capability>(CAPS[role] ?? [])
}

export function roleCan(
  role: Role | string | undefined | null,
  cap: Capability,
): boolean {
  return capsFor(role).has(cap)
}
