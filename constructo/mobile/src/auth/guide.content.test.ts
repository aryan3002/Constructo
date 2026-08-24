import { ROLE_LABEL, guideSections, roleTour } from './guide.content'

const ROLES = [
  'owner',
  'pm',
  'supervisor',
  'accountant',
  'labor_contractor',
  'architect',
  'procurement',
  'homeowner',
] as const

describe('guideSections', () => {
  it.each(['en', 'hi'] as const)('%s: six sections in reading order, none empty', (lang) => {
    const sections = guideSections(lang, { dev: false })
    expect(sections.map((s) => s.id)).toEqual([
      'doors',
      'joinCode',
      'otp',
      'roles',
      'notEnabled',
      'privacy',
    ])
    for (const s of sections) {
      expect(s.title.trim()).not.toBe('')
      expect(s.icon).toBeTruthy()
      expect(s.body.length).toBeGreaterThan(0)
      for (const line of s.body) expect(line.trim()).not.toBe('')
    }
  })

  it('en and hi carry the same number of lines per section', () => {
    const en = guideSections('en', { dev: false })
    const hi = guideSections('hi', { dev: false })
    en.forEach((s, i) => expect(hi[i].body).toHaveLength(s.body.length))
  })

  it('mentions the dev OTP only in dev builds', () => {
    const otp = (dev: boolean) =>
      guideSections('en', { dev }).find((s) => s.id === 'otp')!.body.join(' ')
    expect(otp(true)).toContain('000000')
    expect(otp(false)).not.toContain('000000')
  })

  it('the roles section names every seat', () => {
    const text = guideSections('en', { dev: false }).find((s) => s.id === 'roles')!.body.join(' ')
    for (const name of ['Owner', 'PM', 'Supervisor', 'Accountant', 'Mukadam', 'Architect', 'Homeowner']) {
      expect(text).toContain(name)
    }
  })
})

describe('roleTour', () => {
  it.each(ROLES)('%s has a tour in both languages with no empty rows', (role) => {
    for (const lang of ['en', 'hi'] as const) {
      const rows = roleTour(role, lang)
      expect(rows.length).toBeGreaterThanOrEqual(3)
      for (const r of rows) {
        expect(r.icon).toBeTruthy()
        expect(r.title.trim()).not.toBe('')
        expect(r.body.trim()).not.toBe('')
      }
    }
    expect(roleTour(role, 'en')).toHaveLength(roleTour(role, 'hi').length)
  })

  it('matches the real tab bars (first tab = the home route)', () => {
    expect(roleTour('owner', 'en')[0].title).toBe('Brief')
    expect(roleTour('supervisor', 'en')[0].title).toBe('Home')
    expect(roleTour('pm', 'en')[0].title).toBe('DPR')
    expect(roleTour('accountant', 'en')[0].title).toBe('Reconcile')
    expect(roleTour('labor_contractor', 'en')[0].title).toBe('Attendance')
    expect(roleTour('architect', 'en')[0].title).toBe('Home')
    expect(roleTour('homeowner', 'en').map((r) => r.title)).toEqual([
      'Home',
      'Photos',
      'Updates',
      'Messages',
      'Design',
      'Ask',
    ])
  })

  it('has a label for every role in both languages', () => {
    for (const role of ROLES) {
      expect(ROLE_LABEL[role].en.trim()).not.toBe('')
      expect(ROLE_LABEL[role].hi.trim()).not.toBe('')
    }
  })
})
