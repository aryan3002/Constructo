/**
 * Page-draining for the chat thread sync. The server caps each /chat/messages
 * response at a page size (MAX_LIMIT=200), so a large thread must be fetched in
 * several pages. Previously the client fetched ONE page per 8s poll, so a 1000-
 * message seeded thread took ~(N/pageSize)×8s (1-2 min) to fill in. drainPages
 * loops the pages back-to-back in a single sync so the whole thread loads at once.
 *
 * Pure (no React, no network): the caller injects `fetchPage`. Unit-tested.
 */
import type { ChatMessage } from '../api/chat'

/**
 * Fetch pages starting after `startAfter` until a page returns fewer than
 * `pageSize` rows (the last page) or is empty. Accumulates and returns every row.
 * `maxPages` is a safety cap so a misbehaving server can't spin forever.
 */
export async function drainPages(
  fetchPage: (afterSeq: number) => Promise<ChatMessage[]>,
  startAfter: number,
  pageSize: number,
  maxPages = 40,
): Promise<ChatMessage[]> {
  const all: ChatMessage[] = []
  let cursor = startAfter
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(cursor)
    if (page.length === 0) break
    all.push(...page)
    cursor = page[page.length - 1].seq
    if (page.length < pageSize) break
  }
  return all
}
