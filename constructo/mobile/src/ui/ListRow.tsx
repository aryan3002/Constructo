/**
 * ListRow — icon tile + title + optional subtitle + optional right slot +
 * optional status dot + optional bottom divider suppression.
 *
 * Layout (prototype `ListRow`):
 *   [icon tile 38×38] [title / subtitle flex:1] [right slot] [status dot?]
 *
 * The bottom divider is drawn via borderBottom on the Pressable — pass `last`
 * to suppress it (last row in a group). ≥48px touch target.
 *
 * `statusTone` renders a 7×7 dot (color from theme status spine) INSIDE the
 * title row — never color alone; pair with `StatusPill` for full a11y context
 * if needed elsewhere.
 */
import { Pressable, View, type ViewStyle } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { AP, SPACE, TAP, type Status } from '../theme/tokens'
import { Body, Small } from './Typography'

export interface ListRowProps {
  /** Optional leading Feather icon name. */
  icon?: React.ComponentProps<typeof Feather>['name']
  title: string
  subtitle?: string
  /** Optional right-side slot (e.g. a StatusPill, MoneyCell, chevron). */
  right?: React.ReactNode
  /** Status dot tone — renders a small coloured dot before the title. */
  statusTone?: Status
  onPress?: () => void
  /** Pass true for the last row in a group to suppress the bottom divider. */
  last?: boolean
  style?: ViewStyle
}

export function ListRow({
  icon,
  title,
  subtitle,
  right,
  statusTone,
  onPress,
  last = false,
  style,
}: ListRowProps) {
  const { theme } = useTheme()
  const c = theme.colors

  // Icon tile background: paper on both themes (raised row subtle fill).
  const iconBg = c.paper

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.md,
          minHeight: TAP + 8, // ≥56px for comfortable spacing
          paddingVertical: SPACE.md,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: c.line,
          backgroundColor: pressed && onPress ? AP.surfaceLow : 'transparent',
        },
        style,
      ]}
    >
      {/* Leading icon tile */}
      {icon ? (
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: theme.radii.chip,
            backgroundColor: iconBg,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Feather name={icon} size={18} color={c.textMute} />
        </View>
      ) : null}

      {/* Title + subtitle */}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          {statusTone ? (
            <View
              accessibilityRole="image"
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: c[statusTone],
                flexShrink: 0,
              }}
            />
          ) : null}
          <Body
            numberOfLines={subtitle ? 1 : undefined}
            style={{ flex: 1 }}
          >
            {title}
          </Body>
        </View>
        {subtitle ? (
          <Small muted numberOfLines={1}>
            {subtitle}
          </Small>
        ) : null}
      </View>

      {/* Right slot */}
      {right ? (
        <View style={{ flexShrink: 0, alignItems: 'center' }}>{right}</View>
      ) : null}
    </Pressable>
  )
}
