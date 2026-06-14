/**
 * BreathingDots — three dots that BREATHE, never race.
 *
 * The calm stand-in for a spinner: used while the OTP is "Checking…" and as the
 * assistant's "thinking" indicator. Each dot eases in and out on a gentle,
 * staggered sine — opacity + a small scale — so the row feels like a held
 * breath, not a chase. Native driver (opacity + transform).
 *
 * Reduced motion: the dots hold at a calm, evenly-dim resting state with no
 * loop.
 */
import { useEffect, useRef } from 'react'
import { Animated, Easing, View } from 'react-native'

import { useReducedMotion } from './motion'

export interface BreathingDotsProps {
  color?: string
  /** Dot diameter (px). */
  size?: number
  /** Gap between dots (px). */
  gap?: number
  count?: number
}

export function BreathingDots({
  color = '#3e7a66',
  size = 8,
  gap = 7,
  count = 3,
}: BreathingDotsProps) {
  const reduced = useReducedMotion()
  // One shared clock; each dot reads it at a phase offset so the breath travels.
  const clock = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (reduced) return undefined
    const loop = Animated.loop(
      Animated.timing(clock, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [reduced, clock])

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      {Array.from({ length: count }).map((_, i) => {
        if (reduced) {
          return (
            <View
              key={i}
              style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.5 }}
            />
          )
        }
        // Phase-shift each dot a slice of the cycle so the breath ripples across.
        const phase = i / count
        const wave = clock.interpolate({
          inputRange: [0, 1],
          outputRange: [phase, phase + 1],
        })
        // Map the wrapped phase through a sine-like up/down via a triangle of stops.
        const opacity = wave.interpolate({
          inputRange: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
          outputRange: [0.3, 1, 0.3, 0.3, 0.3, 1, 0.3, 0.3, 0.3],
          extrapolate: 'extend',
        })
        const scale = wave.interpolate({
          inputRange: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
          outputRange: [0.85, 1.1, 0.85, 0.85, 0.85, 1.1, 0.85, 0.85, 0.85],
          extrapolate: 'extend',
        })
        return (
          <Animated.View
            key={i}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: color,
              opacity,
              transform: [{ scale }],
            }}
          />
        )
      })}
    </View>
  )
}
