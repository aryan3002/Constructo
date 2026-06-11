/** Tick glyph mapping: sent=✓, delivered/read=✓✓, with read visually distinct. */
import { tickGlyph, isReadTick } from '../tick'

test('sent → single check', () => {
  expect(tickGlyph('sent')).toBe('✓')
})

test('delivered and read → double check', () => {
  expect(tickGlyph('delivered')).toBe('✓✓')
  expect(tickGlyph('read')).toBe('✓✓')
})

test('undefined (not own / no cursors) → no glyph', () => {
  expect(tickGlyph(undefined)).toBe('')
})

test('isReadTick only true for read (drives the highlight colour)', () => {
  expect(isReadTick('read')).toBe(true)
  expect(isReadTick('delivered')).toBe(false)
  expect(isReadTick('sent')).toBe(false)
  expect(isReadTick(undefined)).toBe(false)
})
