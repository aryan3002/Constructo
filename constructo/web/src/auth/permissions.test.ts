import { describe, expect, it } from 'vitest'
import { capsFor, roleCan } from './permissions'

describe('permissions (client RBAC model)', () => {
  it('owner approves money; PM proposes but cannot approve', () => {
    expect(roleCan('owner', 'approve_money')).toBe(true)
    expect(roleCan('pm', 'approve_money')).toBe(false)
    expect(roleCan('pm', 'propose_decision')).toBe(true)
  })

  it('accountant reconciles + exports but never approves spend', () => {
    expect(roleCan('accountant', 'reconcile')).toBe(true)
    expect(roleCan('accountant', 'export_tally')).toBe(true)
    expect(roleCan('accountant', 'approve_money')).toBe(false)
  })

  it('field roles are capture-scoped; supervisor has no payments view', () => {
    expect(roleCan('supervisor', 'capture')).toBe(true)
    expect(roleCan('supervisor', 'view_payments')).toBe(false)
    expect(roleCan('labor_contractor', 'capture')).toBe(true)
    expect(roleCan('labor_contractor', 'search')).toBe(false)
  })

  it('legacy `contractor` aliases labor_contractor', () => {
    expect(roleCan('contractor', 'capture')).toBe(true)
  })

  it('company registers (drawings + documents): owner/pm/architect/supervisor have access; others do not', () => {
    for (const r of ['owner', 'pm', 'architect', 'supervisor']) {
      expect(roleCan(r, 'view_documents')).toBe(true)
    }
    for (const r of ['accountant', 'procurement', 'labor_contractor', 'contractor']) {
      expect(roleCan(r, 'view_documents')).toBe(false)
    }
  })

  it('unknown / missing role has zero capabilities', () => {
    expect(capsFor(undefined).size).toBe(0)
    expect(capsFor(null).size).toBe(0)
    expect(roleCan('nobody', 'search')).toBe(false)
  })
})
