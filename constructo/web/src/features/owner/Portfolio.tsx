// Col-2 of the Owner Command Center (W1-C): Portfolio — the at-a-glance health
// of the whole book of work. The worst-first site roll-up (status-wins) sits
// above the 2x2 pulse grid (Cash / Labor / Material / Progress). Tapping a pulse
// tile reveals its backing evidence in place (evidence-on-tap, the soul). No
// charts here — trends live only in Col-3 (This Week).
import { useMemo, useState } from 'react'
import { PulseGrid } from '../../pages/owner/PulseGrid'
import {
  EvidenceCard,
  H2,
  StatusDot,
  type Status,
} from '../../ui'
import { useT } from '../../i18n'
import type { OwnerHome, PulseTile, SiteCard } from '../../api/dashboard'
import type { TranslationKey } from '../../i18n'

const STATUS_RANK: Record<Status, number> = { risk: 0, warn: 1, info: 2, ok: 3 }

/** Aggregate the same-kind tiles across all sites for the "All Sites" view. */
export function aggregatePulse(sites: SiteCard[]): PulseTile[] {
  const kinds = ['cash', 'labor', 'material', 'progress'] as const
  return kinds.map((kind) => {
    const tiles = sites
      .map((s) => s.pulse.find((p) => p.kind === kind))
      .filter((p): p is PulseTile => Boolean(p))
    const status = tiles.reduce<Status>((worst, p) => {
      const s = p.status as Status
      return STATUS_RANK[s] < STATUS_RANK[worst] ? s : worst
    }, 'ok')
    const value = tiles.reduce<number | null>((sum, p) => {
      if (p.value == null) return sum
      return (sum ?? 0) + p.value
    }, null)
    const evidence = tiles.flatMap((p) => p.evidence_event_ids)
    // Merge numeric facts (e.g. forward-compatible stage facts) by last-wins.
    const facts = tiles.reduce<Record<string, number | null>>(
      (acc, p) => ({ ...acc, ...p.facts }),
      {},
    )
    return { kind, status, value, evidence_event_ids: evidence, facts }
  })
}

export function Portfolio({
  home,
  selectedSiteId,
  onSelectSite,
}: {
  home: OwnerHome
  selectedSiteId: string | null
  onSelectSite: (id: string | null) => void
}) {
  const t = useT()
  const [evidenceTile, setEvidenceTile] = useState<PulseTile | null>(null)

  // Worst-status-first so the site most in trouble reads first.
  const rolled = useMemo(
    () =>
      [...home.sites].sort(
        (a, b) =>
          STATUS_RANK[a.status as Status] - STATUS_RANK[b.status as Status],
      ),
    [home.sites],
  )

  const focusSite =
    home.sites.find((s) => s.site_id === selectedSiteId) ?? home.sites[0]
  const pulseTiles = selectedSiteId
    ? (focusSite?.pulse ?? [])
    : aggregatePulse(home.sites)

  return (
    <section
      aria-labelledby="owner-portfolio-heading"
      className="flex flex-col gap-4"
    >
      <H2 id="owner-portfolio-heading">{t('owner.portfolio.title')}</H2>

      {/* Worst-first site roll-up (wired to the SiteSwitcher selection). */}
      <section aria-label={t('owner.home.rollup_title')}>
        <ul className="flex flex-wrap gap-2">
          {rolled.map((s) => {
            const active = s.site_id === selectedSiteId
            return (
              <li key={s.site_id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectSite(active ? null : s.site_id)}
                  className={`flex min-h-tap items-center gap-2 rounded-pill border px-3 font-body text-small font-semibold cstk-animate transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    active
                      ? 'border-primary bg-paper text-text'
                      : 'border-line bg-card text-text-mute hover:bg-paper'
                  }`}
                >
                  <StatusDot status={s.status as Status} />
                  <span className="max-w-[12ch] truncate">{s.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {/* 2x2 pulse grid — each tile tappable to its evidence. */}
      <section aria-label={t('owner.home.pulse_title')}>
        <PulseGrid tiles={pulseTiles} onTileTap={setEvidenceTile} />

        {evidenceTile ? (
          <div className="mt-3">
            <EvidenceCard
              claim={t(`owner.pulse.${evidenceTile.kind}` as TranslationKey)}
              status={evidenceTile.status as Status}
              detail={t('owner.portfolio.linked', {
                n: evidenceTile.evidence_event_ids.length,
              })}
              defaultOpen
              evidence={evidenceTile.evidence_event_ids.map((id) => ({
                kind: 'message' as const,
                label: t('brief.evidence.linked'),
                detail: id,
              }))}
            />
          </div>
        ) : null}
      </section>
    </section>
  )
}
