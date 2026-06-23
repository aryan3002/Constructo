import type { Role } from '../api/auth'
import type { Capability } from '../auth/permissions'
import { roleCan } from '../auth/permissions'
import type { TranslationKey } from '../i18n'

/** Icon keys resolved to an SVG by the sidebar (keeps this model pure + testable). */
export type NavIconName =
  | 'grid' | 'check' | 'scale' | 'cash' | 'compass' | 'camera'
  | 'building' | 'message' | 'doc' | 'shield' | 'chart' | 'search'
  | 'users' | 'settings'

export interface NavItem {
  to: string
  labelKey: TranslationKey
  /** Per-role label override (supervisor's Sites → "My Sites"). */
  labelKeyByRole?: Partial<Record<Role, TranslationKey>>
  iconName: NavIconName
  /** Required cap to SEE a SHARED/ADMIN item; PRIMARY items are role-curated. */
  cap?: Capability
  /** NavLink exact-match (index-like or to stop prefix bleed). */
  end?: boolean
}

export interface NavZones {
  primary: NavItem[]
  shared: NavItem[]
  admin: NavItem[]
}

// --- the destinations (route · cap · icon) ---
const DASHBOARD: NavItem = { to: '/owner', labelKey: 'nav.brief', iconName: 'grid', end: true }
const APPROVALS: NavItem = { to: '/approvals', labelKey: 'nav.approvals', iconName: 'check' }
const RECONCILE: NavItem = { to: '/reconcile', labelKey: 'nav.reconcile', iconName: 'scale' }
const FINANCE: NavItem = { to: '/payments', labelKey: 'nav.finance', iconName: 'cash' }
const DESIGNER: NavItem = { to: '/designer', labelKey: 'nav.designer', iconName: 'compass', end: true }
const CAPTURE: NavItem = { to: '/supervisor/capture', labelKey: 'nav.capture', iconName: 'camera', end: true }

const SITES: NavItem = {
  to: '/sites', labelKey: 'nav.sites',
  labelKeyByRole: { supervisor: 'nav.my_sites' }, iconName: 'building',
}
const CHAT: NavItem = { to: '/chat', labelKey: 'nav.chat', iconName: 'message' }
const DRAWINGS: NavItem = { to: '/settings/documents', labelKey: 'nav.documents', iconName: 'doc' }
const PERMITS: NavItem = { to: '/permits', labelKey: 'nav.permits', iconName: 'shield', cap: 'view_permits' }
const REPORTS: NavItem = { to: '/reports', labelKey: 'nav.reports', iconName: 'chart', cap: 'export_tally' }
const SEARCH: NavItem = { to: '/search', labelKey: 'nav.search', iconName: 'search', cap: 'search' }

const ADMIN_CONSOLE: NavItem = { to: '/settings/admin', labelKey: 'nav.admin', iconName: 'users', cap: 'manage_settings' }
const SETTINGS: NavItem = { to: '/settings', labelKey: 'nav.settings', iconName: 'settings', end: true }

// PRIMARY is the role's cockpit (curated — the owner holds every cap but must
// not see "Capture"). SHARED/ADMIN are universal, cap-filtered.
const PRIMARY_BY_ROLE: Partial<Record<Role, NavItem[]>> = {
  owner: [DASHBOARD, APPROVALS, RECONCILE, FINANCE],
  pm: [DASHBOARD, APPROVALS],
  architect: [DESIGNER],
  supervisor: [CAPTURE],
}

const SHARED: NavItem[] = [SITES, CHAT, DRAWINGS, PERMITS, REPORTS, SEARCH]
const ADMIN: NavItem[] = [ADMIN_CONSOLE, SETTINGS]

export function navForRole(role: Role): NavZones {
  const gate = (i: NavItem) => !i.cap || roleCan(role, i.cap)
  return {
    primary: PRIMARY_BY_ROLE[role] ?? [],
    shared: SHARED.filter(gate),
    admin: ADMIN.filter(gate),
  }
}

/** Resolve the i18n label key for an item under a role (honours per-role override). */
export function labelKeyFor(item: NavItem, role: Role): TranslationKey {
  return item.labelKeyByRole?.[role] ?? item.labelKey
}
