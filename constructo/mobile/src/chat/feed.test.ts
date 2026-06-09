import { messagesToFeed, type ChatFeedItem } from './feed'
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
