// Tests for the notifications-inbox row routing decision
// (app/(homeowner)/inbox.tsx). Lives under src/ (NOT app/) — Expo Router
// treats every app/ file as a route.
import { routeForNotification } from './inbox_route.util'
import type { AppNotification } from '../api/types'

function notif(overrides: Partial<AppNotification>): AppNotification {
  return {
    id: 'n1',
    type: null,
    title: 't',
    body: 'b',
    data: null,
    created_at: new Date().toISOString(),
    is_unread: true,
    ...overrides,
  }
}

describe('routeForNotification', () => {
  it('routes a photo notification to photos', () => {
    expect(routeForNotification(notif({ type: 'photo' }))).toBe('/(homeowner)/photos')
  })

  it('routes a request notification to requests', () => {
    expect(routeForNotification(notif({ type: 'request' }))).toBe('/(homeowner)/requests')
  })

  it('routes update and weekly_summary notifications to updates', () => {
    expect(routeForNotification(notif({ type: 'update' }))).toBe('/(homeowner)/updates')
    expect(routeForNotification(notif({ type: 'weekly_summary' }))).toBe('/(homeowner)/updates')
  })

  it('routes a design notification to its data.url, prefixed', () => {
    expect(
      routeForNotification(notif({ type: 'design', data: { url: '/design/brief' } })),
    ).toBe('/(homeowner)/design/brief')
  })

  it('prefixes a design url missing its leading slash', () => {
    expect(
      routeForNotification(notif({ type: 'design', data: { url: 'design/brief' } })),
    ).toBe('/(homeowner)/design/brief')
  })

  it('falls back to /design when a design notification has no url', () => {
    expect(routeForNotification(notif({ type: 'design', data: {} }))).toBe('/(homeowner)/design')
    expect(routeForNotification(notif({ type: 'design', data: null }))).toBe('/(homeowner)/design')
  })

  it('returns null for an unknown type', () => {
    expect(routeForNotification(notif({ type: 'mystery' }))).toBeNull()
    expect(routeForNotification(notif({ type: null }))).toBeNull()
  })
})
