import { en } from '../i18n/en'
import { hi } from '../i18n/hi'
import { legalLinks } from './legal.util'

describe('legalLinks', () => {
  it('lists the privacy policy then the terms', () => {
    const links = legalLinks({ privacyUrl: 'https://neev.example/privacy', termsUrl: 'https://neev.example/terms' })
    expect(links.map((l) => [l.key, l.url])).toEqual([
      ['privacy', 'https://neev.example/privacy'],
      ['terms', 'https://neev.example/terms'],
    ])
  })

  it('leaves out an unconfigured or non-web URL', () => {
    expect(legalLinks({ privacyUrl: '', termsUrl: 'https://neev.example/terms' }).map((l) => l.key)).toEqual([
      'terms',
    ])
    expect(legalLinks({ privacyUrl: 'javascript:alert(1)', termsUrl: '' })).toEqual([])
  })

  it('has an English and a Hindi label for each link', () => {
    for (const l of legalLinks({ privacyUrl: 'https://a.example/', termsUrl: 'https://b.example/' })) {
      const key = l.labelKey.split('.')[1] as 'privacy' | 'terms'
      expect(en.legal[key]).toBeTruthy()
      expect(hi.legal[key]).toBeTruthy()
      expect(hi.legal[key]).not.toBe(en.legal[key])
    }
  })
})
