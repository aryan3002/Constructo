/**
 * EvidenceChip — Neev's inline proof, one touch from a claim. A small tappable
 * chip (icon or thumbnail + label + optional count) that sits in a row under a
 * NeedsYouCard or beside a number. Evidence is the soul of the "Site Register":
 * every claim/amount is one tap from its slip / photo / voice / PO.
 */
import { Image, Pressable, View, type ViewStyle } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { MonoSm, Small } from './Typography'

export type EvidenceChipKind = 'photo' | 'voice' | 'slip' | 'doc' | 'gps' | 'message'

const KIND_ICON: Record<EvidenceChipKind, React.ComponentProps<typeof Feather>['name']> = {
  photo: 'camera',
  voice: 'mic',
  slip: 'file-text', // delivery slip / receipt
  doc: 'file',
  gps: 'map-pin',
  message: 'message-circle',
}

export interface EvidenceChipProps {
  kind?: EvidenceChipKind
  label: string
  /** Optional count badge, e.g. 2 slips → "·2". */
  count?: number
  thumbnailUrl?: string
  onPress?: () => void
  style?: ViewStyle
}

export function EvidenceChip({
  kind = 'photo',
  label,
  count,
  thumbnailUrl,
  onPress,
  style,
}: EvidenceChipProps) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}${count != null ? `, ${count}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 7,
          minHeight: 34,
          paddingLeft: thumbnailUrl ? 5 : 9,
          paddingRight: 11,
          borderRadius: theme.radii.chip,
          backgroundColor: c.paper,
          borderWidth: 1,
          borderColor: c.line,
          alignSelf: 'flex-start',
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} style={{ width: 22, height: 22, borderRadius: 5 }} />
      ) : (
        <Feather name={KIND_ICON[kind]} size={15} color={c.textMute} />
      )}
      <Small color={c.textMute} numberOfLines={1} style={{ fontWeight: '500' }}>
        {label}
      </Small>
      {count != null ? <MonoSm color={c.textMute}>·{count}</MonoSm> : null}
    </Pressable>
  )
}
