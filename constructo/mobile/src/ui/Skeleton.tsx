/**
 * Skeleton — a warm shimmer placeholder, NOT a spinner.
 *
 * Loading should feel like the page is settling into place, not spinning. A
 * skeleton block sits on the warm sand surface while a soft highlight drifts
 * across it (one slow, calm sweep, looping). Pair with the breathing benchmark
 * mark for a full "we're getting it" state.
 *
 * Reduced motion: the static warm block with no sweep (the resolved frame).
 */
import { useEffect, useRef } from 'react'
import { Animated, Easing, View, type ViewStyle, type DimensionValue } from 'react-native'

import { AP } from '../theme/tokens'
import { useReducedMotion } from './motion'

export interface SkeletonProps {
  width?: DimensionValue
  height?: DimensionValue
  radius?: number
  /** Base block colour (defaults to the warm sunken surface). */
  color?: string
  /** Drifting highlight colour. */
  highlight?: string
  style?: ViewStyle
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 8,
  color = AP.surfaceContainer,
  highlight = AP.surfaceLow,
  style,
}: SkeletonProps) {
  const reduced = useReducedMotion()
  const x = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (reduced) return undefined
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: 1,
        duration: 1500,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [reduced, x])

  return (
    <View
      style={[
        { width, height, borderRadius: radius, backgroundColor: color, overflow: 'hidden' },
        style,
      ]}
    >
      {!reduced && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '55%',
            backgroundColor: highlight,
            opacity: x.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.7, 0] }),
            transform: [
              {
                translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-220, 220] }),
              },
            ],
          }}
        />
      )}
    </View>
  )
}
