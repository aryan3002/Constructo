/**
 * brief_diff — pure "what changed" set-diff between two brief renderings'
 * `content_json.areas`, keyed on `material_families` per area. No React, no
 * backend call: this is a v1 client-side honesty layer, so it only ever
 * compares the two renderings the caller hands it (see brief.tsx — the
 * "previous" side is whatever was cached in TanStack Query before the last
 * regenerate, not a server-tracked prior version).
 */

/** The minimal shape this util needs from a brief rendering's content_json.areas[i]. */
export interface BriefDiffArea {
  area_key: string
  material_families?: string[] | null
}

export interface BriefAreaDiff {
  area_key: string
  added: string[]
  removed: string[]
}

/**
 * Set-diff `material_families` per area between `prev` and `curr`.
 * - `prev === null` (no previous rendering seen yet, e.g. the very first
 *   brief) → always [] — there is nothing to have "changed" from.
 * - An area present only in `curr` → all of its families are "added".
 * - An area present only in `prev` → all of its families are "removed".
 * - Areas with no difference are omitted from the result entirely.
 * Order is deterministic: curr's area order, then any prev-only areas
 * appended in prev's order; added/removed preserve first-seen order.
 */
export function briefDiff(
  prev: BriefDiffArea[] | null,
  curr: BriefDiffArea[],
): BriefAreaDiff[] {
  const prevByKey = new Map<string, Set<string>>()
  for (const a of prev ?? []) {
    prevByKey.set(a.area_key, new Set(a.material_families ?? []))
  }

  const seen = new Set<string>()
  const result: BriefAreaDiff[] = []

  for (const a of curr) {
    seen.add(a.area_key)
    const currSet = new Set(a.material_families ?? [])
    const prevSet = prevByKey.get(a.area_key) ?? new Set<string>()

    const added = (a.material_families ?? []).filter((m) => !prevSet.has(m))
    const removed = [...prevSet].filter((m) => !currSet.has(m))

    if (prev !== null && (added.length > 0 || removed.length > 0)) {
      result.push({ area_key: a.area_key, added, removed })
    }
  }

  if (prev !== null) {
    for (const a of prev) {
      if (seen.has(a.area_key)) continue
      const removed = a.material_families ?? []
      if (removed.length > 0) {
        result.push({ area_key: a.area_key, added: [], removed: [...removed] })
      }
    }
  }

  return result
}
