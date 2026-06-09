/**
 * StatusPill / StatusDot — the locked "status = color + icon + word" rule (never
 * color alone, for accessibility). Colors resolve from the ACTIVE theme, so the
 * homeowner (Daylight) surface gets the Direction-C spine (sage / clay / amber /
 * red + neutral, NO blue) and the contractor (Blueprint) keeps its shared spine.
 * Direction C: the word + line-icon sit on a soft tint of the status hue — red
 * appears only for genuine delay/risk.
 */
import type * as React from 'react'
import { View, type ViewStyle } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { STATUS_LABEL, type Status } from '../theme/tokens'
import { Micro, Small } from './Typography'

/** Distinct line icon per status (shape cue independent of color). */
const ICON: Record<Status, React.ComponentProps<typeof Feather>['name']> = {
  ok: 'check-circle', // on track / done
  warn: 'alert-circle', // needs you — a soft circle (a choice, not an alarm)
  risk: 'alert-triangle', // genuine delay / risk
  info: 'repeat', // change / neutral update (⇄)
  quiet: 'clock', // quiet period
}

/** Hex + alpha → rgba tint (e.g. '#3e7a66' @ 0.12). */
function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function StatusDot({ status, size = 12 }: { status: Status; size?: number }) {
  const { theme } = useTheme()
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={STATUS_LABEL[status]}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.colors[status],
      }}
    />
  )
}

export interface StatusPillProps {
  status: Status
  label?: string
  size?: 'sm' | 'md'
  /** Render the word in uppercase (eyebrow-style pills, e.g. "NEEDS YOUR CHOICE"). */
  uppercase?: boolean
  /** Override the default icon. */
  icon?: React.ComponentProps<typeof Feather>['name']
  style?: ViewStyle
}

export function StatusPill({ status, label, size = 'md', uppercase, icon, style }: StatusPillProps) {
  const { theme } = useTheme()
  const color = theme.colors[status]
  const text = label ?? STATUS_LABEL[status]
  const pad =
    size === 'sm'
      ? { paddingVertical: 5, paddingHorizontal: 9 }
      : { paddingVertical: 7, paddingHorizontal: 12 }
  const Label = size === 'sm' ? Micro : Small
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={text}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: size === 'sm' ? 5 : 7,
          alignSelf: 'flex-start',
          borderRadius: 9999,
          backgroundColor: tint(color, 0.13),
        },
        pad,
        style,
      ]}
    >
      <Feather name={icon ?? ICON[status]} size={size === 'sm' ? 13 : 15} color={color} />
      <Label
        color={color}
        style={{
          fontWeight: '600',
          textTransform: uppercase ? 'uppercase' : 'none',
          letterSpacing: uppercase ? 0.6 : 0,
        }}
      >
        {text}
      </Label>
    </View>
  )
}
