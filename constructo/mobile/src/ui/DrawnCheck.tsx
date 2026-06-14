/**
 * DrawnCheck — a single, dignified check that DRAWS itself on.
 *
 * The settle gesture for a confirmed thing (OTP verified, an approval, a status
 * that lands "ok"). A soft sage disc fades in, then the tick strokes on with the
 * calm ease — one stroke, then stillness. Never a spinning ring, never a pop.
 *
 * `play` toggles the draw; `onDrawn` fires when the stroke finishes (so a caller
 * can hold a beat, then route). Reduced motion shows the finished tick at once.
 */
import { useEffect, useRef } from 'react'
import { Animated, Easing } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'

import { DUR, EASE } from '../theme/motionTokens'
import { useReducedMotion } from './motion'

const AnimatedPath = Animated.createAnimatedComponent(Path)

// Geometric length of the tick "M14 24.5 L21 31.5 L34 17" (rn-svg lacks
// pathLength): √(7²+7²) + √(13²+14.5²) ≈ 9.90 + 19.47 ≈ 29.4.
const CHECK_LEN = 29.4

export interface DrawnCheckProps {
  size?: number
  /** Start drawing. Defaults to true (draws on mount). */
  play?: boolean
  /** Stroke + disc colour. */
  color?: string
  /** Soft disc behind the tick. */
  discColor?: string
  onDrawn?: () => void
}

export function DrawnCheck({
  size = 56,
  play = true,
  color = '#3e7a66',
  discColor = 'rgba(62,122,102,0.12)',
  onDrawn,
}: DrawnCheckProps) {
  const reduced = useReducedMotion()
  const draw = useRef(new Animated.Value(reduced ? 1 : 0)).current
  const disc = useRef(new Animated.Value(reduced ? 1 : 0)).current

  useEffect(() => {
    if (!play) return undefined
    if (reduced) {
      draw.setValue(1)
      disc.setValue(1)
      const id = setTimeout(() => onDrawn?.(), 60)
      return () => clearTimeout(id)
    }
    const discIn = Animated.timing(disc, {
      toValue: 1,
      duration: DUR.default,
      easing: EASE,
      useNativeDriver: true,
    })
    const stroke = Animated.timing(draw, {
      toValue: 1,
      delay: 120,
      duration: DUR.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // strokeDashoffset → JS driver
    })
    discIn.start()
    stroke.start(({ finished }) => {
      if (finished) onDrawn?.()
    })
    return () => {
      discIn.stop()
      stroke.stop()
    }
  }, [play, reduced, draw, disc, onDrawn])

  const offset = draw.interpolate({ inputRange: [0, 1], outputRange: [CHECK_LEN, 0] })

  return (
    <Animated.View style={{ width: size, height: size, opacity: disc }}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Circle cx={24} cy={24} r={23} fill={discColor} />
        <AnimatedPath
          d="M14 24.5 L21 31.5 L34 17"
          stroke={color}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={CHECK_LEN}
          strokeDashoffset={offset}
        />
      </Svg>
    </Animated.View>
  )
}
