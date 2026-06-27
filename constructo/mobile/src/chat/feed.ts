/**
 * Pure feed assembly for the unified chat kit. A message that became structured
 * SiteEvents renders as one CaptureCard per event (the proof — source text +
 * attachment — rides the FIRST card only, mirroring the owner/supervisor screens);
 * a plain message renders as a MessageBubble. Screens interleave their own rows
 * (Nivaan @ask answers, the homeowner Home Room weave) around these.
 *
 * No React — trivially unit-testable.
 */
import type { ChatEvent, ChatMessage } from '../api/chat'

/** One rendered row produced from a raw message. */
export type ChatFeedItem =
  | { kind: 'bubble'; key: string; message: ChatMessage }
  | {
      kind: 'card'
      key: string
      message: ChatMessage
      event: ChatEvent
      lang: 'en' | 'hi'
      sourceText: string | null
      attachmentUrl: string | null
    }

/** Map raw messages → feed rows, preserving order. When `capturesAsBubbles` is
 *  set, a message that minted events renders as a single bubble (its photo +
 *  text) instead of one CaptureCard per event — used by the homeowner thread,
 *  which keeps chat pure and surfaces the structured detection elsewhere. */
export function messagesToFeed(
  messages: ChatMessage[],
  lang: 'en' | 'hi',
  opts?: { capturesAsBubbles?: boolean },
): ChatFeedItem[] {
  const items: ChatFeedItem[] = []
  for (const message of messages) {
    if (!opts?.capturesAsBubbles && message.events && message.events.length > 0) {
      message.events.forEach((event, i) => {
        items.push({
          kind: 'card',
          key: `${message.id}:${event.id}`,
          message,
          event,
          lang,
          sourceText: i === 0 ? message.body : null,
          attachmentUrl: i === 0 ? message.attachment_url : null,
        })
      })
    } else {
      items.push({ kind: 'bubble', key: message.id, message })
    }
  }
  return items
}

/** Minimal row shape annotateFeed needs. 'msg' = a bubble/card derived from a
 *  ChatMessage; 'other' = a custom/system row (breaks runs, no day boundary). */
export interface AnnotateRow {
  key: string
  kind: 'msg' | 'other'
  createdAt?: string | null
  senderId?: string | null
  senderKind?: string | null
  /** Precomputed `sender_side === mineSide` so this stays pure. */
  mine?: boolean
}

/** Grouping/day annotations, keyed by row key. */
export interface FeedAnnotations {
  /** rowKey -> day label to render as a separator BEFORE that row. */
  dayBefore: Map<string, string>
  /** message keys that should show the sender name/avatar (first of a run, not mine, human). */
  showSender: Set<string>
  /** message keys that are the LAST of their run (render the clustered timestamp). */
  runEnd: Set<string>
}

/** Local calendar-day key for an ISO timestamp ('' when unparseable). */
function localDayKey(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** True when two ISO timestamps fall on the same local calendar day. */
export function sameLocalDay(a: string, b: string): boolean {
  const ka = localDayKey(a)
  return ka !== '' && ka === localDayKey(b)
}

/** A stable run identity for a message row. */
function senderKeyOf(row: AnnotateRow): string {
  return row.senderId ?? `kind:${row.senderKind ?? 'user'}`
}

/**
 * Derive day separators + same-sender grouping over a chronological row list.
 * Pure: caller precomputes `mine` and supplies `dayLabel(iso)` (so "Today/
 * Yesterday" stays out of this function and it remains deterministic).
 */
export function annotateFeed(
  rows: AnnotateRow[],
  dayLabel: (iso: string) => string,
): FeedAnnotations {
  const dayBefore = new Map<string, string>()
  const showSender = new Set<string>()
  const runEnd = new Set<string>()

  let prevDayKey = ''
  let runSenderKey: string | null = null
  let lastMsgKey: string | null = null

  const closeRun = () => {
    if (lastMsgKey !== null) runEnd.add(lastMsgKey)
    lastMsgKey = null
    runSenderKey = null
  }

  for (const row of rows) {
    if (row.kind === 'other') {
      closeRun()
      continue
    }
    const dayKey = localDayKey(row.createdAt)
    const dayChanged = dayKey !== '' && dayKey !== prevDayKey
    if (dayChanged) {
      closeRun()
      if (row.createdAt) dayBefore.set(row.key, dayLabel(row.createdAt))
      prevDayKey = dayKey
    }
    const sk = senderKeyOf(row)
    if (sk !== runSenderKey) {
      // New run: close the previous one and (maybe) attribute this row.
      if (lastMsgKey !== null) runEnd.add(lastMsgKey)
      runSenderKey = sk
      const human = row.senderKind !== 'system' && row.senderKind !== 'nivaan'
      if (!row.mine && human) showSender.add(row.key)
    }
    lastMsgKey = row.key
  }
  closeRun()
  return { dayBefore, showSender, runEnd }
}
