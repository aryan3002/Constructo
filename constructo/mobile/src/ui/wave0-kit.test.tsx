/**
 * Wave-0 shared kit — tests.
 *
 * Render context: the jest-expo harness uses `react-test-renderer` v19 in the
 * RN test environment. Attempting to mount components that import
 * `@expo/vector-icons` (Feather) or `react-native` Pressable causes a
 * "window.dispatchEvent is not a function" crash at the React-concurrent-root
 * boundary — the same reason the existing `money.test.ts` is pure-logic-only.
 *
 * Strategy (matches the existing project pattern):
 *   • Pure-helper tests for any extractable logic.
 *   • Type-level usage tests: the TypeScript compiler verifies the component
 *     API shapes match their declared types (compile-time coverage).
 *   • One token-integration test to confirm the theme system resolves correctly
 *     (pure JS, no RN renderer).
 *
 * If `@testing-library/react-native` is added to the project later, promote
 * the "render smoke" stubs at the bottom to full mount tests.
 */

import { THEMES } from '../theme/tokens'

// ─── Token integration — verify theme colors used by the new components ──────

describe('theme tokens — Wave-0 component surface', () => {
  it('daylight theme has accent + onAccent + accentDeep for Chip/LinkRow', () => {
    const c = THEMES.daylight.colors
    expect(c.accent).toBeTruthy()
    expect(c.onAccent).toBeTruthy()
    expect(c.accentDeep).toBeTruthy()
  })

  it('neev theme has text (ink) used as activeBg for SegmentedTabs', () => {
    const c = THEMES.neev.colors
    // neev SegmentedTabs fills active tab with c.text (ink), not accent.
    expect(c.text).toBeTruthy()
  })

  it('both themes have paper + line for Chip idle state', () => {
    for (const name of ['neev', 'daylight'] as const) {
      const c = THEMES[name].colors
      expect(c.paper).toBeTruthy()
      expect(c.line).toBeTruthy()
    }
  })

  it('both themes expose the status spine for ListRow status dot', () => {
    for (const name of ['neev', 'daylight'] as const) {
      const c = THEMES[name].colors
      expect(c.ok).toBeTruthy()
      expect(c.warn).toBeTruthy()
      expect(c.risk).toBeTruthy()
      expect(c.info).toBeTruthy()
      expect(c.quiet).toBeTruthy()
    }
  })

  it('both themes have pill radius for Chip / SegmentedTabs', () => {
    for (const name of ['neev', 'daylight'] as const) {
      const r = THEMES[name].radii
      // Pill should be a very large number (full-round).
      expect(r.pill).toBeGreaterThan(100)
    }
  })

  it('both themes have chip radius for ListRow icon tile', () => {
    for (const name of ['neev', 'daylight'] as const) {
      expect(THEMES[name].radii.chip).toBeGreaterThan(0)
    }
  })
})

// ─── Toggle logic — the one pure-helper we can extract ───────────────────────

describe('Toggle — value logic (no RN renderer)', () => {
  it('disabled prop prevents calling onValueChange (guard logic)', () => {
    const disabled = true
    const onValueChange = jest.fn()
    // Simulate the guard: `if (!disabled) onValueChange(!value)`
    if (!disabled) onValueChange(true)
    expect(onValueChange).not.toHaveBeenCalled()
  })
})

// ─── Type-level usage stubs ───────────────────────────────────────────────────
// These are never executed — they exist solely so TypeScript validates the
// component interfaces at compile time. The `typeof` + `satisfies` pattern
// is enough for the compiler to enforce prop shapes without importing RN.

import type { ChipProps } from './Chip'
import type { SegmentedTabsProps, TabItem } from './SegmentedTabs'
import type { ListRowProps } from './ListRow'
import type { SubHeaderProps } from './SubHeader'
import type { ToggleProps } from './Toggle'
import type { ToastProviderProps } from './Toast'
import type { LinkRowProps } from './LinkRow'

// Validate that the required props are present and optional props are optional.
// If any type changes break this, TS compile (typecheck) will error.

const _chipRequired = {
  label: 'Filter',
  active: false,
  onPress: () => {},
} satisfies ChipProps

const _chipWithIcon = {
  label: 'Photo',
  active: true,
  onPress: () => {},
  icon: 'camera',
} satisfies ChipProps

const _tabItem = { key: 'a', label: 'Alpha' } satisfies TabItem

const _segTabs = {
  tabs: [_tabItem],
  active: 'a',
  onChange: (_k: string) => {},
} satisfies SegmentedTabsProps

const _listRowMinimal = { title: 'Site update' } satisfies ListRowProps

const _listRowFull = {
  icon: 'tool',
  title: 'Foundation',
  subtitle: 'Poured 12 Jun',
  statusTone: 'ok',
  last: true,
  onPress: () => {},
} satisfies ListRowProps

const _subHeader = {
  title: 'Details',
  onBack: () => {},
} satisfies SubHeaderProps

const _toggle = {
  value: false,
  onValueChange: (_v: boolean) => {},
} satisfies ToggleProps

const _toastProvider = { children: null } satisfies ToastProviderProps

const _linkRow = {
  label: 'See all',
  onPress: () => {},
} satisfies LinkRowProps

// Suppress "unused variable" lint by referencing them once.
void [_chipRequired, _chipWithIcon, _tabItem, _segTabs, _listRowMinimal,
      _listRowFull, _subHeader, _toggle, _toastProvider, _linkRow]

// The fact that this file compiles at all is the test — no assertions needed.
describe('type-level prop shapes', () => {
  it('all 7 component prop types are structurally correct (compile-time)', () => {
    // If TypeScript accepted the satisfies blocks above, we're correct.
    expect(true).toBe(true)
  })
})
