import { describe, expect, it } from 'vitest'
import { applyDecisionToHome } from './useDecide'
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
