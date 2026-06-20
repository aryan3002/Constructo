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
  it('is neev only for an owner when the flag is enabled', () => {
    expect(skinForRole('owner', true)).toBe('neev')
  })
  it('is blueprint for owner when the flag is off', () => {
    expect(skinForRole('owner', false)).toBe('blueprint')
  })
  it('is blueprint for any non-owner role', () => {
    expect(skinForRole('pm', true)).toBe('blueprint')
    expect(skinForRole('accountant', true)).toBe('blueprint')
  })
  it('is blueprint while the role is still loading', () => {
    expect(skinForRole(undefined, true)).toBe('blueprint')
  })
})
