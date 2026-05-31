import { severityToStatus, STATUS, THEMES } from './tokens'

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

  it('uses the softer Daylight radius and the bolder Blueprint radius', () => {
    expect(THEMES.daylight.radii.card).toBe(16)
    expect(THEMES.blueprint.radii.card).toBe(8)
  })

  it('keeps the brand primaries (Blueprint amber, Daylight teal-green)', () => {
    expect(THEMES.blueprint.colors.accent).toBe('#f2a100')
    // Daylight uses the "Architectural Precision" deep teal-green primary.
    expect(THEMES.daylight.colors.accent).toBe('#214b49')
  })

  it('maps backend severity onto the status spine', () => {
    expect(severityToStatus('high')).toBe('risk')
    expect(severityToStatus('med')).toBe('warn')
    expect(severityToStatus('low')).toBe('info')
    expect(severityToStatus('???')).toBe('info')
  })
})
