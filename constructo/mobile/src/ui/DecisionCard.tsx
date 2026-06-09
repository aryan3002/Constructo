/**
 * DecisionCard — the signature pre-briefed choice. Calm AMBER (a choice, never
 * red), a "why-now" line so it never feels sudden, and a single primary (sage-
 * green) "Review" action. The CTA is green because primary actions are always
 * green; amber only signals "needs you". Never a bare "Approve?".
 */
import { View, type ViewStyle } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE } from '../theme/tokens'
import { Button } from './Button'
import { StatusPill } from './StatusPill'
import { Small, Title } from './Typography'

export interface DecisionCardProps {
  title: string
  /** "Needs your choice" eyebrow text (localized). */
  eyebrow?: string
  /** A reassuring "why now / by when" line, e.g. "Reversible until Fri · +₹0". */
  whenLabel?: string
  whenIcon?: React.ComponentProps<typeof Feather>['name']
  reviewLabel?: string
  onReview?: () => void
  style?: ViewStyle
}

export function DecisionCard({
  title,
  eyebrow = 'Needs your choice',
  whenLabel,
  whenIcon = 'clock',
  reviewLabel = 'Review',
  onReview,
  style,
}: DecisionCardProps) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View
      style={[
        {
          backgroundColor: 'rgba(169,122,30,0.14)', // amber-tint
          borderWidth: 1,
          borderColor: 'rgba(169,122,30,0.30)',
          borderRadius: theme.radii.card,
          padding: SPACE.lg,
          gap: SPACE.md,
        },
        theme.shadowCard,
        style,
      ]}
    >
      <StatusPill status="warn" size="sm" label={eyebrow} uppercase />
      <Title>{title}</Title>
      {whenLabel ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -SPACE.xs }}>
          <Feather name={whenIcon} size={14} color={c.warn} />
          <Small muted>{whenLabel}</Small>
        </View>
      ) : null}
      <Button
        title={reviewLabel}
        onPress={onReview}
        block
        style={{ marginTop: SPACE.xs }}
      />
    </View>
  )
}
