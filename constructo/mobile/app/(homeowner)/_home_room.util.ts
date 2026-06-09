/**
 * Helpers local to the Home Room thread (app/(homeowner)/messages/[id].tsx).
 * Pure functions + strings only — no React, no shared-file edits.
 *
 * The Home Room makes her builder thread "the product": her chat bubbles are
 * woven together with the published Updates and the pending Decisions she would
 * otherwise only meet on Home/Updates, as on-brand cards she can act on in place.
 * `mergeHomeRoom` zips the three timelines into one chronological feed; the screen
 * renders each item by `kind`. This curated weave applies ONLY to her private
 * builder channel (kind=homeowner) — a group thread has no single site to source
 * updates/decisions from, so it stays plain bubbles.
 */
import type { ChatMessage } from '../../src/api/chat'
import type { HomeownerDecision, Update } from '../../src/api/types'
import { messagesToFeed, type ChatFeedItem } from '../../src/chat/feed'

/** One row in the woven Home Room feed: a message (rendered via the unified kit —
 *  a bubble OR a capture card), a curated update card, or an actionable decision
 *  card. The screen maps `msg` rows straight to the kit's feed and turns
 *  update/decision rows into `custom` nodes. Sorted oldest→newest. */
export type WovenRow =
  | { kind: 'msg'; key: string; at: number; item: ChatFeedItem }
  | { kind: 'update'; key: string; at: number; update: Update }
  | { kind: 'decision'; key: string; at: number; decision: HomeownerDecision }

/** Epoch ms for an ISO timestamp; 0 (oldest) when missing/unparseable so a card
 *  with no date still renders deterministically rather than jumping around. */
function epoch(iso: string | null): number {
  if (!iso) return 0
  const n = Date.parse(iso)
  return Number.isNaN(n) ? 0 : n
}

/**
 * Weave chat messages (via the unified kit — bubbles AND capture cards),
 * published updates, and pending decisions into one chronological feed.
 *
 * - Messages go through `messagesToFeed`, so a captured message shows as its
 *   CaptureCard(s) (Slice D), not a flat bubble.
 * - `decision_needed` updates are dropped (the pending Decision gets its own
 *   actionable card, so keeping the update too would double-surface the ask).
 * - Only `pending` decisions render (an answered one is history).
 * - Stable sort (insertion-order tiebreak) so equal timestamps stay predictable.
 */
export function weaveHomeRoom(
  messages: ChatMessage[],
  updates: Update[],
  decisions: HomeownerDecision[],
  lang: 'en' | 'hi',
): WovenRow[] {
  const rows: WovenRow[] = []

  for (const item of messagesToFeed(messages, lang)) {
    rows.push({ kind: 'msg', key: item.key, at: epoch(item.message.created_at), item })
  }
  for (const u of updates) {
    if (u.type === 'decision_needed') continue // superseded by its DecisionCard
    rows.push({ kind: 'update', key: `u:${u.id}`, at: epoch(u.published_at), update: u })
  }
  for (const d of decisions) {
    if (d.state !== 'pending') continue
    rows.push({ kind: 'decision', key: `d:${d.id}`, at: epoch(d.created_at), decision: d })
  }

  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.at - b.r.at || a.i - b.i)
    .map(({ r }) => r)
}

/** Her in-thread action on a pending decision (maps to POST /decisions/{id}/respond). */
export type DecisionAction = 'approve' | 'comment' | 'request_change'

/** Single-language (en/हिं) copy for the Home Room's curated cards + her actions. */
export interface HomeRoomStrings {
  decisionEyebrow: string
  approve: string
  comment: string
  requestChange: string
  notePlaceholder: string
  send: string
  cancel: string
  approved: string
  commentSent: string
  changeRequested: string
  respondErr: string
  // Composer quick-actions (her actions from the brief: ask · request a visit).
  ask: string
  requestVisit: string
  requestVisitTitle: string
  requestVisitDetail: string
  visitRequested: string
  visitErr: string
}

export const HOME_ROOM_STR: Record<'en' | 'hi', HomeRoomStrings> = {
  en: {
    decisionEyebrow: 'Needs your choice',
    approve: 'Approve',
    comment: 'Comment',
    requestChange: 'Request a change',
    notePlaceholder: 'Add a note for your builder…',
    send: 'Send',
    cancel: 'Cancel',
    approved: 'Approved — your builder has been told.',
    commentSent: 'Your comment is on its way to your builder.',
    changeRequested: 'Your builder will look at this change.',
    respondErr: 'We couldn’t send that just now. Please try again.',
    ask: 'Ask about your home',
    requestVisit: 'Request a visit',
    requestVisitTitle: 'Site visit request',
    requestVisitDetail: 'I’d like to visit the site — please suggest a good time.',
    visitRequested: 'Visit request sent to your builder.',
    visitErr: 'We couldn’t send your request just now. Please try again.',
  },
  hi: {
    decisionEyebrow: 'आपका निर्णय चाहिए',
    approve: 'मंज़ूरी दें',
    comment: 'टिप्पणी',
    requestChange: 'बदलाव का अनुरोध',
    notePlaceholder: 'अपने बिल्डर के लिए एक नोट जोड़ें…',
    send: 'भेजें',
    cancel: 'रद्द करें',
    approved: 'मंज़ूरी दे दी — आपके बिल्डर को बता दिया गया है।',
    commentSent: 'आपकी टिप्पणी आपके बिल्डर तक पहुँच रही है।',
    changeRequested: 'आपका बिल्डर इस बदलाव को देखेगा।',
    respondErr: 'अभी भेज नहीं सके। कृपया दोबारा कोशिश करें।',
    ask: 'अपने घर के बारे में पूछें',
    requestVisit: 'मुलाक़ात का अनुरोध',
    requestVisitTitle: 'साइट मुलाक़ात अनुरोध',
    requestVisitDetail: 'मैं साइट पर आना चाहता/चाहती हूँ — कृपया कोई अच्छा समय बताएं।',
    visitRequested: 'मुलाक़ात का अनुरोध आपके बिल्डर को भेज दिया गया।',
    visitErr: 'अभी अनुरोध भेज नहीं सके। कृपया दोबारा कोशिश करें।',
  },
}
