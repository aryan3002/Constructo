/**
 * SettleBar — the honest time-bar that REPLACES the banned percentage ring.
 *
 * Doctrine ([[01 - Design System]], Decision Log, Hard Rule #4): the homeowner
 * surface must NEVER show a false-precision completion number. "A ring stuck at
 * 63% during normal curing reads as *stalled* → anxiety." So this draws a calm
 * horizontal track filled by ELAPSED TIME (started → handover) — never a
 * percentage label — with the two endpoint dates and an optional tick at the
 * next milestone's expected window.
 *
 * Time elapsed ≠ work stalled: the fill says "you're about here on the journey,"
 * and the warm sentence the caller renders below explains the current phase.
 *
 * Pure/presentational (colors passed in, mirrors ProgressRing) so it is trivial
 * to reason about and reuse.
 */
import { useEffect, useRef } from 'react'
import { Animated, Easing, View } from 'react-native'

import { AP } from '../theme/tokens'
import { Micro } from './Typography'
import { useReducedMotion } from './motion'

export interface SettleBarProps {
  /** 0..1 — elapsed fraction of (started → handover). Drives FILL WIDTH only;
   *  it is NEVER rendered as a number. */
  fraction: number
  /** Left endpoint label, e.g. "Started 14 Jan". */
  startLabel: string
  /** Right endpoint label, e.g. "Handover ~Nov". */
  endLabel: string
  /** Optional 0..1 position of a tick marking the next milestone's expected
   *  window. Omitted when there is no scheduled next milestone. */
  tickFraction?: number | null
  /** Fill + tick color (the deep-teal accent). */
  color: string
  /** Unfilled track color. */
  trackColor: string
  /** Muted label color for the endpoint dates. */
  labelColor?: string
  /** Warm "you-are-here" marker color (Direction C: clay). Pass null to hide. */
  markerColor?: string | null
  height?: number
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

export function SettleBar({
  fraction,
  startLabel,
  endLabel,
  tickFraction,
  color,
  trackColor,
  labelColor,
  markerColor = AP.clayMarker,
  height = 12,
}: SettleBarProps) {
  const fill = clamp01(fraction)
  const tick = tickFraction == null ? null : clamp01(tickFraction)

  // §3.6: the fill grows in (300ms ease-out) on data load; Reduce Motion → snap.
  const reduced = useReducedMotion()
  const grow = useRef(new Animated.Value(reduced ? 1 : 0)).current
  useEffect(() => {
    if (reduced) {
      grow.setValue(1)
      return
    }
    const anim = Animated.timing(grow, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      // width is a layout prop → cannot use the native driver.
      useNativeDriver: false,
    })
    anim.start()
    return () => anim.stop()
  }, [grow, reduced, fill])
  const fillWidth = grow.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', `${fill * 100}%`],
  })

  return (
    <View style={{ gap: 8 }}>
      {/* Track */}
      <View
        style={{
          height,
          borderRadius: height / 2,
          backgroundColor: trackColor,
          overflow: 'hidden',
          justifyContent: 'center',
        }}
      >
        {/* Elapsed-time fill (grows in on load; never a percentage label) */}
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: fillWidth,
            borderRadius: height / 2,
            backgroundColor: color,
          }}
        />
        {/* Next-milestone tick (a thin upright marker, never a number) */}
        {tick != null ? (
          <View
            style={{
              position: 'absolute',
              left: `${tick * 100}%`,
              top: -3,
              bottom: -3,
              width: 2,
              marginLeft: -1,
              borderRadius: 1,
              backgroundColor: color,
              opacity: 0.55,
            }}
          />
        ) : null}
      </View>

      {/* Warm "you-are-here" marker (Direction C: clay dot with a soft white ring),
          sitting on the fill edge — the signature of position-in-TIME, never a %. */}
      {markerColor != null ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: height / 2 - 9,
            left: `${fill * 100}%`,
            width: 18,
            height: 18,
            marginLeft: -9,
            borderRadius: 9,
            backgroundColor: markerColor,
            borderWidth: 3,
            borderColor: AP.onDark,
          }}
        />
      ) : null}

      {/* Endpoint dates — the only text on the bar; no completion number. */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Micro color={labelColor}>{startLabel}</Micro>
        <Micro color={labelColor}>{endLabel}</Micro>
      </View>
    </View>
  )
}
