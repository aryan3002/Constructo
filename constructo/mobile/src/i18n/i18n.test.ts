import { en } from './en'
import { hi } from './hi'

/** Recursively collect dotted key paths from a nested string bundle. */
function paths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k
    return typeof v === 'object' && v !== null
      ? paths(v as Record<string, unknown>, key)
      : [key]
  })
}

describe('i18n bundles', () => {
  it('hi mirrors en exactly (no missing or extra keys)', () => {
    expect(paths(hi)).toEqual(paths(en))
  })

  it('every leaf is a non-empty string', () => {
    for (const bundle of [en, hi]) {
      for (const p of paths(bundle)) {
        const value = p
          .split('.')
          .reduce<unknown>((a, k) => (a as Record<string, unknown>)[k], bundle)
        expect(typeof value).toBe('string')
        expect((value as string).length).toBeGreaterThan(0)
      }
    }
  })
})
