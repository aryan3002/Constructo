/**
 * Room ↔ profiler-area bridge. Bridges the legacy room slug (space_id, or the
 * plain room name typed into the URL) used by `references/[room].tsx` to the
 * profiler engine's `ProfilerArea.area_key` — so a homeowner tapping
 * "References" for e.g. "master-bedroom" lands on the SAME area the profiler
 * already tracks as "master bedroom", instead of two disconnected surfaces.
 *
 * Pure, no React, no side effects.
 */
import type { ProfilerArea } from '../api/client'

/** Normalize a room slug or area_key for comparison: lowercase, trim,
 *  `-`/`_` → space, collapse runs of whitespace. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Resolve the profiler area that corresponds to a room slug/name.
 *
 * - `'all'` (the whole-house group used by the legacy references screen)
 *   always returns null — the caller falls back to the whole-house hub.
 * - Exact match (normalized) wins first.
 * - Otherwise a `startsWith` match (either direction is NOT attempted —
 *   only room-slug-is-prefix-of-area-key, e.g. "kitchen" → "kitchen and pantry").
 * - No match (custom/unknown room, or no areas yet) → null.
 */
export function areaForRoom(
  roomSlugOrName: string,
  areas: ProfilerArea[],
): ProfilerArea | null {
  const needle = normalize(roomSlugOrName)
  if (!needle || needle === 'all') return null
  if (areas.length === 0) return null

  const exact = areas.find((a) => normalize(a.area_key) === needle)
  if (exact) return exact

  const prefix = areas.find((a) => normalize(a.area_key).startsWith(needle))
  return prefix ?? null
}

/** Human-readable room label for a profiler area (underscores → spaces). */
export function roomLabelForArea(area: ProfilerArea): string {
  return area.area_key.replace(/_/g, ' ')
}
