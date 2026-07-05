/**
 * brief_diff.util tests — pure set-diff of material_families per area between
 * two brief renderings' content_json.areas arrays.
 */
import { briefDiff, type BriefDiffArea } from './brief_diff.util'

function area(area_key: string, material_families: string[]): BriefDiffArea {
  return { area_key, material_families }
}

describe('briefDiff', () => {
  it('returns [] when prev is null (first brief has no "since you last looked")', () => {
    const curr = [area('kitchen', ['oak'])]
    expect(briefDiff(null, curr)).toEqual([])
  })

  it('detects an added material family within an existing area', () => {
    const prev = [area('kitchen', ['oak'])]
    const curr = [area('kitchen', ['oak', 'quartz'])]
    expect(briefDiff(prev, curr)).toEqual([
      { area_key: 'kitchen', added: ['quartz'], removed: [] },
    ])
  })

  it('detects a removed material family', () => {
    const prev = [area('kitchen', ['oak', 'quartz'])]
    const curr = [area('kitchen', ['oak'])]
    expect(briefDiff(prev, curr)).toEqual([
      { area_key: 'kitchen', added: [], removed: ['quartz'] },
    ])
  })

  it('treats an area present only in curr as all-added', () => {
    const prev = [area('kitchen', ['oak'])]
    const curr = [area('kitchen', ['oak']), area('bathroom', ['tile', 'chrome'])]
    expect(briefDiff(prev, curr)).toEqual([
      { area_key: 'bathroom', added: ['tile', 'chrome'], removed: [] },
    ])
  })

  it('treats an area present only in prev as all-removed', () => {
    const prev = [area('kitchen', ['oak']), area('bathroom', ['tile'])]
    const curr = [area('kitchen', ['oak'])]
    expect(briefDiff(prev, curr)).toEqual([
      { area_key: 'bathroom', added: [], removed: ['tile'] },
    ])
  })

  it('omits areas with no change', () => {
    const prev = [area('kitchen', ['oak']), area('bathroom', ['tile'])]
    const curr = [area('kitchen', ['oak']), area('bathroom', ['tile'])]
    expect(briefDiff(prev, curr)).toEqual([])
  })

  it('returns [] when both are empty', () => {
    expect(briefDiff([], [])).toEqual([])
  })

  it('handles areas missing material_families as empty sets', () => {
    const prev = [{ area_key: 'kitchen', material_families: undefined as unknown as string[] }]
    const curr = [area('kitchen', ['oak'])]
    expect(briefDiff(prev, curr)).toEqual([
      { area_key: 'kitchen', added: ['oak'], removed: [] },
    ])
  })
})
