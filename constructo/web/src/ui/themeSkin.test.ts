import { describe, it, expect } from 'vitest'
import { resolveDataTheme, skinForRole } from './themeSkin'

describe('resolveDataTheme', () => {
  it('blueprint passes the mode through', () => {
    expect(resolveDataTheme('blueprint', 'light')).toBe('light')
    expect(resolveDataTheme('blueprint', 'dark')).toBe('dark')
  })
  it('neev maps to the warm themes', () => {
    expect(resolveDataTheme('neev', 'light')).toBe('neev')
    expect(resolveDataTheme('neev', 'dark')).toBe('neev-dark')
  })
})

describe('skinForRole', () => {
  it('is neev for owner/supervisor/architect when enabled', () => {
    expect(skinForRole('owner', true)).toBe('neev')
    expect(skinForRole('supervisor', true)).toBe('neev')
    expect(skinForRole('architect', true)).toBe('neev')
  })
  it('is blueprint for those roles when the flag is off', () => {
    expect(skinForRole('owner', false)).toBe('blueprint')
    expect(skinForRole('supervisor', false)).toBe('blueprint')
  })
  it('is blueprint for other roles', () => {
    expect(skinForRole('pm', true)).toBe('blueprint')
    expect(skinForRole('accountant', true)).toBe('blueprint')
    expect(skinForRole(undefined, true)).toBe('blueprint')
  })
})
