// Tests for the Design write-back helpers (app/(homeowner)/_design_select.util).
// Lives under src/ (NOT app/) — Expo Router treats every app/ file as a route.
import {
  buildProfilePayload,
  visibleSpaces,
} from '../../app/(homeowner)/_design_select.util'
import type { DesignProfile, Space } from '../api/types'

const space = (id: string, name: string): Space =>
  ({ id, name, site_id: 's', parent_id: null, kind: 'room', order: 0, components: [], progress: null }) as Space

describe('visibleSpaces', () => {
  const all = [space('a', 'Living'), space('b', 'Kitchen'), space('c', 'Bedroom')]

  it('returns every room when the member is not room-narrowed', () => {
    expect(visibleSpaces(all, null).map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns only her room when narrowed to one space', () => {
    expect(visibleSpaces(all, 'b').map((s) => s.id)).toEqual(['b'])
  })

  it('returns nothing when the narrowed space is absent (no accidental whole-house)', () => {
    expect(visibleSpaces(all, 'zzz')).toEqual([])
  })
})

describe('buildProfilePayload', () => {
  const draft = {
    profile: {
      profile: 'old prose',
      tone: ['warm'],
      per_room: { kitchen: 'bright' },
      contributors: [{ name: 'Asha' }],
      conflicts: [{ item: 'Floor', options: [] }],
      source: { selections: 's', references: 'r' },
    },
  } as unknown as DesignProfile

  it('overrides only prose + tone, carrying every other key through untouched', () => {
    const out = buildProfilePayload(draft, '  new prose  ', ['calm', 'light'])
    expect(out).toEqual({
      profile: 'new prose', // trimmed
      tone: ['calm', 'light'],
      per_room: { kitchen: 'bright' },
      contributors: [{ name: 'Asha' }],
      conflicts: [{ item: 'Floor', options: [] }],
      source: { selections: 's', references: 'r' },
    })
  })

  it('tolerates an undefined draft (first-ever profile)', () => {
    expect(buildProfilePayload(undefined, 'hi', ['cosy'])).toEqual({
      profile: 'hi',
      tone: ['cosy'],
    })
  })
})
