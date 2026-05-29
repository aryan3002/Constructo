import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Components } from './Components'

// Smoke test: the gallery must mount the full kit in BOTH themes without
// crashing, and the two theme surfaces must be present.
describe('Components gallery', () => {
  it('renders both theme surfaces with the full kit', () => {
    const { container } = render(<Components />)

    const surfaces = container.querySelectorAll('[data-theme]')
    const themes = Array.from(surfaces).map((el) => el.getAttribute('data-theme'))
    expect(themes).toContain('site')
    expect(themes).toContain('daylight')

    // A representative component from the kit renders in each theme (x2).
    expect(
      screen.getAllByRole('heading', {
        name: /slab pour completed on tower b/i,
      }).length,
    ).toBeGreaterThanOrEqual(2)

    // Signature EvidenceCard "Show proof" control is present.
    expect(screen.getAllByRole('button', { name: /show proof/i }).length).toBeGreaterThan(0)
  })
})
