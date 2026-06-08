// Tests for the Home Room thread merge (app/(homeowner)/_home_room.util). Lives
// under src/ (NOT app/) — Expo Router evaluates every app/ file as a route, so a
// test there crashes startup with "Property 'describe' doesn't exist".
import { mergeHomeRoom, type HomeRoomItem } from '../../app/(homeowner)/_home_room.util'
import type { ChatMessage } from '../api/chat'
import type { HomeownerDecision, Update } from '../api/types'

const msg = (id: string, created_at: string): ChatMessage =>
  ({ id, created_at, body: id, sender_side: 'homeowner', seq: 1 }) as unknown as ChatMessage

const upd = (id: string, published_at: string, type: Update['type'] = 'progress'): Update =>
  ({ id, published_at, type, title: id }) as unknown as Update

const dec = (id: string, created_at: string, state = 'pending'): HomeownerDecision =>
  ({ id, created_at, state, title: id }) as unknown as HomeownerDecision

const kinds = (items: HomeRoomItem[]) => items.map((i) => i.kind)
const keys = (items: HomeRoomItem[]) => items.map((i) => i.key)

describe('mergeHomeRoom', () => {
  it('weaves bubbles, updates, and decisions into one oldest→newest feed', () => {
    const out = mergeHomeRoom(
      [msg('m1', '2026-06-01T09:00:00Z'), msg('m2', '2026-06-03T09:00:00Z')],
      [upd('u1', '2026-06-02T09:00:00Z')],
      [dec('d1', '2026-06-04T09:00:00Z')],
    )
    expect(keys(out)).toEqual(['m:m1', 'u:u1', 'm:m2', 'd:d1'])
  })

  it('drops decision_needed updates (superseded by their DecisionCard)', () => {
    const out = mergeHomeRoom(
      [],
      [upd('u1', '2026-06-01T09:00:00Z', 'decision_needed'), upd('u2', '2026-06-02T09:00:00Z')],
      [],
    )
    expect(keys(out)).toEqual(['u:u2'])
  })

  it('renders only pending decisions (answered ones are history)', () => {
    const out = mergeHomeRoom(
      [],
      [],
      [dec('d1', '2026-06-01T09:00:00Z', 'pending'), dec('d2', '2026-06-02T09:00:00Z', 'approved')],
    )
    expect(keys(out)).toEqual(['d:d1'])
  })

  it('is stable for equal timestamps (bubbles, then updates, then decisions)', () => {
    const at = '2026-06-01T09:00:00Z'
    const out = mergeHomeRoom([msg('m1', at)], [upd('u1', at)], [dec('d1', at)])
    expect(kinds(out)).toEqual(['bubble', 'update', 'decision'])
  })

  it('treats a missing/unparseable timestamp as oldest (0), never NaN-sorting', () => {
    const out = mergeHomeRoom(
      [msg('m1', '2026-06-02T09:00:00Z')],
      [upd('u_old', null as unknown as string), upd('u_bad', 'not-a-date')],
      [],
    )
    // Both undated updates sort to the front (epoch 0), message after.
    expect(keys(out)).toEqual(['u:u_old', 'u:u_bad', 'm:m1'])
  })

  it('returns an empty feed when every source is empty', () => {
    expect(mergeHomeRoom([], [], [])).toEqual([])
  })
})
