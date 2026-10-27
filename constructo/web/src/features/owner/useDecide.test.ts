import { describe, expect, it } from 'vitest'
import { applyDecisionToHome, recordedDecision, type DecideInput } from './useDecide'
import type { Decision } from '../../api/approvals'
import type { OwnerHome } from '../../api/dashboard'

function home(): OwnerHome {
  return {
    brief_date: '2026-05-28',
    needs_attention_count: 2,
    sites_total: 2,
    sites_needing_attention: 2,
    cold_start: false,
    setup_checklist: [],
    sites: [
      {
        site_id: 's1',
        name: 'Tower B',
        status: 'risk',
        expected_headcount: 10,
        top_risks: [
          { site_id: 's1', kind: 'labor_shortfall', severity: 'high', status: 'risk', message: 'r0', evidence_event_ids: [] },
          { site_id: 's1', kind: 'data_quality', severity: 'low', status: 'warn', message: 'r1', evidence_event_ids: [] },
        ],
        risk_overflow: 0,
        counts: { attendance: 0, deliveries: 0, issues: 0, total: 0 },
        pulse: [],
      },
      {
        site_id: 's2',
        name: 'Villa A',
        status: 'warn',
        expected_headcount: null,
        top_risks: [
          { site_id: 's2', kind: 'pending_approval', severity: 'med', status: 'warn', message: 'r0', evidence_event_ids: [] },
        ],
        risk_overflow: 0,
        counts: { attendance: 0, deliveries: 0, issues: 0, total: 0 },
        pulse: [],
      },
    ],
  }
}

describe('applyDecisionToHome', () => {
  it('drops the actioned risk and ticks the headline count down by one', () => {
    const next = applyDecisionToHome(home(), 's1', 's1-0')
    expect(next.needs_attention_count).toBe(1)
    expect(next.sites.find((s) => s.site_id === 's1')!.top_risks.map((r) => r.message)).toEqual(['r1'])
    // Other site untouched.
    expect(next.sites.find((s) => s.site_id === 's2')!.top_risks).toHaveLength(1)
  })

  it('recomputes sites-needing-attention when a site clears its last risk', () => {
    const next = applyDecisionToHome(home(), 's2', 's2-0')
    expect(next.sites.find((s) => s.site_id === 's2')!.top_risks).toHaveLength(0)
    expect(next.sites_needing_attention).toBe(1) // only s1 still has risks
  })

  it('never drops the count below zero', () => {
    const h = home()
    h.needs_attention_count = 0
    expect(applyDecisionToHome(h, 's1', 's1-0').needs_attention_count).toBe(0)
  })

  it('is pure — does not mutate the input payload', () => {
    const h = home()
    applyDecisionToHome(h, 's1', 's1-0')
    expect(h.sites[0].top_risks).toHaveLength(2)
    expect(h.needs_attention_count).toBe(2)
  })
})

describe('recordedDecision — the log row says exactly what the server records', () => {
  const now = new Date('2026-07-03T10:00:00Z')
  const risk = {
    type: 'risk' as const,
    siteId: 's1',
    riskKey: 's1-0',
    title: 'Invoice received with no matching delivery',
    evidenceEventIds: ['ev-1'],
  }
  const pending: Decision = {
    id: 'd1', company_id: 'co', site_id: 's1', kind: 'approval', title: 'ACC invoice',
    detail: null, raised_by: null, assigned_to: null, state: 'pending', sla_due_at: null,
    resolved_at: null, resolution_note: null, evidence_event_ids: [], created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  }
  const rec = (input: DecideInput) => recordedDecision(input, 'cid-1', now)

  it('approve on a risk is the owner\'s resolved approval', () => {
    const row = rec({ target: risk, action: 'approve' })
    expect(row).toMatchObject({ id: 'cid-1', kind: 'approval', state: 'resolved', evidence_event_ids: ['ev-1'] })
    expect(row.resolved_at).toBe(now.toISOString())
  })

  it('hold on a risk is an open held payment', () => {
    expect(rec({ target: risk, action: 'hold' })).toMatchObject({ kind: 'hold_payment', state: 'pending', resolved_at: null })
  })

  it('assign on a risk is an open ask for the chosen person', () => {
    expect(rec({ target: risk, action: 'assign', assignee: { id: 'u-ravi', name: 'Ravi' } })).toMatchObject({
      kind: 'generic', state: 'pending', assigned_to: 'u-ravi',
    })
  })

  it('acts on an existing decision in place', () => {
    const target = { type: 'decision' as const, decision: pending }
    expect(rec({ target, action: 'approve' })).toMatchObject({ id: 'd1', kind: 'approval', state: 'resolved' })
    expect(rec({ target, action: 'hold' })).toMatchObject({ id: 'd1', kind: 'hold_payment', state: 'pending' })
    expect(rec({ target, action: 'assign', assignee: { id: 'u2', name: 'A' } })).toMatchObject({
      id: 'd1', kind: 'approval', state: 'pending', assigned_to: 'u2',
    })
  })
})
