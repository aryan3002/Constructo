/**
 * CalmVerify — the OTP "settle", not a spin.
 *
 * After the 6th digit the caller flips us to `checking`: three breathing dots +
 * "Checking…". When the backend confirms, the caller flips us to `verified`: the
 * dots cross-fade out and a sage check DRAWS on + "Verified · welcome in", then —
 * after a calm beat — `onSettled` fires so the screen can route home. No circular
 * spinner anywhere.
 *
 * Reduced motion: the check is shown resolved and `onSettled` still fires after
 * the same calm beat.
 */
import { useEffect, useRef } from 'react'
import { Animated } from 'react-native'

import { DUR, EASE } from '../theme/motionTokens'
import { BreathingDots } from './BreathingDots'
import { DrawnCheck } from './DrawnCheck'
import { Small } from './Typography'
import { useReducedMotion } from './motion'

export type VerifyPhase = 'checking' | 'verified'

export interface CalmVerifyProps {
  phase: VerifyPhase
  checkingLabel?: string
  verifiedLabel?: string
  /** Fired once the verified check has drawn + a settling beat has passed. */
  onSettled?: () => void
  /** Beat (ms) to hold the verified state before `onSettled`. */
  settleHold?: number
  color?: string
}

export function CalmVerify({
  phase,
  checkingLabel = 'Checking…',
  verifiedLabel = 'Verified · welcome in',
  onSettled,
  settleHold = DUR.gentle,
  color = '#3e7a66',
}: CalmVerifyProps) {
  const reduced = useReducedMotion()
  // 0 = checking, 1 = verified. Drives the cross-fade between the two layers.
  const t = useRef(new Animated.Value(0)).current
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (phase !== 'verified') return
    const anim = Animated.timing(t, {
      toValue: 1,
      duration: reduced ? 0 : DUR.default,
      easing: EASE,
      useNativeDriver: true,
    })
    anim.start()
    return () => anim.stop()
  }, [phase, reduced, t])

  // Clear any pending settle timer on unmount (e.g. if routed away early).
  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current)
  }, [])

  // After the check draws, hold a calm beat, then settle (route).
  function handleDrawn() {
    settleTimer.current = setTimeout(() => onSettled?.(), settleHold)
  }

  const checkingOpacity = t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
  const verifiedOpacity = t

  return (
    <Animated.View style={{ minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      {/* Checking layer — breathing dots, fades out as we settle. */}
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', alignItems: 'center', gap: 14, opacity: checkingOpacity }}
      >
        <BreathingDots color={color} />
        <Small muted>{checkingLabel}</Small>
      </Animated.View>

      {/* Verified layer — the drawn check, fades/draws in. */}
      <Animated.View
        pointerEvents="none"
        style={{ alignItems: 'center', gap: 12, opacity: verifiedOpacity }}
      >
        <DrawnCheck size={56} play={phase === 'verified'} color={color} onDrawn={handleDrawn} />
        <Small color={color}>{verifiedLabel}</Small>
      </Animated.View>
    </Animated.View>
  )
}
