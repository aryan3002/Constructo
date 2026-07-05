import { briefStateCard } from './brief_state.util'

describe('briefStateCard', () => {
  it('homeowner_review: names the homeowner as next actor, tone ok, cta view_brief', () => {
    const card = briefStateCard('homeowner_review', {})
    expect(card).not.toBeNull()
    expect(card!.title).toBe('Your brief is ready — review and send it')
    expect(card!.tone).toBe('ok')
    expect(card!.cta).toBe('view_brief')
    expect(card!.titleHi).toBeTruthy()
    expect(card!.body).toBeTruthy()
    expect(card!.bodyHi).toBeTruthy()
  })

  it('architect_review: names the designer as next actor, includes sinceLabel when given', () => {
    const noSince = briefStateCard('architect_review', {})
    expect(noSince!.title).toBe('With your designer')
    expect(noSince!.tone).toBe('info')

    const withSince = briefStateCard('architect_review', { sinceLabel: ' · since 3 Jul' })
    expect(withSince!.title).toBe('With your designer · since 3 Jul')
  })

  it('revision_requested: surfaces the note + cta regenerate, tone warn', () => {
    const card = briefStateCard('revision_requested', { note: 'Kitchen palette needs rework' })
    expect(card!.title).toBe('Changes asked: Kitchen palette needs rework')
    expect(card!.tone).toBe('warn')
    expect(card!.cta).toBe('regenerate')
  })

  it('revision_requested: falls back to honest copy when no note given', () => {
    const card = briefStateCard('revision_requested', {})
    expect(card!.title).toBe('Changes asked')
    expect(card!.cta).toBe('regenerate')
  })

  it('contractor_brief_ready: names the homeowner approval as unlocking pricing', () => {
    const card = briefStateCard('contractor_brief_ready', {})
    expect(card!.title).toBe('Designer signed off — your approval unlocks pricing')
    expect(card!.tone).toBe('ok')
    expect(card!.cta).toBe('view_brief')
  })

  it('approved: names the contractor as next actor, quiet tone', () => {
    const card = briefStateCard('approved', {})
    expect(card!.title).toBe('Being priced by your contractor')
    expect(card!.tone).toBe('quiet')
    expect(card!.cta).toBeUndefined()
  })

  it('locked: names materials finalisation, quiet tone', () => {
    const card = briefStateCard('locked', {})
    expect(card!.title).toBe('Locked in — materials are being finalised')
    expect(card!.tone).toBe('quiet')
    expect(card!.cta).toBeUndefined()
  })

  it('unknown or empty state returns null (forward-compat, no banner)', () => {
    expect(briefStateCard('', {})).toBeNull()
    expect(briefStateCard('some_future_state', {})).toBeNull()
    expect(briefStateCard('draft', {})).toBeNull()
  })

  it('every known state has non-empty EN + HI title/body', () => {
    const states = [
      'homeowner_review',
      'architect_review',
      'revision_requested',
      'contractor_brief_ready',
      'approved',
      'locked',
    ]
    for (const s of states) {
      const card = briefStateCard(s, {})
      expect(card).not.toBeNull()
      expect(card!.title.length).toBeGreaterThan(0)
      expect(card!.titleHi.length).toBeGreaterThan(0)
      expect(card!.body.length).toBeGreaterThan(0)
      expect(card!.bodyHi.length).toBeGreaterThan(0)
      expect(['ok', 'info', 'warn', 'quiet']).toContain(card!.tone)
    }
  })
})
