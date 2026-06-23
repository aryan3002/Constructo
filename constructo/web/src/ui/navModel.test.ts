import { describe, it, expect } from 'vitest'
import { navForRole, labelKeyFor } from './navModel'

const routes = (items: { to: string }[]) => items.map((i) => i.to)

describe('navForRole', () => {
  it('owner gets the full command center across three zones', () => {
    const z = navForRole('owner')
    expect(routes(z.primary)).toEqual(['/owner', '/approvals', '/reconcile', '/payments'])
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
    expect(labelKeyFor(sites, 'owner')).toBe('nav.sites')
  })

  it('Settings uses exact match; Drawings/Admin do not', () => {
    const settings = navForRole('owner').admin.find((i) => i.to === '/settings')!
    expect(settings.end).toBe(true)
  })
})
