import type { Me } from '../api/types'
import { en } from '../i18n/en'
import { hi } from '../i18n/hi'
import { consentTheme, needsAiConsent } from './consent.util'

const ME: Me = {
  id: 'u1',
  company_id: 'c1',
  name: 'Asha',
  phone: '+919800000003',
  role: 'supervisor',
  language: 'en',
}

describe('needsAiConsent', () => {
  it('asks a signed-in person who has not agreed (existing users included)', () => {
    expect(needsAiConsent('authed', { ...ME, ai_consent_at: null })).toBe(true)
    // A profile cached before the field existed has no value at all.
    expect(needsAiConsent('authed', ME)).toBe(true)
  })

  it('never asks again once agreed', () => {
    expect(needsAiConsent('authed', { ...ME, ai_consent_at: '2026-10-27T10:00:00Z' })).toBe(false)
  })

  it('does not ask before sign-in resolves or when signed out', () => {
    expect(needsAiConsent('loading', null)).toBe(false)
    expect(needsAiConsent('guest', null)).toBe(false)
  })
})

describe('consentTheme', () => {
  it('matches each role surface', () => {
    expect(consentTheme('owner')).toBe('daylight')
    expect(consentTheme('homeowner')).toBe('daylight')
    expect(consentTheme('supervisor')).toBe('daylight')
    expect(consentTheme('architect')).toBe('daylight')
    expect(consentTheme('pm')).toBe('neev')
    expect(consentTheme('accountant')).toBe('neev')
    expect(consentTheme('labor_contractor')).toBe('neev')
  })
})

describe('consent copy', () => {
  it('says plainly what is sent, to whom and why, in English and Hindi', () => {
    expect(en.consent.what).toMatch(/Photos.*voice notes.*chat messages.*invoices/)
    expect(en.consent.who).toMatch(/OpenAI.*Microsoft Azure OpenAI/)
    expect(en.consent.why).toMatch(/read, transcribe and summarise.*draft replies/)
    for (const k of Object.keys(en.consent) as (keyof typeof en.consent)[]) {
      expect(hi.consent[k]).toBeTruthy()
      expect(hi.consent[k]).not.toBe(en.consent[k])
    }
    expect(hi.consent.who).toMatch(/OpenAI.*Microsoft Azure OpenAI/)
  })
})
