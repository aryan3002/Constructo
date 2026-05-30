/**
 * EvidenceCard — the soul of Constructo. A claim with a status dot and a
 * "Show proof" control that expands IN PLACE to reveal supporting evidence
 * (photo / challan / voice / message). Every claim is one tap from its proof.
 */
import { useState } from 'react'
import { Image, LayoutAnimation, Platform, Pressable, UIManager, View } from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE, TAP, type Status } from '../theme/tokens'
import { StatusDot } from './StatusPill'
import { Body, BodyStrong, Mono, Small } from './Typography'

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

export type EvidenceKind = 'photo' | 'challan' | 'voice' | 'message'

export interface EvidenceItem {
  kind: EvidenceKind
  label: string
  detail?: string
  thumbnailUrl?: string
  meta?: string
}

const KIND_GLYPH: Record<EvidenceKind, string> = {
  photo: '🖼',
  challan: '🧾',
  voice: '🎙',
  message: '💬',
}

export interface EvidenceCardProps {
  claim: string
  status: Status
  detail?: string
  evidence: EvidenceItem[]
  defaultOpen?: boolean
}

function EvidenceRow({ item }: { item: EvidenceItem }) {
  const { theme } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: SPACE.md,
        borderRadius: theme.radii.control,
        borderWidth: 1,
        borderColor: theme.colors.line,
        backgroundColor: theme.colors.paper,
        padding: SPACE.sm,
      }}
    >
      {item.thumbnailUrl ? (
        <Image
          source={{ uri: item.thumbnailUrl }}
          style={{ width: 48, height: 48, borderRadius: 8 }}
        />
      ) : (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            backgroundColor: theme.colors.card,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Body>{KIND_GLYPH[item.kind]}</Body>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <BodyStrong numberOfLines={1}>{item.label}</BodyStrong>
        {item.detail ? (
          <Small muted numberOfLines={2} style={{ marginTop: 2 }}>
            {item.detail}
          </Small>
        ) : null}
      </View>
      {item.meta ? <Mono muted>{item.meta}</Mono> : null}
    </View>
  )
}

export function EvidenceCard({
  claim,
  status,
  detail,
  evidence,
  defaultOpen = false,
}: EvidenceCardProps) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(defaultOpen)
  const hasEvidence = evidence.length > 0

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpen((o) => !o)
  }

  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii.card,
          borderWidth: 1,
          borderColor: theme.colors.line,
          padding: SPACE.lg,
        },
        theme.shadowCard,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md }}>
        <View style={{ marginTop: 4 }}>
          <StatusDot status={status} />
        </View>
        <View style={{ flex: 1 }}>
          <BodyStrong>{claim}</BodyStrong>
          {detail ? (
            <Small muted style={{ marginTop: 2 }}>
              {detail}
            </Small>
          ) : null}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: hasEvidence ? open : undefined }}
        disabled={!hasEvidence}
        onPress={toggle}
        style={{ minHeight: TAP, justifyContent: 'center' }}
      >
        <BodyStrong color={hasEvidence ? theme.colors.accentDeep : theme.colors.textMute}>
          {hasEvidence ? (open ? 'Hide proof ▴' : 'Show proof ▾') : 'No proof attached'}
        </BodyStrong>
      </Pressable>

      {hasEvidence && open ? (
        <View style={{ gap: SPACE.sm }}>
          {evidence.map((item, i) => (
            <EvidenceRow key={`${item.kind}-${i}`} item={item} />
          ))}
        </View>
      ) : null}
    </View>
  )
}
