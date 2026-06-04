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
 * The progress tile NEVER shows a fabricated %-complete ring (Invariant 5). It
 * shows the honest stage milestone + `SiteBaseline` variance when the backend
 * supplies it (`stage_index` / `stage_total` / `variance_days` facts — e.g.
 * "Stage 2 of 5", "+3d vs plan"), and otherwise a calm "set expected stages"
 * prompt. Until the backend ships stage baselines, every site shows the prompt —
 * which is correct, not a gap to paper over with a number.
 */
function progressDisplay(
  tile: PulseTile,
  t: ReturnType<typeof useT>,
): { primary: string; secondary: string | null } {
  const idx = tile.facts.stage_index
  const total = tile.facts.stage_total
  if (typeof idx === 'number' && typeof total === 'number' && total > 0) {
    const variance = tile.facts.variance_days
    let secondary: string | null = null
    if (typeof variance === 'number') {
      secondary =
        variance === 0
          ? t('owner.pulse.on_plan')
          : t('owner.pulse.vs_plan', {
              d: `${variance > 0 ? '+' : ''}${variance}`,
            })
    }
    return { primary: t('owner.pulse.stage', { n: idx, total }), secondary }
  }
  return { primary: t('owner.pulse.set_stages'), secondary: null }
}

/**
 * PulseGrid — a 2x2 at-a-glance grid (Cash / Labor / Material / Progress). Each
 * tile shows the kit status spine (color + dot) and is tappable to surface the
 * backing evidence. Tiles with no evidence stay non-interactive but keep their
 * status read. The progress tile is special-cased to stage+variance (never %).
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
        const isProgress = tile.kind === 'progress'
        const progress = isProgress ? progressDisplay(tile, t) : null
        const value = tile.value ?? '—'
        const hint = hasEvidence
          ? t('owner.pulse.tap_evidence')
          : t('owner.pulse.no_evidence')
        const ariaValue = isProgress ? progress!.primary : String(value)

        return (
          <li key={tile.kind}>
            <button
              type="button"
              data-status={tile.status}
              disabled={!hasEvidence}
              onClick={() => hasEvidence && onTileTap?.(tile)}
              aria-label={`${label}: ${ariaValue}. ${hint}`}
              className="flex min-h-tap w-full flex-col gap-1.5 rounded-card border border-line bg-card p-4 text-left shadow-card cstk-animate transition hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:hover:bg-card"
            >
              <div className="flex items-center gap-2">
                <StatusDot status={tile.status as Status} />
                <Small className="font-semibold uppercase tracking-wide !text-text-mute">
                  {label}
                </Small>
              </div>

              {isProgress ? (
                <>
                  <span className="font-display text-h2 font-bold leading-tight text-text">
                    {progress!.primary}
                  </span>
                  {progress!.secondary ? (
                    <Mono className="text-small text-text-mute">
                      {progress!.secondary}
                    </Mono>
                  ) : (
                    <Small className="!text-text-mute">
                      {t('owner.pulse.set_stages_hint')}
                    </Small>
                  )}
                </>
              ) : (
                <>
                  <Mono className="font-display text-h1 font-bold leading-none text-text">
                    {value}
                  </Mono>
                  <Small className="!text-text-mute">{hint}</Small>
                </>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
