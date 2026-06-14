/**
 * BenchmarkMark — the surveyor's-benchmark app mark, built in reading order.
 *
 * The mark is three strokes set on a level: a LEVEL (baseline bar), a PEAK
 * (chevron whose two legs grow UP to meet), and a POINT (clay dot that drops in
 * above and settles). It is the brand's "foundation, set in three seconds"
 * gesture — motion that REASSURES (it settles, it never spins or bounces).
 *
 * Modes:
 *   - `build`   — draws itself once (level → legs → point), then calls `onBuilt`.
 *                 Used by the splash.
 *   - `static`  — the fully-resolved frame, no motion. The reduced-motion and
 *                 "already built" state.
 *   - `breathe` — the resolved frame with a slow, gentle breath (loading / the
 *                 "thinking" mark). Native-driver opacity+scale only.
 *
 * Reduced motion: `build` resolves instantly to the final frame and still fires
 * `onBuilt`; `breathe` holds the calm resolved frame with no loop. There is
 * never a flash or a loop when Reduce Motion is on (constraint §).
 *
 * Geometry (viewBox 0 0 100 100):
 *   level = M26 78 L74 78           (stroke-width 8,   round)
 *   legs  = M29 67 L50 45 · M71 67 L50 45  (stroke-width 8.5, round)
 *   point = circle cx50 cy28 r5.7   (clay)
 *
 * Strokes draw on via `strokeDashoffset` (pathLength=100). The point "drops"
 * by animating cy (21→28, i.e. translateY −7→0) + r (2.85→5.7, i.e. scale
 * .5→1) + opacity, which react-native-svg animates cleanly on the JS driver.
 */
import { useEffect, useRef } from 'react'
import { Animated, Easing } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'

import { EASE } from '../theme/motionTokens'
import { useReducedMotion } from './motion'

const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/** Sage = level + peak; clay = point. Defaults match the brand mark. */
const SAGE = '#3E7A66'
const CLAY = '#AE5635'

/** The point's resolved geometry — and its "above + small" start. */
const POINT_CY = 28
const POINT_R = 5.7
const POINT_RISE = 7 // starts translateY(-7) above its level

// Geometric stroke lengths (rn-svg lacks pathLength), so the dash exactly covers
// each stroke: level = |74−26| = 48; each leg = √(21² + 22²) ≈ 30.42.
const LEVEL_LEN = 48
const LEG_LEN = 30.42

export type BenchmarkMode = 'build' | 'static' | 'breathe'

export interface BenchmarkMarkProps {
  size?: number
  mode?: BenchmarkMode
  /** Fired when a `build` finishes (≈2.2s in, or immediately on reduced motion). */
  onBuilt?: () => void
  sage?: string
  clay?: string
}

export function BenchmarkMark({
  size = 96,
  mode = 'static',
  onBuilt,
  sage = SAGE,
  clay = CLAY,
}: BenchmarkMarkProps) {
  const reduced = useReducedMotion()

  // One progress value per element (0 → 1). `static` resolves to 1 at rest; the
  // `build` timeline animates them in sequence with the calm ease-out.
  const resolved = mode === 'static' || (mode === 'build' && reduced) || mode === 'breathe'
  const level = useRef(new Animated.Value(resolved ? 1 : 0)).current
  const legs = useRef(new Animated.Value(resolved ? 1 : 0)).current
  const point = useRef(new Animated.Value(resolved ? 1 : 0)).current

  // Whole-mark breath (native driver) — only used in `breathe` mode.
  const breath = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (mode === 'build') {
      if (reduced) {
        // Resolve instantly to the calm end-state, then hand off. No draw-on.
        level.setValue(1)
        legs.setValue(1)
        point.setValue(1)
        const id = setTimeout(() => onBuilt?.(), 80)
        return () => clearTimeout(id)
      }
      // Reading order: level (0.5–1.1s) → legs (1.0–1.8s) → point (1.8–2.2s).
      const seq = Animated.parallel([
        Animated.timing(level, {
          toValue: 1,
          delay: 500,
          duration: 600,
          easing: EASE,
          useNativeDriver: false,
        }),
        Animated.timing(legs, {
          toValue: 1,
          delay: 1000,
          duration: 800,
          easing: EASE,
          useNativeDriver: false,
        }),
        Animated.timing(point, {
          toValue: 1,
          delay: 1800,
          duration: 400,
          easing: EASE,
          useNativeDriver: false,
        }),
      ])
      seq.start(({ finished }) => {
        if (finished) onBuilt?.()
      })
      return () => seq.stop()
    }
    return undefined
  }, [mode, reduced, level, legs, point, onBuilt])

  useEffect(() => {
    if (mode === 'breathe' && !reduced) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(breath, {
            toValue: 1,
            duration: 1400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(breath, {
            toValue: 0,
            duration: 1400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      )
      loop.start()
      return () => loop.stop()
    }
    return undefined
  }, [mode, reduced, breath])

  // Draw-on: offset = full length (hidden) → 0 (drawn).
  const levelOffset = level.interpolate({ inputRange: [0, 1], outputRange: [LEVEL_LEN, 0] })
  const legsOffset = legs.interpolate({ inputRange: [0, 1], outputRange: [LEG_LEN, 0] })

  // Point drop: cy 21→28, r 2.85→5.7, opacity 0→1.
  const pointCy = point.interpolate({
    inputRange: [0, 1],
    outputRange: [POINT_CY - POINT_RISE, POINT_CY],
  })
  const pointR = point.interpolate({ inputRange: [0, 1], outputRange: [POINT_R * 0.5, POINT_R] })

  // Breath wrapper (native driver) — gentle, never a pop.
  const breatheStyle =
    mode === 'breathe' && !reduced
      ? {
          opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
          transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.03] }) }],
        }
      : null

  return (
    <Animated.View style={[{ width: size, height: size }, breatheStyle]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {/* LEVEL — the baseline bar, drawn first. */}
        <AnimatedPath
          d="M26 78 L74 78"
          stroke={sage}
          strokeWidth={8}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={LEVEL_LEN}
          strokeDashoffset={levelOffset}
        />
        {/* PEAK — two legs grow UP from the baseline to meet at the apex. */}
        <AnimatedPath
          d="M29 67 L50 45"
          stroke={sage}
          strokeWidth={8.5}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={LEG_LEN}
          strokeDashoffset={legsOffset}
        />
        <AnimatedPath
          d="M71 67 L50 45"
          stroke={sage}
          strokeWidth={8.5}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={LEG_LEN}
          strokeDashoffset={legsOffset}
        />
        {/* POINT — the clay dot drops in above and settles. */}
        <AnimatedCircle cx={50} cy={pointCy} r={pointR} fill={clay} opacity={point} />
      </Svg>
    </Animated.View>
  )
}
