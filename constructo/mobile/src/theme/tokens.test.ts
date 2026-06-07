import { severityToStatus, STATUS, STATUS_TINT, THEMES } from './tokens'

describe('design tokens', () => {
  it('ships both themes', () => {
    expect(THEMES.blueprint.name).toBe('blueprint')
    expect(THEMES.daylight.name).toBe('daylight')
  })

  it('shares the status spine across themes', () => {
    expect(THEMES.blueprint.colors.ok).toBe(STATUS.ok)
    expect(THEMES.daylight.colors.ok).toBe(STATUS.ok)
    expect(THEMES.blueprint.colors.risk).toBe(THEMES.daylight.colors.risk)
  })

  it('shares the info tint across themes', () => {
    expect(THEMES.blueprint.colors.infoTint).toBe(STATUS_TINT.infoTint)
    expect(THEMES.daylight.colors.infoTint).toBe(STATUS_TINT.infoTint)
  })

  it('uses the softer Daylight radius and the bolder Blueprint radius', () => {
    expect(THEMES.daylight.radii.card).toBe(16)
    expect(THEMES.blueprint.radii.card).toBe(8)
  })

  it('keeps the brand primaries (Blueprint amber, Daylight Calm Pine)', () => {
    expect(THEMES.blueprint.colors.accent).toBe('#f2a100')
    // Daylight uses the "Calm Cockpit" Calm Pine primary (§3.1).
    expect(THEMES.daylight.colors.accent).toBe('#1e7a63')
  })

  it('adds the Warm Clay celebration accent + quiet tone to Daylight', () => {
    expect(THEMES.daylight.colors.secondary).toBe('#c5683b')
    expect(THEMES.daylight.colors.secondaryContainer).toBe('#f4d9c6')
    expect(THEMES.daylight.colors.quiet).toBe('#8c8a82')
    // Warm Paper canvas — never pure white.
    expect(THEMES.daylight.colors.bg).toBe('#faf6ee')
  })

  it('maps backend severity onto the status spine', () => {
    expect(severityToStatus('high')).toBe('risk')
    expect(severityToStatus('med')).toBe('warn')
    expect(severityToStatus('low')).toBe('info')
    expect(severityToStatus('???')).toBe('info')
  })
})
