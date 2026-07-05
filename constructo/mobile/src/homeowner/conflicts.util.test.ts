import { conflictSides, resolvedSummary } from './conflicts.util'
import type { ProfilerConflict, ProfilerContributor } from '../api/client'

const contributors: ProfilerContributor[] = [
  { id: 'c-me', role: 'owner', is_decision_owner: true },
  { id: 'c-spouse', role: 'co_owner', is_decision_owner: true },
]

function conflict(overrides: Partial<ProfilerConflict> = {}): ProfilerConflict {
  return {
    id: 'conf-1',
    area_id: 'area-1',
    dimension: 'colors',
    value: 'Warm neutrals|Cool greys',
    contributor_a_id: 'c-me',
    contributor_b_id: 'c-spouse',
    resolution_status: 'open',
    decision_note: null,
    ...overrides,
  }
}

describe('conflictSides', () => {
  test('labels both sides from profile contributors, marking the caller "You"', () => {
    const result = conflictSides(conflict(), contributors, 'c-me')
    expect(result).toEqual({
      dimension: 'colors',
      label: 'Colours',
      a: { name: 'You', value: 'Warm neutrals' },
      b: { name: 'Co-owner', value: 'Cool greys' },
    })
  })

  test('falls back to "You"/"Co-owner" for an unknown contributor id', () => {
    const c = conflict({ contributor_a_id: 'ghost-id', contributor_b_id: null })
    const result = conflictSides(c, contributors, 'c-me')
    expect(result.a.name).toBe('Co-owner')
    expect(result.b.name).toBe('Co-owner')
  })

  test('labels a non-colors dimension using a readable title', () => {
    const c = conflict({ dimension: 'material', value: 'Oak|Marble' })
    const result = conflictSides(c, contributors, 'c-me')
    expect(result.label).toBe('Materials')
    expect(result.a.value).toBe('Oak')
    expect(result.b.value).toBe('Marble')
  })

  test('handles a single-value conflict without a pipe gracefully', () => {
    const c = conflict({ value: 'Warm neutrals' })
    const result = conflictSides(c, contributors, 'c-me')
    expect(result.a.value).toBe('Warm neutrals')
    expect(result.b.value).toBe('A different direction')
  })

  test('labels every real ContributorRole (backend enum: owner | co_owner | family | advisor | architect)', () => {
    const roled = (role: string): ProfilerContributor[] => [
      { id: 'c-a', role, is_decision_owner: false },
      { id: 'c-spouse', role: 'co_owner', is_decision_owner: true },
    ]
    const nameFor = (role: string) => {
      const c = conflict({ contributor_a_id: 'c-a' })
      return conflictSides(c, roled(role), 'c-me').a.name
    }
    expect(nameFor('owner')).toBe('Owner')
    expect(nameFor('co_owner')).toBe('Co-owner')
    expect(nameFor('family')).toBe('Family')
    expect(nameFor('advisor')).toBe('Advisor')
    // architect -> "Designer": the homeowner-facing name for this role.
    expect(nameFor('architect')).toBe('Designer')
  })

  test('falls back to "Co-owner" for a role that does not exist on the backend', () => {
    const c = conflict({ contributor_a_id: 'c-a' })
    const result = conflictSides(
      c,
      [{ id: 'c-a', role: 'primary_owner', is_decision_owner: false }],
      'c-me',
    )
    expect(result.a.name).toBe('Co-owner')
  })
})

describe('resolvedSummary', () => {
  test('names the resolver when known', () => {
    expect(resolvedSummary('Went with warm oak', 'You')).toBe('Settled by You: Went with warm oak')
  })

  test('falls back to the quieter form when the resolver is unknown', () => {
    expect(resolvedSummary('Went with warm oak', null)).toBe('Settled: Went with warm oak')
  })

  test('falls back to a generic body when there is no note', () => {
    expect(resolvedSummary(null, 'You')).toBe('Settled by You: Decision recorded')
  })
})
