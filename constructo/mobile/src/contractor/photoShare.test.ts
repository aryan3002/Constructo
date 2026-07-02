import { defaultRoomFor } from './photoShare'

test('defaultRoomFor matches an AI hint to a site space (case-insensitive)', () => {
  expect(defaultRoomFor('Kitchen', ['Kitchen', 'Master Bedroom'])).toBe('Kitchen')
  expect(defaultRoomFor('kitchen', ['Kitchen', 'Master Bedroom'])).toBe('Kitchen')
})

test('defaultRoomFor returns undefined when no space matches (forces a one-tap choice)', () => {
  expect(defaultRoomFor('Staircase', ['Kitchen'])).toBeUndefined()
  expect(defaultRoomFor(null, ['Kitchen'])).toBeUndefined()
})
