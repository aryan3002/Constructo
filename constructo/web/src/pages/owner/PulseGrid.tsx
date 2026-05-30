import { useT } from '../../i18n'
import { StatusDot, type Status } from '../../ui'
import { Mono, Small } from '../../ui'
import type { PulseTile } from '../../api/dashboard'
import type { TranslationKey } from '../../i18n'

const TILE_LABEL: Record<string, TranslationKey> = {
  cash: 'owner.pulse.cash',
  labor: 'owner.pulse.labor',
  material: 'owner.pulse.material',
  progress: 'owner.pulse.progress',
}

/**
 * PulseGrid — a 2x2 at-a-glance grid (Cash / Labor / Material / Progress). Each
 * tile shows the kit status spine (color + dot) and is tappable to surface the
 * backing evidence. Tiles with no evidence stay non-interactive but keep their
 * status read so the owner still sees the at-a-glance health.
 */
export function PulseGrid({
  tiles,
  onTileTap,
}: {
  tiles: PulseTile[]
  onTileTap?: (tile: PulseTile) => void
}) {
  const t = useT()

  return (
    <ul className="grid grid-cols-2 gap-3" aria-label={t('owner.home.pulse_title')}>
      {tiles.map((tile) => {
        const label = t(TILE_LABEL[tile.kind] ?? 'owner.pulse.progress')
        const hasEvidence = tile.evidence_event_ids.length > 0
        const value = tile.value ?? '—'
        const hint = hasEvidence
          ? t('owner.pulse.tap_evidence')
          : t('owner.pulse.no_evidence')

        return (
          <li key={tile.kind}>
            <button
              type="button"
              data-status={tile.status}
              disabled={!hasEvidence}
              onClick={() => hasEvidence && onTileTap?.(tile)}
              aria-label={`${label}: ${value}. ${hint}`}
              className="flex min-h-tap w-full flex-col gap-1.5 rounded-card border border-line bg-card p-4 text-left shadow-card cstk-animate transition hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:hover:bg-card"
            >
              <div className="flex items-center gap-2">
                <StatusDot status={tile.status as Status} />
                <Small className="font-semibold uppercase tracking-wide !text-text-mute">
                  {label}
                </Small>
              </div>
              <Mono className="font-display text-h1 font-bold leading-none text-text">
                {value}
              </Mono>
              <Small className="!text-text-mute">{hint}</Small>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
