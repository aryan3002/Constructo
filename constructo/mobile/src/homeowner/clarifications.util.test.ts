import { clarCountLabel, openClarifications } from './clarifications.util'
import type { ProfilerClarification } from '../api/client'

function clar(overrides: Partial<ProfilerClarification>): ProfilerClarification {
  return {
    id: 'c1',
    area_id: 'a1',
    question: 'What tone of wood for the flooring?',
    answer: null,
    asked_at: '2026-07-01T00:00:00Z',
    answered_at: null,
    ...overrides,
  }
}

describe('openClarifications', () => {
  it('keeps only rows with answer == null', () => {
    const rows = [
      clar({ id: 'c1', answer: null, asked_at: '2026-07-01T00:00:00Z' }),
      clar({ id: 'c2', answer: 'Warm oak', answered_at: '2026-07-02T00:00:00Z' }),
      clar({ id: 'c3', answer: null, asked_at: '2026-07-03T00:00:00Z' }),
    ]
    const open = openClarifications(rows)
    expect(open.map((r) => r.id)).toEqual(['c3', 'c1'])
  })

  it('sorts newest-first by asked_at', () => {
    const rows = [
      clar({ id: 'old', answer: null, asked_at: '2026-06-01T00:00:00Z' }),
      clar({ id: 'new', answer: null, asked_at: '2026-07-01T00:00:00Z' }),
      clar({ id: 'mid', answer: null, asked_at: '2026-06-15T00:00:00Z' }),
    ]
    const open = openClarifications(rows)
    expect(open.map((r) => r.id)).toEqual(['new', 'mid', 'old'])
  })

  it('returns empty array when no rows or all answered', () => {
    expect(openClarifications([])).toEqual([])
    expect(
      openClarifications([clar({ id: 'c1', answer: 'Done', answered_at: '2026-07-01T00:00:00Z' })]),
    ).toEqual([])
  })

  it('does not mutate the input array', () => {
    const rows = [
      clar({ id: 'a', answer: null, asked_at: '2026-06-01T00:00:00Z' }),
      clar({ id: 'b', answer: null, asked_at: '2026-07-01T00:00:00Z' }),
    ]
    const copy = [...rows]
    openClarifications(rows)
    expect(rows).toEqual(copy)
  })
})

describe('clarCountLabel', () => {
  it('EN singular for n=1', () => {
    expect(clarCountLabel(1, 'en')).toBe('1 question for you')
  })

  it('EN plural for n>1', () => {
    expect(clarCountLabel(2, 'en')).toBe('2 questions for you')
    expect(clarCountLabel(5, 'en')).toBe('5 questions for you')
  })

  it('HI singular for n=1', () => {
    expect(clarCountLabel(1, 'hi')).toBe('आपके लिए 1 सवाल')
  })

  it('HI plural for n>1', () => {
    expect(clarCountLabel(2, 'hi')).toBe('आपके लिए 2 सवाल')
  })

  it('defaults to en when lang omitted', () => {
    expect(clarCountLabel(3)).toBe('3 questions for you')
  })

  it('n=0 still returns a grammatically valid EN/HI string', () => {
    expect(clarCountLabel(0, 'en')).toBe('0 questions for you')
    expect(clarCountLabel(0, 'hi')).toBe('आपके लिए 0 सवाल')
  })
})
