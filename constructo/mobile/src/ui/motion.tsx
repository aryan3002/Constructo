/**
 * Calm motion primitives (handoff §3.6). The Daylight surface moves slowly and
 * softly — fades + small rises, 200–320ms, ease-out — and NEVER delays reading
 * critical data. Everything here respects the OS "Reduce Motion" setting: when
 * it is on we keep fades but drop the rise/translate (per §3.6 + §7).
 *
 * Built on React Native's stock `Animated` (no extra dependency); opacity +
 * transform run on the native driver.
 */
import { useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  type ViewProps,
  type ViewStyle,
} from 'react-native'

/**
 * Tracks the OS "Reduce Motion" / `prefers-reduced-motion` accessibility flag,
 * updating live if the user toggles it. Returns `true` when motion should be
 * minimized.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (mounted) setReduced(v)
      })
      .catch(() => undefined)
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => {
      mounted = false
      sub.remove()
    }
  }, [])
  return reduced
}

export interface FadeInUpProps extends ViewProps {
  /** Stagger offset in ms (e.g. index * 40) so a stack rises in sequence. */
  delay?: number
  /** Include the 8px upward rise. Off → fade only (quiet-period cards, §3.6). */
  rise?: boolean
  /** Linear easing instead of ease-out (quiet-period cards: calm, never a pop). */
  linear?: boolean
  /** Duration override (default 240ms — the §3.6 card/section value). */
  duration?: number
  style?: ViewStyle | ViewStyle[]
}

/**
 * Mounts its children with a calm fade (+ optional 8px rise), per §3.6's
 * "Cards / sections" row. With Reduce Motion on, the rise is dropped and only
 * the fade plays. The fade never blocks layout — content is laid out at once and
 * only its opacity/offset animate (native driver).
 */
export function FadeInUp({
  children,
  delay = 0,
  rise = true,
  linear = false,
  duration = 240,
  style,
  ...rest
}: FadeInUpProps) {
  const reduced = useReducedMotion()
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: linear ? Easing.linear : Easing.out(Easing.cubic),
      useNativeDriver: true,
    })
    anim.start()
    return () => anim.stop()
  }, [progress, delay, duration, linear])

  // Keep the fade in both modes; drop the rise when Reduce Motion is on (§3.6).
  const transform =
    rise && !reduced
      ? [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }]
      : undefined

  return (
    <Animated.View style={[{ opacity: progress, transform }, style]} {...rest}>
      {children}
    </Animated.View>
  )
}
