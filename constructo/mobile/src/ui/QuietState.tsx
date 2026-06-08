/**
 * QuietState — the calm empty / quiet state. Success here is EARNED ABSENCE:
 * a soft sage halo, a reassuring line, and (optionally) one gentle action.
 * Never an error tone, never red, never a nudge to engage.
 *
 *   tone="ontrack" → soft sage halo (all-calm / all-caught-up)
 *   tone="quiet"   → muted sand halo (a genuine quiet-period — explains silence)
 */
import { View, type ViewStyle } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { AP, SPACE } from '../theme/tokens'
import { Body, H2 } from './Typography'

export interface QuietStateProps {
  icon?: React.ComponentProps<typeof Feather>['name']
  title?: string
  message?: string
  tone?: 'ontrack' | 'quiet'
  /** One gentle action (e.g. a ghost Button). Optional — quiet rarely needs one. */
  action?: React.ReactNode
  style?: ViewStyle
}

export function QuietState({
  icon = 'sun',
  title = 'All calm',
  message = 'Nothing needs you today.',
  tone = 'ontrack',
  action,
  style,
}: QuietStateProps) {
  const { theme } = useTheme()
  const quiet = tone === 'quiet'
  const haloBg = quiet ? AP.surfaceContainer : theme.colors.accent
  const haloFg = quiet ? AP.outline : '#ffffff'
  return (
    <View
      style={[
        { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 28, gap: SPACE.xs },
        style,
      ]}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          marginBottom: SPACE.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: haloBg,
          // soft on-track halo (never harsh); none for the muted quiet tone
          ...(quiet
            ? {}
            : {
                shadowColor: theme.colors.accent,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.18,
                shadowRadius: 14,
                elevation: 0,
              }),
        }}
      >
        <Feather name={icon} size={30} color={haloFg} />
      </View>
      <H2 style={{ textAlign: 'center' }}>{title}</H2>
      <Body muted style={{ textAlign: 'center', maxWidth: 300 }}>
        {message}
      </Body>
      {action ? <View style={{ marginTop: SPACE.lg }}>{action}</View> : null}
    </View>
  )
}
