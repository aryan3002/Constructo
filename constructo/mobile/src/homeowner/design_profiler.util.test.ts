import {
  areaProgressLabel,
  briefAudienceTabs,
  confidenceBand,
  groupAreasByKind,
  PROFILER_STR,
} from './design_profiler.util'

describe('confidenceBand', () => {
  it('maps a reducer confidence to a calm band (status + word + icon)', () => {
    expect(confidenceBand(0.9)).toEqual({ band: 'high', tone: 'ok', label: 'High', icon: 'check-circle' })
    expect(confidenceBand(0.5)).toEqual({ band: 'building', tone: 'warn', label: 'Building', icon: 'clock' })
    expect(confidenceBand(0.1)).toEqual({ band: 'low', tone: 'quiet', label: 'Low', icon: 'circle' })
  })
})

describe('areaProgressLabel', () => {
  it('reads as time/shape progress, never a %', () => {
    expect(areaProgressLabel(2, 6)).toBe('2 of 6 ranked')
    expect(areaProgressLabel(0, 0)).toBe('Not started')
  })
})

describe('groupAreasByKind', () => {
  it('buckets areas into house build / interior / elements in a stable order', () => {
    const areas = [
      { id: 'a', area_kind: 'interior', area_key: 'kitchen' },
      { id: 'b', area_kind: 'house_build', area_key: 'facade' },
      { id: 'c', area_kind: 'element', area_key: 'main_door' },
    ] as never[]
    const groups = groupAreasByKind(areas)
    expect(groups.map((g) => g.kind)).toEqual(['house_build', 'interior', 'element'])
    expect(groups[1].areas).toHaveLength(1)
  })
})

describe('briefAudienceTabs', () => {
  it('labels the 3 audiences in the homeowner voice', () => {
    expect(briefAudienceTabs('en').map((t) => t.key)).toEqual(['homeowner', 'architect', 'contractor'])
    expect(briefAudienceTabs('en')[0].label).toBe('You')
  })
})

test('PROFILER_STR has en + hi', () => {
  expect(PROFILER_STR.en.intakeTitle).toBeTruthy()
  expect(PROFILER_STR.hi.intakeTitle).toBeTruthy()
})
