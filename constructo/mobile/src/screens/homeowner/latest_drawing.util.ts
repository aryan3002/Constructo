// Design → Plans "Latest drawing" card (T5). Drawings carry no approval state,
// so the Plans tab shows the newest current sheet instead of a made-up
// "Pending your approval" count.
import { withSupersession, type Drawing } from '../../api/drawings'

/** The newest drawing that no later revision supersedes, or null. */
export function latestDrawing(rows: Drawing[]): Drawing | null {
  const current = new Set(withSupersession(rows).filter((v) => !v.superseded).map((v) => v.id))
  let best: Drawing | null = null
  for (const d of rows) {
    if (!current.has(d.id)) continue
    if (!best || Date.parse(d.published_at) > Date.parse(best.published_at)) best = d
  }
  return best
}
