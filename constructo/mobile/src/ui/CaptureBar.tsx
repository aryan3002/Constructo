/**
 * CaptureBar — the Neev "Capture" moment, the signature interaction. A big
 * marigold hold-to-talk mic: press to record, release to file. While listening
 * the mic turns red and **pulses**, a tabular timer counts up, and a wave shimmers
 * — so a gloved supervisor in the sun knows it's recording without reading a word.
 * Photo / Type are quiet alternates that fall BELOW voice (a form is a failure
 * for this role).
 *
 * Presentational: it owns listening + timer state and calls back on release. The
 * screen wires the real recorder/photo/text flows. Labels are props (English
 * defaults) so each screen renders ONE language per the app-wide language rule.
 */
import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Pressable, View, type ViewStyle } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { FACES } from '../theme/fonts'
import { Small } from './Typography'
import { useReducedMotion } from './motion'

export type CaptureSize = 'field' | 'mukadam'

export interface CaptureBarProps {
  size?: CaptureSize
  hint?: string
  listeningHint?: string
  photoLabel?: string
  typeLabel?: string
  showPhoto?: boolean
  showType?: boolean
  /** Called on release with the elapsed seconds. */
  onCapture?: (seconds: number) => void
  onPhoto?: () => void
  onType?: () => void
  style?: ViewStyle
}

const WAVE_BARS = [10, 18, 8, 20, 12, 16, 9]

function fmt(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function CaptureBar({
  size = 'field',
  hint = 'Hold to talk',
  listeningHint = 'Listening… release to stop',
  photoLabel = 'Photo',
  typeLabel = 'Type',
  showPhoto = true,
  showType = true,
  onCapture,
  onPhoto,
  onType,
  style,
}: CaptureBarProps) {
  const { theme } = useTheme()
  const c = theme.colors
  const reduced = useReducedMotion()
  const [listening, setListening] = useState(false)
  const [secs, setSecs] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pulse = useRef(new Animated.Value(0)).current

  const fab = size === 'mukadam' ? 112 : 84

  // Count up while listening.
  useEffect(() => {
    if (listening) {
      timer.current = setInterval(() => setSecs((s) => s + 1), 1000)
    }
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [listening])

  // Pulse the ring + wave while listening (honours Reduce Motion).
  useEffect(() => {
    if (listening && !reduced) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 750,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 750,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      )
      loop.start()
      return () => loop.stop()
    }
    pulse.setValue(0)
  }, [listening, reduced, pulse])

  const start = () => {
    if (listening) return
    setSecs(0)
    setListening(true)
  }
  const stop = () => {
    if (!listening) return
    setListening(false)
    setSecs((s) => {
      onCapture?.(s)
      return 0
    })
  }

  const micBg = listening ? c.risk : c.accent
  const micFg = listening ? '#ffffff' : c.onAccent

  return (
    <View style={[{ alignItems: 'center', gap: 14 }, style]}>
      {/* Timer / wave — reserves height so the layout never jumps. */}
      <View style={{ height: 22, justifyContent: 'center' }}>
        {listening ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 22 }}>
              {WAVE_BARS.map((h, i) => (
                <Animated.View
                  key={i}
                  style={{
                    width: 3,
                    borderRadius: 2,
                    backgroundColor: c.risk,
                    // Fixed height + animated scaleY: the native driver supports
                    // `transform` (not `height`), so the wave can pulse natively.
                    height: h,
                    transform: reduced
                      ? undefined
                      : [{ scaleY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }],
                  }}
                />
              ))}
            </View>
            <Small
              color={c.risk}
              accessibilityLiveRegion="polite"
              style={{ fontFamily: FACES[theme.name].dataNum, fontVariant: ['tabular-nums'], fontWeight: '700' }}
            >
              {fmt(secs)}
            </Small>
          </View>
        ) : null}
      </View>

      {/* The mic FAB — a pulsing ring behind it while listening. */}
      <View style={{ width: fab, height: fab, alignItems: 'center', justifyContent: 'center' }}>
        {listening ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: fab,
              height: fab,
              borderRadius: fab / 2,
              backgroundColor: c.risk,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
            }}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={listening ? listeningHint : hint}
          accessibilityState={{ busy: listening }}
          onPressIn={start}
          onPressOut={stop}
          style={({ pressed }) => [
            {
              width: fab,
              height: fab,
              borderRadius: fab / 2,
              backgroundColor: micBg,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
            theme.shadowCard,
          ]}
        >
          <Feather name="mic" size={Math.round(fab * 0.38)} color={micFg} />
        </Pressable>
      </View>

      <Small muted style={{ textAlign: 'center', maxWidth: 280 }}>
        {listening ? listeningHint : hint}
      </Small>

      {(showPhoto || showType) && !listening ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {showPhoto ? (
            <AltButton icon="camera" label={photoLabel} onPress={onPhoto} />
          ) : null}
          {showType ? <AltButton icon="type" label={typeLabel} onPress={onType} /> : null}
        </View>
      ) : null}
    </View>
  )
}

function AltButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name']
  label: string
  onPress?: () => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: 48,
        paddingHorizontal: 16,
        borderRadius: theme.radii.control,
        backgroundColor: c.card,
        borderWidth: 1.5,
        borderColor: c.line,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <Feather name={icon} size={20} color={c.text} />
      <Small style={{ fontWeight: '600' }}>{label}</Small>
    </Pressable>
  )
}
