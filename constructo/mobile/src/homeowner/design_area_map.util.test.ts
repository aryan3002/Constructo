// Tests for the room↔area bridge (src/homeowner/design_area_map.util).
// Lives under src/ (NOT app/) — Expo Router treats every app/ file as a route.
import { areaForRoom, roomLabelForArea } from './design_area_map.util'
import type { ProfilerArea } from '../api/client'

const area = (area_key: string, overrides: Partial<ProfilerArea> = {}): ProfilerArea =>
  ({
    id: `id-${area_key}`,
    area_kind: 'interior',
    area_key,
    recommended_count: 6,
    status: 'not_started',
    confidence: 0,
    has_conflict: false,
    reference_count: 0,
    my_ranked_count: 0,
    ...overrides,
  }) as ProfilerArea

describe('areaForRoom', () => {
  const areas = [area('master bedroom'), area('kitchen'), area('pooja'), area('living_room')]

  it('matches a hyphenated room slug against a space-separated area_key', () => {
    expect(areaForRoom('master-bedroom', areas)?.area_key).toBe('master bedroom')
  })

  it('matches an underscored room slug against a space-separated area_key', () => {
    expect(areaForRoom('living_room', areas)?.area_key).toBe('living_room')
  })

  it('matches case-insensitively (Hindi-safe short room names like Pooja)', () => {
    expect(areaForRoom('Pooja', areas)?.area_key).toBe('pooja')
  })

  it('matches trimmed / collapsed-space input', () => {
    expect(areaForRoom('  kitchen  ', areas)?.area_key).toBe('kitchen')
  })

  it('falls back to a startsWith match when no exact match exists', () => {
    const withLongKey = [area('kitchen_and_pantry')]
    expect(areaForRoom('kitchen', withLongKey)?.area_key).toBe('kitchen_and_pantry')
  })

  it('returns null when there is no match (custom/unknown room)', () => {
    expect(areaForRoom('garage', areas)).toBeNull()
  })

  it('returns null for "all" so the caller shows the whole-house hub', () => {
    expect(areaForRoom('all', areas)).toBeNull()
  })

  it('returns null when areas is empty', () => {
    expect(areaForRoom('kitchen', [])).toBeNull()
  })
})

describe('roomLabelForArea', () => {
  it('renders the area_key with underscores turned into spaces', () => {
    expect(roomLabelForArea(area('living_room'))).toBe('living room')
  })

  it('leaves an already space-separated area_key alone', () => {
    expect(roomLabelForArea(area('master bedroom'))).toBe('master bedroom')
  })
})
