// Tests for groupSelections (app/(homeowner)/_design.util) — the room route
// must carry a real room NAME so the References chip's push into
// design/references/[room] lands on a slug areaForRoom can actually match
// (it matches human names like "kitchen", never a raw space UUID).
// Lives under src/ (NOT app/) — Expo Router treats every app/ file as a route.
import { groupSelections } from '../../app/(homeowner)/_design.util'
import type { DesignSelection } from '../api/types'

const sel = (overrides: Partial<DesignSelection> = {}): DesignSelection => ({
  id: `sel-${Math.random()}`,
  site_id: 'site-1',
  space_id: null,
  item: 'Flooring',
  choice: 'Oak',
  status: 'proposed',
  created_at: '2026-07-01T00:00:00Z',
  ...overrides,
})

describe('groupSelections', () => {
  const spaceNameById = { 'space-kitchen': 'Kitchen', 'space-bed': 'Master Bedroom' }

  it('resolves the room header to the real space name, not the UUID', () => {
    const groups = groupSelections(
      [sel({ space_id: 'space-kitchen' })],
      'Whole house',
      spaceNameById,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].spaceName).toBe('Kitchen')
  })

  it('uses the resolved NAME as the route slug so areaForRoom can bridge into the profiler', () => {
    const groups = groupSelections(
      [sel({ space_id: 'space-kitchen' })],
      'Whole house',
      spaceNameById,
    )
    expect(groups[0].roomSlug).toBe('Kitchen')
    expect(groups[0].roomSlug).not.toBe('space-kitchen')
  })

  it('groups whole-house selections (space_id null) under the wholeHouseLabel and "all" slug', () => {
    const groups = groupSelections([sel({ space_id: null })], 'Whole house', spaceNameById)
    expect(groups[0].spaceName).toBe('Whole house')
    expect(groups[0].roomSlug).toBe('all')
  })

  it('falls back to the raw space_id when the map has no name for it (never throws)', () => {
    const groups = groupSelections([sel({ space_id: 'unknown-id' })], 'Whole house', {})
    expect(groups[0].spaceName).toBe('unknown-id')
    expect(groups[0].roomSlug).toBe('unknown-id')
  })

  it('defaults the map to empty when omitted (backward compatible call)', () => {
    const groups = groupSelections([sel({ space_id: 'space-kitchen' })], 'Whole house')
    expect(groups[0].spaceName).toBe('space-kitchen')
  })

  it('groups multiple selections in the same space together', () => {
    const groups = groupSelections(
      [
        sel({ space_id: 'space-kitchen', item: 'Flooring' }),
        sel({ space_id: 'space-kitchen', item: 'Counters' }),
        sel({ space_id: 'space-bed', item: 'Paint' }),
      ],
      'Whole house',
      spaceNameById,
    )
    expect(groups).toHaveLength(2)
    const kitchen = groups.find((g) => g.spaceId === 'space-kitchen')!
    expect(kitchen.items).toHaveLength(2)
    expect(kitchen.spaceName).toBe('Kitchen')
  })
})
