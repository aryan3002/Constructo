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
})
