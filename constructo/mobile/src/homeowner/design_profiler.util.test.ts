import {
  areaProgressLabel,
  areaTabForParam,
  briefAudienceTabs,
  confidenceBand,
  designChatDraft,
  designChatRoute,
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

describe('areaTabForParam', () => {
  it('opens AI Notes for the "notes" deep-link (DPHub "Questions for you")', () => {
    expect(areaTabForParam('notes')).toBe('AI Notes')
  })

  it('opens Ranking for the "ranking" deep-link ("Rank these" from References)', () => {
    expect(areaTabForParam('ranking')).toBe('Ranking')
  })

  it('falls back to Inspiration for an absent param', () => {
    expect(areaTabForParam(undefined)).toBe('Inspiration')
  })

  it('falls back to Inspiration for an unknown param (never crashes into a blank segment)', () => {
    expect(areaTabForParam('brief')).toBe('Inspiration')
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

describe('designChatDraft', () => {
  it('opens with the area label when one is given (en)', () => {
    expect(designChatDraft({ areaLabel: 'Kitchen' })).toBe('About our Kitchen design: ')
  })

  it('opens with the brief version when one is given (en)', () => {
    expect(designChatDraft({ briefVersion: 3 })).toBe('About our design brief v3: ')
  })

  it('prefers the area label over the brief version when both are given', () => {
    expect(designChatDraft({ areaLabel: 'Kitchen', briefVersion: 3 })).toBe(
      'About our Kitchen design: ',
    )
  })

  it('falls back to a plain opener when neither is given', () => {
    expect(designChatDraft({})).toBe('About our design: ')
  })

  it('translates to Hindi', () => {
    expect(designChatDraft({ areaLabel: 'रसोई' }, 'hi')).toBe('हमारी रसोई डिज़ाइन के बारे में: ')
    expect(designChatDraft({ briefVersion: 2 }, 'hi')).toBe('हमारे डिज़ाइन ब्रीफ़ v2 के बारे में: ')
    expect(designChatDraft({}, 'hi')).toBe('हमारे डिज़ाइन के बारे में: ')
  })
})

describe('designChatRoute', () => {
  it('builds the same params shape the inbox uses, plus a draft', () => {
    const route = designChatRoute(
      { id: 'conv-1', title: null, site_name: 'Tripathi Home' },
      'About our Kitchen design: ',
    )
    expect(route).toEqual({
      pathname: '/(homeowner)/messages/[id]',
      params: {
        id: 'conv-1',
        kind: 'homeowner',
        title: '',
        siteName: 'Tripathi Home',
        draft: 'About our Kitchen design: ',
      },
    })
  })
})
