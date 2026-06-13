/**
 * Toggle — a themed switch with animated thumb.
 *
 * Track colors:
 *   on  → accent (sage on daylight, marigold on neev)
 *   off → paper bg + hairline border (no harsh grey)
 *
 * Thumb: always white with a soft ink shadow.
 * Animation: Animated.Value slides the thumb; respects reduced motion (no
 * animation when Reduce Motion is on — jump-cut only).
 *
 * Minimum tap target: 48×48 px (wrapping Pressable grows the hot zone beyond
 * the 48×28 track visuals).
 */
import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Animated, Pressable, View, type ViewStyle } from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import { TAP } from '../theme/tokens'

const TRACK_W = 48
const TRACK_H = 28
const THUMB = 22
const TRAVEL = TRACK_W - THUMB - 6 // 3px padding each side

export interface ToggleProps {
  value: boolean
  onValueChange: (next: boolean) => void
  disabled?: boolean
  style?: ViewStyle
}

export function Toggle({ value, onValueChange, disabled = false, style }: ToggleProps) {
  const { theme } = useTheme()
  const c = theme.colors

  // Animated position of the thumb (0 = off / left, TRAVEL = on / right).
  const thumbX = useRef(new Animated.Value(value ? TRAVEL : 0)).current
  // Separate animated value for track color crossfade.
  const trackProgress = useRef(new Animated.Value(value ? 1 : 0)).current

  useEffect(() => {
    let active = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (!active) return
        const toValue = value ? 1 : 0
        if (reduced) {
          thumbX.setValue(value ? TRAVEL : 0)
          trackProgress.setValue(toValue)
        } else {
          Animated.parallel([
            Animated.spring(thumbX, {
              toValue: value ? TRAVEL : 0,
              useNativeDriver: true,
              tension: 260,
              friction: 24,
            }),
            Animated.timing(trackProgress, {
              toValue,
              duration: 180,
              useNativeDriver: false,
            }),
          ]).start()
        }
      })
      .catch(() => {
        // If we can't query reduced motion, just set the value directly.
        thumbX.setValue(value ? TRAVEL : 0)
        trackProgress.setValue(value ? 1 : 0)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Interpolate the track background between off-color and on-color.
  const trackBg = trackProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [c.paper, c.accent],
  })

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      style={({ pressed }) => [
        {
          width: TAP,
          height: TAP,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {/* Track */}
      <Animated.View
        style={{
          width: TRACK_W,
          height: TRACK_H,
          borderRadius: TRACK_H / 2,
          backgroundColor: trackBg,
          borderWidth: 1,
          borderColor: value ? 'transparent' : c.line,
          justifyContent: 'center',
          paddingHorizontal: 3,
        }}
      >
        {/* Thumb */}
        <Animated.View
          style={{
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            backgroundColor: '#ffffff',
            transform: [{ translateX: thumbX }],
            shadowColor: c.text,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.28,
            shadowRadius: 3,
            elevation: 2,
          }}
        />
      </Animated.View>
    </Pressable>
  )
}
