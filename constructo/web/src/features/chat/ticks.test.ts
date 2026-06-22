import { describe, it, expect } from 'vitest'
import { computeDeliveryState } from './ticks'
const me = 'me'
const others = (d: number, r: number) => [
  { user_id: 'me', last_delivered_seq: 99, last_read_seq: 99 },
  { user_id: 'a', last_delivered_seq: d, last_read_seq: r },
]
describe('computeDeliveryState', () => {
  it('read when every other has read >= seq', () => {
    expect(computeDeliveryState(5, others(9, 9), me)).toBe('read')
  })
  it('delivered when every other delivered >= seq but not read', () => {
    expect(computeDeliveryState(5, others(9, 2), me)).toBe('delivered')
  })
  it('sent when an other is behind on delivered', () => {
    expect(computeDeliveryState(5, others(2, 0), me)).toBe('sent')
  })
  it('sent when no other cursors (solo)', () => {
    expect(computeDeliveryState(5, [{ user_id: 'me', last_delivered_seq: 9, last_read_seq: 9 }], me)).toBe('sent')
  })
})
