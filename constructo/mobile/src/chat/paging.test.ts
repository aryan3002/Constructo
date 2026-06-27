import { drainPages } from './paging'
import type { ChatMessage } from '../api/chat'

// Minimal fake — drainPages only reads page length and the last item's seq.
const msg = (seq: number): ChatMessage => ({ seq }) as unknown as ChatMessage
const pageOf = (from: number, count: number): ChatMessage[] =>
  Array.from({ length: count }, (_, i) => msg(from + i))

describe('drainPages', () => {
  it('loops pages until a short (< pageSize) page, accumulating all rows', async () => {
    // 250 messages total, pageSize 100 → pages of 100, 100, 50.
    const fetchPage = jest.fn(async (after: number) => {
      const remaining = 250 - after
      if (remaining <= 0) return []
      return pageOf(after + 1, Math.min(100, remaining))
    })
    const all = await drainPages(fetchPage, 0, 100)
    expect(all).toHaveLength(250)
    expect(all[0].seq).toBe(1)
    expect(all[all.length - 1].seq).toBe(250)
    expect(fetchPage).toHaveBeenCalledTimes(3) // 100,100,50 → stops on the short page
  })

  it('stops immediately on an empty first page (no new messages on a poll)', async () => {
    const fetchPage = jest.fn(async () => [] as ChatMessage[])
    const all = await drainPages(fetchPage, 500, 200)
    expect(all).toEqual([])
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('advances the cursor by the last seq of each page', async () => {
    const seen: number[] = []
    const fetchPage = jest.fn(async (after: number) => {
      seen.push(after)
      return after < 400 ? pageOf(after + 1, 200) : []
    })
    await drainPages(fetchPage, 0, 200)
    expect(seen).toEqual([0, 200, 400]) // cursor follows page[last].seq
  })

  it('respects the maxPages safety cap', async () => {
    const fetchPage = jest.fn(async (after: number) => pageOf(after + 1, 200)) // never short
    const all = await drainPages(fetchPage, 0, 200, 3)
    expect(fetchPage).toHaveBeenCalledTimes(3)
    expect(all).toHaveLength(600)
  })
})
