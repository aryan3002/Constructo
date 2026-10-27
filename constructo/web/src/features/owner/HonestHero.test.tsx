import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LanguageProvider } from '../../i18n'
import { ThemeModeProvider } from '../../ui/ThemeModeProvider'
import { buildHeroHeadline, HonestHero } from './HonestHero'
import type { ActivitySummary } from '../../api/activity'

// A minimal English `t` for the pure-function tests (matches en.ts wording).
const t = ((key: string, vars?: Record<string, unknown>) => {
  const map: Record<string, string> = {
    'owner.hero.all_quiet': `All quiet — last update ${vars?.rel}`,
    'owner.hero.all_quiet_never': 'All quiet — no activity yet',
    'owner.hero.no_updates': 'No updates today',
    'owner.hero.one_update': '1 update today',
    'owner.hero.many_updates': `${vars?.count} updates today`,
    'owner.hero.and_one_decision': ' · 1 needs you',
    'owner.hero.and_many_decisions': ` · ${vars?.count} need you`,
    'activity.rel.just_now': 'just now',
    'activity.rel.mins_ago': `${vars?.n}m ago`,
    'activity.rel.hrs_ago': `${vars?.n}h ago`,
    'activity.rel.days_ago': `${vars?.n}d ago`,
  }
  return map[key] ?? key
}) as never

const sum = (o: Partial<ActivitySummary>): ActivitySummary => ({
  updates_today: 0,
  needs_decision_count: 0,
  sites_total: 3,
  ...o,
})

describe('buildHeroHeadline', () => {
  it('0 updates → all-quiet with the last-activity relative time', () => {
    const iso = new Date(Date.now() - 2 * 3600_000).toISOString()
    expect(buildHeroHeadline(sum({ updates_today: 0 }), iso, t, 0)).toBe(
      'All quiet — last update 2h ago',
    )
  })
  it('0 updates + never → all-quiet-never', () => {
    expect(buildHeroHeadline(sum({ updates_today: 0 }), null, t, 0)).toBe(
      'All quiet — no activity yet',
    )
  })
  it('0 updates but something needs you → never "All quiet"', () => {
    expect(buildHeroHeadline(sum({ updates_today: 0 }), '2026-07-03T00:00:00Z', t, 2)).toBe(
      'No updates today · 2 need you',
    )
  })
  it('1 update, nothing waiting → singular, no decision clause', () => {
    expect(buildHeroHeadline(sum({ updates_today: 1 }), '2026-07-03T00:00:00Z', t, 0)).toBe(
      '1 update today',
    )
  })
  it('3 updates + 1 waiting → plural updates + singular decision clause', () => {
    expect(buildHeroHeadline(sum({ updates_today: 3 }), '2026-07-03T00:00:00Z', t, 1)).toBe(
      '3 updates today · 1 needs you',
    )
  })
  it('5 updates + 2 waiting → both plural', () => {
    expect(buildHeroHeadline(sum({ updates_today: 5 }), '2026-07-03T00:00:00Z', t, 2)).toBe(
      '5 updates today · 2 need you',
    )
  })
  it("counts what Needs you lists, not the server's wider decision count", () => {
    expect(
      buildHeroHeadline(sum({ updates_today: 15, needs_decision_count: 8 }), '2026-07-03T00:00:00Z', t, 1),
    ).toBe('15 updates today · 1 needs you')
  })
  it('undefined summary → all-quiet-never (no crash)', () => {
    expect(buildHeroHeadline(undefined, null, t, 0)).toBe('All quiet — no activity yet')
  })
})

describe('<HonestHero>', () => {
  it('renders the eyebrow + the computed headline', () => {
    render(
      <ThemeModeProvider>
        <LanguageProvider defaultLanguage="en">
          <HonestHero
            summary={sum({ updates_today: 3 })}
            lastActivityAt="2026-07-03T00:00:00Z"
            needsCount={1}
            date="2026-07-03"
          />
        </LanguageProvider>
      </ThemeModeProvider>,
    )
    expect(screen.getByText(/3 updates today · 1 needs you/)).toBeInTheDocument()
    expect(screen.getByText(/Owner ·/)).toBeInTheDocument()
  })
})
