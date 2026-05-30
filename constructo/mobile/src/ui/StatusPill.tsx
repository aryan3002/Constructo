/**
 * StatusPill / StatusDot — the shared status spine rendered as color + a
 * DISTINCT glyph + a text label (never color alone, for accessibility). Tints
 * are derived from the status hue at low alpha so they read on both themes.
 */
import { View, type ViewStyle } from 'react-native'

import { STATUS, STATUS_LABEL, type Status } from '../theme/tokens'
import { Micro, Small } from './Typography'

/** Distinct glyph per status (shape cue independent of color). */
const GLYPH: Record<Status, string> = { ok: '✓', warn: '!', risk: '✕', info: 'i' }

/** Hex + alpha → rgba tint (e.g. '#1e9e5a' @ 0.12). */
function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function StatusDot({ status, size = 12 }: { status: Status; size?: number }) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={STATUS_LABEL[status]}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: STATUS[status],
      }}
    />
  )
}

export interface StatusPillProps {
  status: Status
  label?: string
  size?: 'sm' | 'md'
  style?: ViewStyle
}

export function StatusPill({ status, label, size = 'md', style }: StatusPillProps) {
  const color = STATUS[status]
  const text = label ?? STATUS_LABEL[status]
  const pad = size === 'sm' ? { paddingVertical: 2, paddingHorizontal: 8 } : { paddingVertical: 4, paddingHorizontal: 10 }
  const Label = size === 'sm' ? Micro : Small
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={text}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          borderRadius: 9999,
          borderWidth: 1,
          borderColor: tint(color, 0.3),
          backgroundColor: tint(color, 0.12),
        },
        pad,
        style,
      ]}
    >
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Micro color="#ffffff" style={{ fontSize: 11, lineHeight: 14 }}>
          {GLYPH[status]}
        </Micro>
      </View>
      <Label color={color} style={{ fontWeight: '600' }}>
        {text}
      </Label>
    </View>
  )
}
