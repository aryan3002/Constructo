import { decidedAttribution, themeDecisionTone, THEME_DECISION_STR } from './theme_decisions.util'

describe('themeDecisionTone', () => {
  test('maps approved -> ok, adjusted -> warn, rejected -> quiet', () => {
    expect(themeDecisionTone('approved')).toBe('ok')
    expect(themeDecisionTone('adjusted')).toBe('warn')
    expect(themeDecisionTone('rejected')).toBe('quiet')
  })

  test('falls back to "quiet" for an unrecognised/suggested status', () => {
    expect(themeDecisionTone('suggested')).toBe('quiet')
    expect(themeDecisionTone('anything-else')).toBe('quiet')
  })
})

describe('decidedAttribution', () => {
  test('"Decided by you" when decided_by matches the caller', () => {
    expect(decidedAttribution('user-1', 'user-1')).toBe('Decided by you')
  })

  test('omits (null) when decided_by does not match the caller', () => {
    expect(decidedAttribution('user-2', 'user-1')).toBeNull()
  })

  test('omits (null) when decided_by is null (not yet decided) or caller id unknown', () => {
    expect(decidedAttribution(null, 'user-1')).toBeNull()
    expect(decidedAttribution('user-1', null)).toBeNull()
    expect(decidedAttribution('user-1', undefined)).toBeNull()
  })
})

describe('THEME_DECISION_STR', () => {
  test('has the three action button labels + toasts + read-only copy', () => {
    expect(THEME_DECISION_STR.en.approve).toBe('Love it')
    expect(THEME_DECISION_STR.en.adjust).toBe('Close, adjust')
    expect(THEME_DECISION_STR.en.reject).toBe('Not this one')
    expect(THEME_DECISION_STR.en.decidedToast).toMatch(/shapes your brief/)
  })
})
