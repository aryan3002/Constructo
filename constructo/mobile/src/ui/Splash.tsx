/**
 * Splash — "the foundation, set in three seconds."
 *
 * On a sand canvas the benchmark mark BUILDS itself in reading order (level →
 * legs → point), then the "Neev" wordmark and "नींव" tagline fade up, and the
 * whole mark gently scales up + fades as it hands off into the app. Plays ONCE
 * per cold start; calls `onDone` when the handoff completes.
 *
 * Timeline (matches `Neev Motion.dc.html`):
 *   0.5–1.1s  level draws
 *   1.0–1.8s  legs grow up to meet
 *   1.8–2.2s  clay point drops in + settles
 *   ~2.0s     "Neev" wordmark fades up
 *   ~2.3s     "नींव" tagline fades in
 *   ~2.6–2.9s whole mark scales up + fades → onDone
 *
 * Reduced motion: the resolved composition is shown for a calm beat, then a
 * gentle opacity handoff — never the build, never a loop.
 */
import { useEffect, useRef } from 'react'
import { Animated, View } from 'react-native'

import { DUR, EASE } from '../theme/motionTokens'
import { BenchmarkMark } from './BenchmarkMark'
import { useReducedMotion } from './motion'

const SAND = '#f3efe6' // daylight canvas — the splash is always warm sand
const INK = '#2a2519'
const SAGE = '#2f6151' // green-700 — tagline reads calm on sand

export function Splash({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion()

  const word = useRef(new Animated.Value(reduced ? 1 : 0)).current
  const tag = useRef(new Animated.Value(reduced ? 1 : 0)).current
  // Handoff: stageScale 1→1.05, stageFade 1→0.
  const stage = useRef(new Animated.Value(0)).current

  // The wordmark + tagline are sequenced independently of the mark's build so
  // each lands on its own beat (the mark drives itself via `mode="build"`).
  useEffect(() => {
    if (reduced) return undefined
    const word$ = Animated.timing(word, {
      toValue: 1,
      delay: 2000,
      duration: DUR.slow,
      easing: EASE,
      useNativeDriver: true,
    })
    const tag$ = Animated.timing(tag, {
      toValue: 1,
      delay: 2300,
      duration: DUR.slow,
      easing: EASE,
      useNativeDriver: true,
    })
    word$.start()
    tag$.start()
    return () => {
      word$.stop()
      tag$.stop()
    }
  }, [reduced, word, tag])

  // Handoff. On reduced motion this is just a calm hold → gentle fade.
  useEffect(() => {
    const handoff = Animated.timing(stage, {
      toValue: 1,
      delay: reduced ? 900 : 2600,
      duration: reduced ? DUR.gentle : 300,
      easing: EASE,
      useNativeDriver: true,
    })
    handoff.start(({ finished }) => {
      if (finished) onDone()
    })
    return () => handoff.stop()
  }, [reduced, stage, onDone])

  const stageStyle = {
    opacity: stage.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: reduced
      ? undefined
      : [{ scale: stage.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }],
  }

  const wordStyle = {
    opacity: word,
    transform: reduced
      ? undefined
      : [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [9, 0] }) }],
  }

  return (
    <View style={{ flex: 1, backgroundColor: SAND, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ alignItems: 'center' }, stageStyle]}>
        <BenchmarkMark size={112} mode="build" />
        <Animated.Text
          style={[
            {
              marginTop: 28,
              fontFamily: 'Bricolage-Bold',
              fontSize: 40,
              letterSpacing: -0.5,
              color: INK,
            },
            wordStyle,
          ]}
        >
          Neev
        </Animated.Text>
        <Animated.Text
          style={[
            {
              marginTop: 4,
              fontFamily: 'Eczar-SemiBold',
              fontSize: 20,
              color: SAGE,
              opacity: tag,
            },
          ]}
        >
          नींव
        </Animated.Text>
      </Animated.View>
    </View>
  )
}
