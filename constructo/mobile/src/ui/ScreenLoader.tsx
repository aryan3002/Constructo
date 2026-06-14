/**
 * ScreenLoader — the calm "we're getting it" state, NOT a spinner.
 *
 * A breathing benchmark mark (the foundation, holding steady) with an optional
 * quiet label. Use it in place of a full-screen ActivityIndicator while a screen
 * loads. For content that has a known shape (lists, cards), prefer `Skeleton`
 * rows so the layout settles into place instead of flashing.
 *
 * Reduced motion: the mark rests at its resolved frame (BenchmarkMark handles
 * it) — calm and still, never a loop.
 */
import { View, type ViewStyle } from 'react-native'

import { SPACE } from '../theme/tokens'
import { BenchmarkMark } from './BenchmarkMark'
import { Small } from './Typography'

export interface ScreenLoaderProps {
  label?: string
  size?: number
  /** Fill the parent (centered) — default true. Set false for inline use. */
  fill?: boolean
  style?: ViewStyle
}

export function ScreenLoader({ label, size = 60, fill = true, style }: ScreenLoaderProps) {
  return (
    <View
      style={[
        {
          alignItems: 'center',
          justifyContent: 'center',
          gap: SPACE.md,
          paddingVertical: SPACE.xxl,
        },
        fill ? { flex: 1 } : null,
        style,
      ]}
    >
      <BenchmarkMark size={size} mode="breathe" />
      {label ? <Small muted>{label}</Small> : null}
    </View>
  )
}
