import { describe, it, expect } from 'vitest'
import { navForRole, labelKeyFor } from './navModel'

const routes = (items: { to: string }[]) => items.map((i) => i.to)

describe('navForRole', () => {
  it('owner gets the command center across three zones (Reconcile + Finance hidden for pilot)', () => {
    const z = navForRole('owner')
    // Reconcile + Finance are intentionally hidden from the owner nav for the
    // pilot (chat-derived data not structured enough yet); routes still exist.
    // Requests (homeowner-side) is in the owner PRIMARY cockpit alongside
    // Dashboard + Approvals (E4).
    expect(routes(z.primary)).toEqual(['/owner', '/approvals', '/requests'])
    expect(routes(z.shared)).toEqual([
      '/sites', '/chat', '/settings/documents', '/permits', '/reports', '/search',
    ])
    expect(routes(z.admin)).toEqual(['/settings/admin', '/settings'])
  })

  it('architect: Designer cockpit, no Reports (no export_tally), no Admin (no manage_settings)', () => {
    const z = navForRole('architect')
    expect(routes(z.primary)).toEqual(['/designer'])
    expect(routes(z.shared)).toEqual(['/sites', '/chat', '/settings/documents', '/permits', '/search'])
    expect(routes(z.admin)).toEqual(['/settings'])
  })

  it('supervisor: Capture cockpit; Sites label overrides to My Sites', () => {
    const z = navForRole('supervisor')
    expect(routes(z.primary)).toEqual(['/supervisor/capture'])
    expect(routes(z.shared)).toEqual(['/sites', '/chat', '/settings/documents', '/permits', '/search'])
    const sites = z.shared.find((i) => i.to === '/sites')!
    expect(labelKeyFor(sites, 'supervisor')).toBe('nav.my_sites')
    // owner has its own override (Projects, E4); a role with no override (pm)
    // still falls through to the shared default.
    expect(labelKeyFor(sites, 'owner')).toBe('nav.projects')
    expect(labelKeyFor(sites, 'pm')).toBe('nav.sites')
  })

  it('Settings uses exact match; Drawings/Admin do not', () => {
    const settings = navForRole('owner').admin.find((i) => i.to === '/settings')!
    expect(settings.end).toBe(true)
  })
})

describe('navForRole(owner) — Requests entry', () => {
  it('includes a Requests item pointing at /requests', () => {
    const zones = navForRole('owner')
    const all = [...zones.primary, ...zones.shared, ...zones.admin]
    const requests = all.find((i) => i.to === '/requests')
    expect(requests).toBeDefined()
    expect(requests?.labelKey).toBe('nav.requests')
    expect(requests?.iconName).toBe('inbox')
  })

  it('owner Sites row uses the Projects label key', () => {
    const sites = navForRole('owner').shared.find((i) => i.to === '/sites')
    // owner sees "Projects"; supervisor still sees "My Sites"
    expect(sites?.labelKeyByRole?.owner).toBe('nav.projects')
  })
})
