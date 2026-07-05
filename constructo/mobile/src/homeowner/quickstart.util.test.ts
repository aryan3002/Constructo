import { pickQuickstartPresets, QUICKSTART_STR } from './quickstart.util'
import type { DesignPreset } from '../api/client'

function preset(pack: string, title: string, i: number): DesignPreset {
  return {
    id: `${pack}-${i}`,
    area_kind: 'interior',
    area_key: 'living_room',
    pack,
    title,
    image_url: null,
  }
}

describe('pickQuickstartPresets', () => {
  test('interleaves round-robin across packs alphabetically, preserving each pack catalog order', () => {
    // 3 packs x 4 items each = 12 total; first 10 picked should alternate
    // packs A, B, C (alphabetical) in round-robin, each pack's own order intact.
    const packA = [0, 1, 2, 3].map((i) => preset('Aegean', `A${i}`, i))
    const packB = [0, 1, 2, 3].map((i) => preset('Bengal', `B${i}`, i))
    const packC = [0, 1, 2, 3].map((i) => preset('Coastal', `C${i}`, i))
    // Shuffle input order to prove the function sorts packs itself, not relying
    // on input ordering.
    const presets = [...packB, ...packC, ...packA]

    const result = pickQuickstartPresets(presets, 10)

    expect(result.map((p) => p.title)).toEqual([
      'A0', 'B0', 'C0',
      'A1', 'B1', 'C1',
      'A2', 'B2', 'C2',
      'A3',
    ])
  })

  test('is deterministic — repeated calls on the same input return the same order', () => {
    const packA = [0, 1, 2].map((i) => preset('Aegean', `A${i}`, i))
    const packB = [0, 1, 2].map((i) => preset('Bengal', `B${i}`, i))
    const presets = [...packA, ...packB]

    const first = pickQuickstartPresets(presets, 10)
    const second = pickQuickstartPresets(presets, 10)

    expect(first.map((p) => p.id)).toEqual(second.map((p) => p.id))
  })

  test('fewer than n available returns all of them, still pack-interleaved', () => {
    const packA = [0, 1].map((i) => preset('Aegean', `A${i}`, i))
    const packB = [0].map((i) => preset('Bengal', `B${i}`, i))
    const presets = [...packA, ...packB]

    const result = pickQuickstartPresets(presets, 10)

    expect(result).toHaveLength(3)
    expect(result.map((p) => p.title)).toEqual(['A0', 'B0', 'A1'])
  })

  test('defaults n to 10 when omitted', () => {
    const packA = Array.from({ length: 12 }, (_, i) => preset('Aegean', `A${i}`, i))
    const result = pickQuickstartPresets(packA)
    expect(result).toHaveLength(10)
  })

  test('empty input returns empty array', () => {
    expect(pickQuickstartPresets([], 10)).toEqual([])
  })

  test('single pack just takes the first n in catalog order', () => {
    const packA = Array.from({ length: 5 }, (_, i) => preset('Aegean', `A${i}`, i))
    const result = pickQuickstartPresets(packA, 3)
    expect(result.map((p) => p.title)).toEqual(['A0', 'A1', 'A2'])
  })
})

describe('QUICKSTART_STR', () => {
  test('has EN + HI strings', () => {
    expect(QUICKSTART_STR.en.entryTitle).toBeTruthy()
    expect(QUICKSTART_STR.hi.entryTitle).toBeTruthy()
  })

  test('non-contributor notice exists in both languages and matches the [area].tsx copy', () => {
    expect(QUICKSTART_STR.en.readOnlyNotice).toBe(
      'Only members of this home can rank references.',
    )
    expect(QUICKSTART_STR.hi.readOnlyNotice).toBeTruthy()
  })
})
