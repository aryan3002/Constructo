import { describe, it, expect } from 'vitest'
import { en } from './en'
import { hi } from './hi'

const REQUIRED = [
  'projects.new.title',
  'projects.new.name_label',
  'projects.new.name_placeholder',
  'projects.new.type_label',
  'projects.new.location_label',
  'projects.new.location_placeholder',
  'projects.new.location_hint',
  'projects.new.submit',
  'projects.new.cancel',
  'projects.new.name_required',
  'projects.new.error',
  'projects.new.cta',
  'projects.strip.title',
  'projects.strip.people',
  'projects.strip.no_activity',
  'owner.setup.add_project_cta',
] as const

describe('projects i18n keys', () => {
  it('every projects key is present in en with a non-empty string', () => {
    for (const k of REQUIRED) {
      expect(en[k], `missing en[${k}]`).toBeTruthy()
    }
  })
  it('every projects key is present in hi (no English fallback gaps)', () => {
    for (const k of REQUIRED) {
      expect(hi[k], `missing hi[${k}]`).toBeTruthy()
    }
  })
  it('people copy interpolates {count}', () => {
    expect(en['projects.strip.people']).toContain('{count}')
  })
})
