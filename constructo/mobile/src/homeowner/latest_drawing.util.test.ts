// Plans tab "Latest drawing" card (T5). Lives under src/ (never app/).
import type { Drawing } from '../api/drawings'
import { latestDrawing } from '../screens/homeowner/latest_drawing.util'

const d = (over: Partial<Drawing>): Drawing => ({
  id: 'x',
  site_id: 's',
  title: 'Ground floor plan',
  version: '1',
  file_url: 'k',
  kind: 'plan',
  published_by: null,
  published_at: '2026-10-01T10:00:00Z',
  plain_summary_en: null,
  plain_summary_hi: null,
  change_note: null,
  supersedes_id: null,
  ...over,
})

describe('latestDrawing', () => {
  it('picks the newest drawing', () => {
    const rows = [
      d({ id: 'a', title: 'Elevation', published_at: '2026-09-01T10:00:00Z' }),
      d({ id: 'b', title: 'Wiring', published_at: '2026-10-20T10:00:00Z' }),
      d({ id: 'c', title: 'Plan', published_at: '2026-10-05T10:00:00Z' }),
    ]
    expect(latestDrawing(rows)?.id).toBe('b')
  })

  it('skips superseded rows', () => {
    const rows = [
      // v2 supersedes v1; an older-dated v2 still wins over the superseded v1.
      d({ id: 'v1', version: '1', published_at: '2026-10-20T10:00:00Z' }),
      d({ id: 'v2', version: '2', supersedes_id: 'v1', published_at: '2026-10-10T10:00:00Z' }),
    ]
    expect(latestDrawing(rows)?.id).toBe('v2')
  })

  it('returns a plain drawing (no derived fields)', () => {
    const out = latestDrawing([d({ id: 'a' })])!
    expect(out).toEqual(d({ id: 'a' }))
  })

  it('is null for an empty list', () => {
    expect(latestDrawing([])).toBeNull()
  })
})
