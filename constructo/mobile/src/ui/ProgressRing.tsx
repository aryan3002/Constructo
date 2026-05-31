/**
 * ProgressRing — a circular progress indicator (the Architectural Precision
 * "structure complete" ring). Draws a track + an arc with rounded caps and
 * centers its children (typically the percentage label).
 */
import type { ReactNode } from 'react'
import { View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

export interface ProgressRingProps {
  /** 0..1 */
  progress: number
  size?: number
  stroke?: number
  color: string
  trackColor: string
  children?: ReactNode
}

export function ProgressRing({
  progress,
  size = 128,
  stroke = 8,
  color,
  trackColor,
  children,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, progress))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - clamped)
  const center = size / 2

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          // Start the arc at 12 o'clock.
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  )
}
