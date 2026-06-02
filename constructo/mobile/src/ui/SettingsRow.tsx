/**
 * SettingsRow — a single tappable row in the Calm Cockpit Settings hub.
 *
 * Layout: a soft inset icon chip (Feather glyph) · a title + an optional *live*
 * subtitle (current value, e.g. "English", "Daily", "3 people") · a trailing
 * chevron. Premium Feather icons only (no emoji), warm-paper tokens, ≥48px tap
 * target. Rows compose into a single rounded {@link SettingsGroup} card with
 * hairline dividers between them (iOS-grouped-list feel, residential warmth).
 */
import { Pressable, View, type ViewStyle } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { AP, SPACE, TAP } from '../theme/tokens'
import { Body, Small } from './Typography'

export interface SettingsRowProps {
  /** A Feather glyph name — the leading icon (shape cue, not color alone). */
  icon: React.ComponentProps<typeof Feather>['name']
  /** Row title (active-language string). */
  title: string
  /** Live subtitle — the current value (e.g. "English", "Daily"). */
  subtitle?: string
  /** Tint the title (e.g. risk for Sign out). Defaults to body text. */
  tone?: 'default' | 'risk'
  /** Hide the trailing chevron (e.g. for a terminal action like Sign out). */
  hideChevron?: boolean
  /** Whether this is the last row in its group (suppresses the divider). */
  last?: boolean
  onPress: () => void
  accessibilityLabel?: string
}

/** A rounded card that groups SettingsRows with hairline dividers between them. */
export function SettingsGroup({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { theme } = useTheme()
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii.card,
          borderWidth: 1,
          borderColor: theme.colors.line,
          overflow: 'hidden',
        },
        theme.shadowCard,
        style,
      ]}
    >
      {children}
    </View>
  )
}

export function SettingsRow({
  icon,
  title,
  subtitle,
  tone = 'default',
  hideChevron = false,
  last = false,
  onPress,
  accessibilityLabel,
}: SettingsRowProps) {
  const { theme } = useTheme()
  const titleColor = tone === 'risk' ? theme.colors.risk : theme.colors.text
  const iconColor = tone === 'risk' ? theme.colors.risk : theme.colors.accent

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
        minHeight: TAP + 8,
        paddingHorizontal: SPACE.lg,
        paddingVertical: SPACE.md,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.colors.line,
        backgroundColor: pressed ? AP.surfaceLow : 'transparent',
      })}
    >
      {/* Icon chip */}
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: theme.radii.chip,
          backgroundColor: tone === 'risk' ? '#fbe9e9' : AP.chip,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={icon} size={18} color={iconColor} />
      </View>

      {/* Title + live subtitle */}
      <View style={{ flex: 1, gap: 2 }}>
        <Body color={titleColor} numberOfLines={1}>
          {title}
        </Body>
        {subtitle ? (
          <Small muted numberOfLines={1}>
            {subtitle}
          </Small>
        ) : null}
      </View>

      {/* Trailing chevron */}
      {hideChevron ? null : (
        <Feather name="chevron-right" size={20} color={theme.colors.textMute} />
      )}
    </Pressable>
  )
}
