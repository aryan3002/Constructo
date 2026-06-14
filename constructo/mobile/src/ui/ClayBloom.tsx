/**
 * ClayBloom — the warm "milestone reached" gesture.
 *
 * A clay ring blooms outward from a point and fades, once — the dignified
 * celebration for a milestone or a happy status change (clay is celebration,
 * NEVER alarm). One bloom, then stillness. Pairs with `DrawnCheck` (confirmed)
 * and `FadeInUp` (gentle rise) as the status-change gesture set.
 *
 * Wrap it around the thing being celebrated (a milestone icon, a status pill);
 * the ring renders behind the children. `play` toggles the bloom.
 *
 * Reduced motion: no bloom — the children render still (the resolved frame).
 */
import { useEffect, useRef } from 'react'
import { Animated, Easing, View, type ViewStyle } from 'react-native'

import { useReducedMotion } from './motion'

const CLAY = '#ae5635'

export interface ClayBloomProps {
  children?: React.ReactNode
  /** Trigger the bloom. Defaults to true (blooms on mount). */
  play?: boolean
  /** Diameter of the bloom ring at rest (the children sit inside this). */
  size?: number
  color?: string
  onDone?: () => void
  style?: ViewStyle
}

export function ClayBloom({
  children,
  play = true,
  size = 56,
  color = CLAY,
  onDone,
  style,
}: ClayBloomProps) {
  const reduced = useReducedMotion()
  const t = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!play || reduced) return undefined
    t.setValue(0)
    const anim = Animated.timing(t, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    })
    anim.start(({ finished }) => {
      if (finished) onDone?.()
    })
    return () => anim.stop()
  }, [play, reduced, t, onDone])

  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
      {!reduced && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 2,
            borderColor: color,
            // .4 → 1.55 scale, fading in then out (nvBloom curve).
            opacity: t.interpolate({
              inputRange: [0, 0.1, 0.34, 0.72, 1],
              outputRange: [0, 0, 0.5, 0, 0],
            }),
            transform: [
              { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.55] }) },
            ],
          }}
        />
      )}
      {children}
    </View>
  )
}
