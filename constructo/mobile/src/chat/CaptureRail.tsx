/**
 * CaptureRail — the smart-suggest chip for the unified chat kit. When the typed
 * text looks like a structured capture (delivery / attendance), this offers a
 * one-tap "Log …?" chip that sends it as a `capture_type` message. Theme-aware:
 * the chip tint derives from `theme.colors.accent` (sage on daylight, amber on
 * blueprint) — NOT the old hardcoded amber. Slash-command parsing stays in the
 * screen's send handler (`src/capture/slash.ts`); this is the suggest half only.
 */
import { Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE, TAP } from '../theme/tokens'
import { Small } from '../ui'
import type { CaptureSuggestion } from '../capture/suggest'

/** Hex + alpha → rgba tint. */
function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export function CaptureRail({
  suggestion,
  onAccept,
}: {
  suggestion: CaptureSuggestion | null
  onAccept: (s: CaptureSuggestion) => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  if (!suggestion) return null

  return (
    <View style={{ paddingTop: SPACE.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={suggestion.label}
        onPress={() => onAccept(suggestion)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.xs,
          alignSelf: 'flex-start',
          minHeight: TAP,
          paddingHorizontal: SPACE.md,
          paddingVertical: SPACE.sm,
          borderRadius: theme.radii.pill,
          borderWidth: 1,
          borderColor: tint(c.accent, 0.45),
          backgroundColor: tint(c.accent, 0.12),
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Feather name="zap" size={14} color={c.accentDeep} />
        <Small style={{ color: c.accentDeep, fontWeight: '600' }}>{suggestion.label}</Small>
      </Pressable>
    </View>
  )
}
