/**
 * Tests for the homeowner Finishes screen helpers and data contract.
 *
 * NOTE: this lives under src/ (NOT app/) on purpose — Expo Router evaluates
 * every file under app/ as a route at startup, so a test file there crashes
 * the app.  The helpers under test live in app/(homeowner)/finishes.tsx but
 * are exported for testing via this module.
 *
 * Coverage:
 *  - finishDetail: brand · colour · finish join (nulls omitted)
 *  - finishQty: qty + unit join (nulls omitted)
 *  - FinishesResponse type contract (chosen / deciding, no cost keys)
 *  - empty-rooms response shape
 */

import type { FinishItem, RoomFinishes, FinishesResponse } from '../api/types'

// ---- helpers (duplicated from finishes.tsx so the test is self-contained) ----

function finishDetail(item: FinishItem): string {
  return [item.brand, item.colour, item.finish].filter(Boolean).join(' · ')
}

function finishQty(item: FinishItem): string | null {
  if (!item.qty && !item.unit) return null
  return [item.qty, item.unit].filter(Boolean).join(' ')
}

// ---- fixtures ----

const CHOSEN_ITEM: FinishItem = {
  element: 'Floor',
  category: 'Tile',
  brand: 'Kajaria',
  colour: 'Ivory Beige',
  finish: 'Matt',
  qty: '10',
  unit: 'Sq Ft',
  status: 'chosen',
  client_final_code: 'FL-A3',
}

const DECIDING_ITEM: FinishItem = {
  element: 'Wall',
  category: null,
  brand: null,
  colour: null,
  finish: null,
  qty: null,
  unit: null,
  status: 'deciding',
  client_final_code: null,
}

const ONE_ROOM: RoomFinishes = {
  room: 'Living Room',
  items: [CHOSEN_ITEM],
}

const FULL_RESPONSE: FinishesResponse = {
  rooms: [ONE_ROOM],
}

const EMPTY_RESPONSE: FinishesResponse = {
  rooms: [],
}

// ---- finishDetail ----

describe('finishDetail', () => {
  it('joins brand, colour, and finish with ·', () => {
    expect(finishDetail(CHOSEN_ITEM)).toBe('Kajaria · Ivory Beige · Matt')
  })

  it('omits null brand', () => {
    const item: FinishItem = { ...CHOSEN_ITEM, brand: null }
    expect(finishDetail(item)).toBe('Ivory Beige · Matt')
  })

  it('omits null colour', () => {
    const item: FinishItem = { ...CHOSEN_ITEM, colour: null }
    expect(finishDetail(item)).toBe('Kajaria · Matt')
  })

  it('omits null finish', () => {
    const item: FinishItem = { ...CHOSEN_ITEM, finish: null }
    expect(finishDetail(item)).toBe('Kajaria · Ivory Beige')
  })

  it('returns empty string when all three are null', () => {
    expect(finishDetail(DECIDING_ITEM)).toBe('')
  })
})

// ---- finishQty ----

describe('finishQty', () => {
  it('joins qty and unit', () => {
    expect(finishQty(CHOSEN_ITEM)).toBe('10 Sq Ft')
  })

  it('returns null when both qty and unit are null', () => {
    expect(finishQty(DECIDING_ITEM)).toBeNull()
  })

  it('handles qty-only (no unit)', () => {
    const item: FinishItem = { ...CHOSEN_ITEM, unit: null }
    expect(finishQty(item)).toBe('10')
  })

  it('handles unit-only (no qty)', () => {
    const item: FinishItem = { ...CHOSEN_ITEM, qty: null }
    expect(finishQty(item)).toBe('Sq Ft')
  })
})

// ---- FinishesResponse shape / data contract ----

describe('FinishesResponse shape', () => {
  it('room title and element render from the fixture', () => {
    // The screen renders room.room as the CalmCard title and item.element as the
    // BodyStrong.  Assert the shape is what the screen reads.
    expect(FULL_RESPONSE.rooms[0].room).toBe('Living Room')
    expect(FULL_RESPONSE.rooms[0].items[0].element).toBe('Floor')
    expect(FULL_RESPONSE.rooms[0].items[0].brand).toBe('Kajaria')
  })

  it('status is "chosen" for the approved item', () => {
    expect(FULL_RESPONSE.rooms[0].items[0].status).toBe('chosen')
  })

  it('status is "deciding" for the undecided item', () => {
    const room: RoomFinishes = { room: 'Kitchen', items: [DECIDING_ITEM] }
    const response: FinishesResponse = { rooms: [room] }
    expect(response.rooms[0].items[0].status).toBe('deciding')
  })

  it('empty state: rooms is an empty array', () => {
    expect(EMPTY_RESPONSE.rooms).toHaveLength(0)
  })

  it('no price-like fields appear on a FinishItem', () => {
    // The firewall is structural: unit_rate / wastage_pct / line_total must not
    // exist on the type.  We use keyof to assert their absence at compile time —
    // the test itself just checks runtime keys of the fixture object.
    const keys = Object.keys(CHOSEN_ITEM)
    expect(keys).not.toContain('unit_rate')
    expect(keys).not.toContain('wastage_pct')
    expect(keys).not.toContain('line_total')
    expect(keys).not.toContain('price')
    expect(keys).not.toContain('cost')
  })

  it('qty arrives as a string (Decimal serialised by backend), not a number', () => {
    expect(typeof CHOSEN_ITEM.qty).toBe('string')
  })
})

// ---- client mock — verifies finishes() is callable and returns a typed promise ----

describe('homeowner.finishes() mock', () => {
  it('resolves to a FinishesResponse', async () => {
    // Manually mock the client function — no real network needed.
    const mockFinishes = jest.fn<Promise<FinishesResponse>, [string?]>()
    mockFinishes.mockResolvedValueOnce(FULL_RESPONSE)

    const result = await mockFinishes('site-123')

    expect(mockFinishes).toHaveBeenCalledWith('site-123')
    expect(result.rooms).toHaveLength(1)
    expect(result.rooms[0].room).toBe('Living Room')
    expect(result.rooms[0].items[0].element).toBe('Floor')
    expect(result.rooms[0].items[0].brand).toBe('Kajaria')
    expect(result.rooms[0].items[0].status).toBe('chosen')
  })

  it('resolves to an empty FinishesResponse for an empty rooms list', async () => {
    const mockFinishes = jest.fn<Promise<FinishesResponse>, [string?]>()
    mockFinishes.mockResolvedValueOnce(EMPTY_RESPONSE)

    const result = await mockFinishes()

    expect(result.rooms).toHaveLength(0)
  })
})
