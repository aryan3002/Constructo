/**
 * Calm motion tokens — the one ease + duration scale the whole app shares.
 *
 * The guiding rule: motion REASSURES, it never entertains. Things SETTLE — no
 * racing spinners, no bounce/spring, no fake progress. One ease-out curve
 * (fast in, slow settle), a short duration ladder, and a single press scale.
 *
 * Everything that loops or decorates must be wrapped so Reduce Motion resolves
 * it to the final, fully-settled frame (see `useReducedMotion`).
 */
import { Easing } from 'react-native'

/** The calm ease — cubic-bezier(.22,.61,.36,1). Fast to settle, never a pop. */
export const EASE = Easing.bezier(0.22, 0.61, 0.36, 1)

/** Duration ladder (ms). */
export const DUR = {
  /** tap / immediate feedback */
  tap: 140,
  /** default transition (most fades + rises) */
  default: 220,
  /** slow — role cards, cross-fades */
  slow: 360,
  /** gentle — hero settles, the splash handoff */
  gentle: 600,
} as const

/** Press = scale(.97) only — no bounce, no spring. */
export const PRESS_SCALE = 0.97
