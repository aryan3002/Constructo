// Tests for the design-push routing decision (app/_layout.tsx notification
// response listener). Lives under src/ (NOT app/) — Expo Router treats every
// app/ file as a route.
import { designPushRoute } from './design_route.util'

describe('designPushRoute', () => {
  it('routes a designer-audience design push to the architect brief', () => {
    expect(
      designPushRoute({ type: 'design', audience: 'designer', url: '/anything' }),
    ).toBe('/(contractor)/architect/brief')
  })

  it('routes a homeowner design push to the prefixed url', () => {
    expect(designPushRoute({ type: 'design', url: '/design/brief' })).toBe(
      '/(homeowner)/design/brief',
    )
  })

  it('prefixes a url missing its leading slash', () => {
    expect(designPushRoute({ type: 'design', url: 'design/brief' })).toBe(
      '/(homeowner)/design/brief',
    )
  })

  it('falls back to /design when url is missing', () => {
    expect(designPushRoute({ type: 'design' })).toBe('/(homeowner)/design')
  })

  it('returns null for a non-design push', () => {
    expect(designPushRoute({ type: 'photo' })).toBeNull()
  })

  it('returns null for undefined data', () => {
    expect(designPushRoute(undefined)).toBeNull()
  })
})
