import { describe, it, expect } from 'vitest'
import { mergeMessages } from './threadMerge'

const m = (seq: number, body: string) => ({ seq, body, id: String(seq) } as never)

describe('mergeMessages', () => {
  it('dedupes by seq, newer wins, sorted asc', () => {
    const out = mergeMessages([m(1,'a'), m(2,'b')], [m(2,'B'), m(3,'c')])
    expect(out.map((x: any) => [x.seq, x.body])).toEqual([[1,'a'],[2,'B'],[3,'c']])
  })
  it('caps to the last max', () => {
    const a = [m(1,'a'), m(2,'b'), m(3,'c')]
    expect(mergeMessages(a, [], 2).map((x: any) => x.seq)).toEqual([2,3])
  })

  // B7 — a merge-aware cap keeps loaded history instead of discarding it
  it('keeps everything when max grows with the merge (loadOlder path)', () => {
    const existing = Array.from({ length: 200 }, (_, i) => m(i + 1, 'e'))
    const older = Array.from({ length: 50 }, (_, i) => m(-(i + 1), 'o')) // older seqs sort first
    const out = mergeMessages(existing, older, existing.length + older.length)
    expect(out.length).toBe(250)
    expect(out[0].seq).toBe(-50)
    expect(out[out.length - 1].seq).toBe(200)
  })

  it('still trims from the oldest end on the append/socket path', () => {
    const existing = Array.from({ length: 200 }, (_, i) => m(i + 1, 'e'))
    // Default cap (200): appending a new row evicts the oldest one.
    const out = mergeMessages(existing, [m(201, 'new')])
    expect(out.length).toBe(200)
    expect(out[0].seq).toBe(2)
    expect(out[out.length - 1].seq).toBe(201)
  })
})
