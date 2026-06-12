import { severityToStatus, STATUS, THEMES } from './tokens'

describe('design tokens', () => {
  it('ships both themes', () => {
    expect(THEMES.neev.name).toBe('neev')
    expect(THEMES.daylight.name).toBe('daylight')
  })

  it('gives the contractor (Neev "Site Register") surface its own warm spine', () => {
    expect(THEMES.neev.colors.ok).toBe('#2f7d52') // Neev ok-600
    expect(THEMES.neev.colors.risk).toBe('#b23a2e') // Neev brick red
    expect(THEMES.neev.colors.ok).not.toBe(STATUS.ok)
  })

  it('gives the homeowner (Daylight) its own Direction-C spine — sage/amber/red, no blue', () => {
    // on-track → green-700; needs-you → amber-700; delay → red-600.
    expect(THEMES.daylight.colors.ok).toBe('#2f6151')
    expect(THEMES.daylight.colors.warn).toBe('#7d5a13')
    expect(THEMES.daylight.colors.risk).toBe('#a4382a')
    // info/progress is a disciplined neutral (no blue hue), unlike Neev.
    expect(THEMES.daylight.colors.info).toBe('#6a6047')
    expect(THEMES.daylight.colors.info).not.toBe(STATUS.info)
  })

  it('uses the residential Daylight radius and the bolder Neev radius', () => {
    expect(THEMES.daylight.radii.card).toBe(22)
    expect(THEMES.neev.radii.card).toBe(14)
  })

  it('carries the brand primaries (Neev marigold, Daylight Direction-C sage)', () => {
    expect(THEMES.neev.colors.accent).toBe('#f0a21f') // Neev marigold-500
    expect(THEMES.daylight.colors.accent).toBe('#3e7a66')
  })

  it('carries the Direction-C sand canvas + warm-clay celebration accent on Daylight', () => {
    // Warm SAND canvas — never pure white.
    expect(THEMES.daylight.colors.bg).toBe('#f3efe6')
    // Clay = celebration / milestones only.
    expect(THEMES.daylight.colors.secondary).toBe('#ae5635')
    expect(THEMES.daylight.colors.secondaryContainer).toBe('#efdccb')
    // Quiet-period grey — calm, never red.
    expect(THEMES.daylight.colors.quiet).toBe('#8c7f66')
  })

  it('maps backend severity onto the status spine', () => {
    expect(severityToStatus('high')).toBe('risk')
    expect(severityToStatus('med')).toBe('warn')
    expect(severityToStatus('low')).toBe('info')
    expect(severityToStatus('???')).toBe('info')
  })
})
