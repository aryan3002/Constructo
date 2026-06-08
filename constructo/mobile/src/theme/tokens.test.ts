import { severityToStatus, STATUS, STATUS_TINT, THEMES } from './tokens'

describe('design tokens', () => {
  it('ships both themes', () => {
    expect(THEMES.blueprint.name).toBe('blueprint')
    expect(THEMES.daylight.name).toBe('daylight')
  })

  it('keeps the shared status spine on the contractor (Blueprint) surface', () => {
    expect(THEMES.blueprint.colors.ok).toBe(STATUS.ok)
    expect(THEMES.blueprint.colors.risk).toBe(STATUS.risk)
    expect(THEMES.blueprint.colors.infoTint).toBe(STATUS_TINT.infoTint)
  })

  it('gives the homeowner (Daylight) its own Direction-C spine — sage/amber/red, no blue', () => {
    // on-track → green-700; needs-you → amber-700; delay → red-600.
    expect(THEMES.daylight.colors.ok).toBe('#2f6151')
    expect(THEMES.daylight.colors.warn).toBe('#7d5a13')
    expect(THEMES.daylight.colors.risk).toBe('#a4382a')
    // info/progress is a disciplined neutral (no blue hue), unlike Blueprint.
    expect(THEMES.daylight.colors.info).toBe('#6a6047')
    expect(THEMES.daylight.colors.info).not.toBe(STATUS.info)
  })

  it('uses the residential Daylight radius and the bolder Blueprint radius', () => {
    expect(THEMES.daylight.radii.card).toBe(22)
    expect(THEMES.blueprint.radii.card).toBe(8)
  })

  it('keeps the brand primaries (Blueprint amber, Daylight Direction-C sage green)', () => {
    expect(THEMES.blueprint.colors.accent).toBe('#f2a100')
    // Daylight uses the locked Direction C "Blend" sage-green primary.
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
