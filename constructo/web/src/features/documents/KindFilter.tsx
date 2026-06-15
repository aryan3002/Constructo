/**
 * KindFilter — pill bar to filter the drawings list by DrawingKind.
 * "All" is always present; one pill per kind present in the data.
 */

import { useT } from '../../i18n'
import type { DrawingKind } from '../../api/drawings'

type FilterKind = DrawingKind | 'all'

interface KindFilterProps {
  /** The kinds that are present in the current data set. */
  presentKinds: DrawingKind[]
  activeKind: FilterKind
  onChange: (kind: FilterKind) => void
}

const ALL_KINDS: DrawingKind[] = [
  'plan',
  'elevation',
  'section',
  'structural',
  'electrical',
  'plumbing',
  'other',
]

export function KindFilter({ presentKinds, activeKind, onChange }: KindFilterProps) {
  const t = useT()

  // Show "All" + only the kinds present in data (in the canonical order).
  const visibleKinds = ALL_KINDS.filter((k) => presentKinds.includes(k))

  if (visibleKinds.length === 0) return null

  const pills: FilterKind[] = ['all', ...visibleKinds]

  return (
    <div
      role="group"
      aria-label="Filter by drawing type"
      className="mb-4 flex flex-wrap gap-2"
    >
      {pills.map((k) => {
        const label =
          k === 'all'
            ? t('drawings.kind.all')
            : t(`drawings.kind.${k}` as Parameters<typeof t>[0])
        const isActive = activeKind === k
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            aria-pressed={isActive}
            className={[
              'inline-flex min-h-[36px] items-center rounded-pill px-3 font-body text-small font-semibold transition cstk-animate',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              isActive
                ? 'bg-primary text-on-primary shadow-card'
                : 'border border-line bg-paper text-text-mute hover:border-primary/50 hover:text-text',
            ].join(' ')}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export type { FilterKind }
