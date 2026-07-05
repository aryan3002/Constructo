import { splitClarifications } from './clarifications.util'
import type { ProfilerClarification } from '../api/client'

const row = (over: Partial<ProfilerClarification>): ProfilerClarification => ({
  id: 'c1',
  area_id: null,
  question: 'What tile finish for the kitchen?',
  answer: null,
  asked_at: '2026-07-01T00:00:00Z',
  answered_at: null,
  ...over,
})

test('splits answered vs waiting by answer != null', () => {
  const rows = [
    row({ id: 'a', answer: 'Matte', answered_at: '2026-07-02T00:00:00Z' }),
    row({ id: 'b', answer: null }),
  ]
  const { answered, waiting } = splitClarifications(rows)
  expect(answered.map((r) => r.id)).toEqual(['a'])
  expect(waiting.map((r) => r.id)).toEqual(['b'])
})

test('both lists are newest-first by asked_at', () => {
  const rows = [
    row({ id: 'old', asked_at: '2026-07-01T00:00:00Z', answer: 'x' }),
    row({ id: 'new', asked_at: '2026-07-03T00:00:00Z', answer: 'y' }),
    row({ id: 'mid', asked_at: '2026-07-02T00:00:00Z', answer: 'z' }),
  ]
  const { answered } = splitClarifications(rows)
  expect(answered.map((r) => r.id)).toEqual(['new', 'mid', 'old'])
})

test('waiting rows sorted newest-first too', () => {
  const rows = [
    row({ id: 'w-old', asked_at: '2026-06-01T00:00:00Z' }),
    row({ id: 'w-new', asked_at: '2026-06-05T00:00:00Z' }),
  ]
  const { waiting } = splitClarifications(rows)
  expect(waiting.map((r) => r.id)).toEqual(['w-new', 'w-old'])
})

test('empty input yields empty lists', () => {
  expect(splitClarifications([])).toEqual({ answered: [], waiting: [] })
})
