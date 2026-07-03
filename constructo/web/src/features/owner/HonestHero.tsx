// HonestHero — the activity-first OwnerHome headline. A PURE function of the
// activity summary counts + the newest activity timestamp: no fabricated
// numbers, no spinners. Mirrors the two skins the old OwnerHome header used
// (Neev editorial serif vs default Blueprint).
import { useT, type TFunction } from '../../i18n'
import { formatDate } from '../../lib/format'
import { Display, Small } from '../../ui'
import { useSkin } from '../../ui/ThemeModeProvider'
import type { ActivitySummary } from '../../api/activity'

/** Compact relative time for the all-quiet clause ("2h ago" / "just now"). */
function relativeActivity(iso: string | null, t: TFunction): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.round((Date.now() - then) / 1000)
  if (secs < 60) return t('activity.rel.just_now')
  const mins = Math.round(secs / 60)
  if (mins < 60) return t('activity.rel.mins_ago', { n: mins })
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return t('activity.rel.hrs_ago', { n: hrs })
  const days = Math.round(hrs / 24)
  return t('activity.rel.days_ago', { n: days })
}

/** Pure headline builder — unit tested directly (no React). */
export function buildHeroHeadline(
  summary: ActivitySummary | undefined,
  lastActivityAt: string | null,
  t: TFunction,
): string {
  const updates = summary?.updates_today ?? 0
  const decisions = summary?.needs_decision_count ?? 0

  if (updates === 0) {
    return lastActivityAt
      ? t('owner.hero.all_quiet', { rel: relativeActivity(lastActivityAt, t) })
      : t('owner.hero.all_quiet_never')
  }

  const head =
    updates === 1
      ? t('owner.hero.one_update')
      : t('owner.hero.many_updates', { count: updates })

  const tail =
    decisions === 1
      ? t('owner.hero.and_one_decision')
      : decisions > 1
        ? t('owner.hero.and_many_decisions', { count: decisions })
        : ''

  return `${head}${tail}`
}

export function HonestHero({
  summary,
  lastActivityAt,
  date,
}: {
  summary?: ActivitySummary
  lastActivityAt: string | null
  date: string
}) {
  const t = useT()
  const neev = useSkin() === 'neev'
  const headline = buildHeroHeadline(summary, lastActivityAt, t)
  const eyebrow = t('owner.hero.eyebrow', { date: formatDate(date) })

  if (neev) {
    return (
      <header>
        <p className="font-body text-micro font-semibold uppercase tracking-[0.14em] text-[var(--celebrate-text)]">
          {eyebrow}
        </p>
        <Display className="mt-2 !text-[2.1rem] !leading-[1.1]">{headline}</Display>
      </header>
    )
  }
  return (
    <header>
      <Small className="!text-text-mute">{eyebrow}</Small>
      <Display className="mt-1">{headline}</Display>
    </header>
  )
}
