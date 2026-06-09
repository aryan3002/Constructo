// Tests for the Home Room weave (app/(homeowner)/_home_room.util). Lives under
// src/ (NOT app/) — Expo Router treats every app/ file as a route.
import { weaveHomeRoom, type WovenRow } from '../../app/(homeowner)/_home_room.util'
import type { ChatMessage } from '../api/chat'
import type { HomeownerDecision, Update } from '../api/types'

const msg = (id: string, created_at: string, events: unknown[] = []): ChatMessage =>
  ({
    id,
    conversation_id: 'c',
    sender_id: null,
    sender_side: 'homeowner',
    seq: 1,
    body: id,
    reply_to_id: null,
    media_type: 'text',
    created_at,
    attachment_url: null,
    events,
  }) as unknown as ChatMessage

const upd = (id: string, published_at: string, type: Update['type'] = 'progress'): Update =>
  ({ id, published_at, type, title: id }) as unknown as Update

const dec = (id: string, created_at: string, state = 'pending'): HomeownerDecision =>
  ({ id, created_at, state, title: id }) as unknown as HomeownerDecision

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

const keys = (rows: WovenRow[]) => rows.map((r) => r.key)

describe('weaveHomeRoom', () => {
  it('weaves messages, updates, and decisions oldest→newest', () => {
    const out = weaveHomeRoom(
      [msg('m1', '2026-06-01T09:00:00Z'), msg('m2', '2026-06-03T09:00:00Z')],
      [upd('u1', '2026-06-02T09:00:00Z')],
      [dec('d1', '2026-06-04T09:00:00Z')],
      'en',
    )
    expect(keys(out)).toEqual(['m1', 'u:u1', 'm2', 'd:d1'])
  })

  it('renders a captured message as a card row (Slice D — not a flat bubble)', () => {
    const out = weaveHomeRoom([msg('m1', '2026-06-01T09:00:00Z', [ev('e1')])], [], [], 'en')
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('msg')
    if (out[0].kind === 'msg') expect(out[0].item.kind).toBe('card')
  })

  it('drops decision_needed updates (superseded by their DecisionCard)', () => {
    const out = weaveHomeRoom(
      [],
      [upd('u1', '2026-06-01T09:00:00Z', 'decision_needed'), upd('u2', '2026-06-02T09:00:00Z')],
      [],
      'en',
    )
    expect(keys(out)).toEqual(['u:u2'])
  })

  it('renders only pending decisions', () => {
    const out = weaveHomeRoom(
      [],
      [],
      [dec('d1', '2026-06-01T09:00:00Z', 'pending'), dec('d2', '2026-06-02T09:00:00Z', 'approved')],
      'en',
    )
    expect(keys(out)).toEqual(['d:d1'])
  })

  it('is stable for equal timestamps (msg, then update, then decision)', () => {
    const at = '2026-06-01T09:00:00Z'
    const out = weaveHomeRoom([msg('m1', at)], [upd('u1', at)], [dec('d1', at)], 'en')
    expect(out.map((r) => r.kind)).toEqual(['msg', 'update', 'decision'])
  })
})
