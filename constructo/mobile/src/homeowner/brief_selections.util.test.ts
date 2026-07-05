// Tests for the "From your design brief" grouping (src/homeowner/brief_selections.util).
// Lives under src/ (NOT app/) — Expo Router treats every app/ file as a route.
import { briefBornDecisions } from './brief_selections.util'
import type { HomeownerDecision } from '../api/types'

const decision = (overrides: Partial<HomeownerDecision> = {}): HomeownerDecision => ({
  id: `id-${Math.random()}`,
  site_id: 'site-1',
  kind: 'approval',
  title: 'Selection sign-off: Fluted Marble Panel',
  detail: null,
  state: 'pending',
  created_at: '2026-07-05T10:00:00Z',
  spec_id: 'spec-1',
  spec_label: 'Fluted Marble Panel',
  ...overrides,
})

describe('briefBornDecisions', () => {
  it('keeps only decisions with a spec_id', () => {
    const specd = decision()
    const plain = decision({ spec_id: null, spec_label: null })
    expect(briefBornDecisions([specd, plain])).toEqual([specd])
  })

  it('treats a missing spec_id field the same as null (undefined-safe)', () => {
    const noField = decision()
    delete (noField as { spec_id?: string | null }).spec_id
    expect(briefBornDecisions([noField])).toEqual([])
  })

  it('returns an empty array when nothing is spec-linked', () => {
    const plain = decision({ spec_id: null, spec_label: null })
    expect(briefBornDecisions([plain])).toEqual([])
  })

  it('returns an empty array for an empty input', () => {
    expect(briefBornDecisions([])).toEqual([])
  })

  it('preserves input order', () => {
    const first = decision({ id: 'a', created_at: '2026-07-01T00:00:00Z' })
    const second = decision({ id: 'b', created_at: '2026-07-03T00:00:00Z' })
    expect(briefBornDecisions([second, first]).map((d) => d.id)).toEqual(['b', 'a'])
  })
})
