import { annotateFeed, messagesToFeed, type AnnotateRow, type ChatFeedItem } from './feed'
import type { ChatMessage } from '../api/chat'

const m = (id: string, over: Partial<ChatMessage> = {}): ChatMessage =>
  ({
    id,
    conversation_id: 'c',
    sender_id: null,
    sender_side: 'contractor',
    seq: 1,
    body: id,
    reply_to_id: null,
    media_type: 'text',
    created_at: '2026-06-08T10:00:00Z',
    attachment_url: null,
    events: [],
    ...over,
  }) as ChatMessage

const ev = (id: string) => ({
  id,
  event_type: 'attendance',
  occurred_on: '',
  summary: 's',
  fields: {},
  confidence: 1,
  needs_clarification: false,
  contested: false,
})

const cards = (items: ChatFeedItem[]) =>
  items.filter((i): i is Extract<ChatFeedItem, { kind: 'card' }> => i.kind === 'card')

describe('messagesToFeed', () => {
  it('renders a plain message as one bubble item', () => {
    const out = messagesToFeed([m('m1')], 'en')
    expect(out.map((i) => i.kind)).toEqual(['bubble'])
    expect(out[0].key).toBe('m1')
  })

  it('renders a captured message as one card item per event', () => {
    const out = messagesToFeed([m('m1', { events: [ev('e1'), ev('e2')] })], 'en')
    expect(out.map((i) => i.kind)).toEqual(['card', 'card'])
    expect(out.map((i) => i.key)).toEqual(['m1:e1', 'm1:e2'])
  })

  it('only the first card of a message carries the source proof', () => {
    const out = messagesToFeed(
      [m('m1', { body: 'src', attachment_url: 'u', events: [ev('e1'), ev('e2')] })],
      'en',
    )
    const cs = cards(out)
    expect(cs[0].sourceText).toBe('src')
    expect(cs[0].attachmentUrl).toBe('u')
    expect(cs[1].sourceText).toBeNull()
    expect(cs[1].attachmentUrl).toBeNull()
  })

  it('preserves message order across bubbles and cards', () => {
    const out = messagesToFeed([m('a'), m('b', { events: [ev('e1')] }), m('c')], 'en')
    expect(out.map((i) => i.key)).toEqual(['a', 'b:e1', 'c'])
  })
})

describe('messagesToFeed capturesAsBubbles', () => {
  it('renders a captured message as a single bubble when capturesAsBubbles is set', () => {
    const out = messagesToFeed(
      [m('m1', { body: 'delivery photo', attachment_url: 'u', events: [ev('e1'), ev('e2')] })],
      'en',
      { capturesAsBubbles: true },
    )
    expect(out.map((i) => i.kind)).toEqual(['bubble'])
    expect(out[0].key).toBe('m1')
  })

  it('still renders cards by default (contractor behavior unchanged)', () => {
    const out = messagesToFeed([m('m1', { events: [ev('e1')] })], 'en')
    expect(out.map((i) => i.kind)).toEqual(['card'])
  })
})

const r = (key: string, over: Partial<AnnotateRow> = {}): AnnotateRow => ({
  key,
  kind: 'msg',
  createdAt: '2026-06-08T10:00:00Z',
  senderId: 'u1',
  senderKind: 'user',
  mine: false,
  ...over,
})
const dayKeyLabel = (iso: string) => iso.slice(0, 10) // deterministic day label for tests

describe('annotateFeed', () => {
  it('inserts a day label before the first row of each calendar day', () => {
    const a = annotateFeed(
      [r('a', { createdAt: '2026-06-08T10:00:00Z' }), r('b', { createdAt: '2026-06-09T09:00:00Z' })],
      dayKeyLabel,
    )
    expect(a.dayBefore.get('a')).toBe('2026-06-08')
    expect(a.dayBefore.get('b')).toBe('2026-06-09')
  })

  it('does not repeat a day label within the same day', () => {
    const a = annotateFeed(
      [r('a', { createdAt: '2026-06-08T10:00:00Z' }), r('b', { createdAt: '2026-06-08T18:00:00Z' })],
      dayKeyLabel,
    )
    expect(a.dayBefore.has('a')).toBe(true)
    expect(a.dayBefore.has('b')).toBe(false)
  })

  it('shows the sender only on the first non-mine message of a same-sender run', () => {
    const a = annotateFeed(
      [r('a', { senderId: 'u1' }), r('b', { senderId: 'u1' }), r('c', { senderId: 'u2' })],
      dayKeyLabel,
    )
    expect(a.showSender.has('a')).toBe(true)
    expect(a.showSender.has('b')).toBe(false)
    expect(a.showSender.has('c')).toBe(true)
  })

  it('never shows the sender on my own messages', () => {
    const a = annotateFeed([r('a', { mine: true })], dayKeyLabel)
    expect(a.showSender.has('a')).toBe(false)
  })

  it('never shows the sender on system/nivaan rows', () => {
    const a = annotateFeed([r('a', { senderKind: 'system' }), r('b', { senderKind: 'nivaan' })], dayKeyLabel)
    expect(a.showSender.has('a')).toBe(false)
    expect(a.showSender.has('b')).toBe(false)
  })

  it('marks runEnd on the last message of a run (sender change, day change, other-row, end)', () => {
    const a = annotateFeed(
      [
        r('a', { senderId: 'u1' }),
        r('b', { senderId: 'u1' }), // last of u1 run -> runEnd
        r('x', { kind: 'other' }), // breaks runs
        r('c', { senderId: 'u1' }), // new run after the other-row -> its own runEnd at end
      ],
      dayKeyLabel,
    )
    expect(a.runEnd.has('a')).toBe(false)
    expect(a.runEnd.has('b')).toBe(true)
    expect(a.runEnd.has('c')).toBe(true)
  })

  it('an other-row breaks a run so the next same-sender message restarts attribution', () => {
    const a = annotateFeed(
      [r('a', { senderId: 'u1' }), r('x', { kind: 'other' }), r('b', { senderId: 'u1' })],
      dayKeyLabel,
    )
    expect(a.showSender.has('b')).toBe(true)
  })
})
