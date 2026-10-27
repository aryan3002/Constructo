import { DEV_API_BASE, DEV_PRIVACY_URL, DEV_TERMS_URL, resolveConfig } from './config.util'

const FULL = {
  apiBase: 'https://api.neev.build/',
  webBase: 'https://constructo-topaz.vercel.app',
  privacyUrl: 'https://neev.build/privacy',
  termsUrl: 'https://neev.build/terms',
}

describe('resolveConfig', () => {
  it('a fully configured release build starts', () => {
    const c = resolveConfig(FULL, false)
    expect(c.missing).toEqual([])
    expect(c.apiBase).toBe('https://api.neev.build')
    expect(c.webBase).toBe('https://constructo-topaz.vercel.app')
    expect(c.privacyUrl).toBe('https://neev.build/privacy')
    expect(c.termsUrl).toBe('https://neev.build/terms')
  })

  it('a release build without the API base refuses, and never uses the dev address', () => {
    const c = resolveConfig({ ...FULL, apiBase: undefined }, false)
    expect(c.missing).toEqual(['EXPO_PUBLIC_API_BASE'])
    expect(c.apiBase).toBe('')
    expect(c.apiBase).not.toBe(DEV_API_BASE)
  })

  it('names every missing setting, blank counting as missing', () => {
    expect(resolveConfig({ apiBase: '  ', webBase: FULL.webBase }, false).missing).toEqual([
      'EXPO_PUBLIC_API_BASE',
      'EXPO_PUBLIC_PRIVACY_URL',
      'EXPO_PUBLIC_TERMS_URL',
    ])
    expect(resolveConfig({ ...FULL, termsUrl: '' }, false).missing).toEqual([
      'EXPO_PUBLIC_TERMS_URL',
    ])
  })

  it('development keeps its fallbacks and never blocks', () => {
    const c = resolveConfig({}, true)
    expect(c.missing).toEqual([])
    expect(c.apiBase).toBe(DEV_API_BASE)
    expect(c.webBase).toBe(DEV_API_BASE)
    expect(c.privacyUrl).toBe(DEV_PRIVACY_URL)
    expect(c.termsUrl).toBe(DEV_TERMS_URL)
    expect(c.privacyUrl).toMatch(/\.invalid\//)
  })

  it('web links fall back to the API host when WEB_BASE is unset', () => {
    expect(resolveConfig({ ...FULL, webBase: undefined }, false).webBase).toBe('https://api.neev.build')
  })
})
