/**
 * StepDots — "where am I" for the 2–3 step auth flows. Done = ink, active =
 * accent (wider), idle = hairline. Paired with the "Step n of total" label in
 * AuthFrame so progress is never colour-only. No animation (Reduce-Motion safe).
 */
import { View } from 'react-native'

import { useTheme } from '../../theme/ThemeProvider'

export function StepDots({ n, total }: { n: number; total: number }) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: n }}
      style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}
    >
      {Array.from({ length: total }, (_, i) => {
        const idx = i + 1
        const active = idx === n
        const done = idx < n
        return (
          <View
            key={idx}
            style={{
              width: active ? 22 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: active ? c.accent : done ? c.text : c.line,
            }}
          />
        )
      })}
    </View>
  )
}
