import { describe, expect, it } from 'vitest'
import { en } from './en'
import { hi } from './hi'

const REQUIRED = [
  'owner.hero.eyebrow',
  'owner.hero.all_quiet',
  'owner.hero.all_quiet_never',
  'owner.hero.one_update',
  'owner.hero.many_updates',
  'owner.hero.and_one_decision',
  'owner.hero.and_many_decisions',
  'activity.title',
  'activity.loading',
  'activity.error',
  'activity.empty.title',
  'activity.empty.hint',
  'activity.load_more',
  'activity.loading_more',
  'activity.filter_all',
  'activity.reply',
  'activity.rel.just_now',
  'activity.rel.mins_ago',
  'activity.rel.hrs_ago',
  'activity.rel.days_ago',
  'owner.needs.empty_clean',
] as const

describe('activity i18n keys', () => {
  it.each(REQUIRED)('en + hi both define %s', (key) => {
    expect(en).toHaveProperty(key)
    expect((en as Record<string, string>)[key].length).toBeGreaterThan(0)
    expect(hi).toHaveProperty(key)
    expect((hi as Record<string, string>)[key].length).toBeGreaterThan(0)
  })
})
