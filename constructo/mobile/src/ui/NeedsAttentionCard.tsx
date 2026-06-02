/**
 * NeedsAttentionCard — the single, calm "this needs you" card (handoff §4).
 *
 * Shown ONLY when exactly one item needs the homeowner ("Exceptions, not
 * activity"). Amber (`warn`) left border + an eyebrow "NEEDS YOU · 1 of 1",
 * the item title, optional context, an optional reassuring cost line
 * (e.g. "+₹0 · reversible"), and a Review CTA. One item at a time; the card is
 * absent entirely when nothing needs her (the caller renders the quiet / all-
 * calm states instead).
 *
 * Amber here is the `warn` tone — NOT red. Red is reserved for genuine
 * delay/money risk only (§8).
 */
import { Pressable, View } from 'react-native'
import { Link } from 'expo-router'
import { Feather } from '@expo/vector-icons'

import { SPACE, STATUS } from '../theme/tokens'
import { useTheme } from '../theme/ThemeProvider'
import { Body, BodyStrong, Micro, Small } from './Typography'

export interface NeedsAttentionCardProps {
  /** Eyebrow, e.g. "NEEDS YOU · 1 of 1". */
  eyebrow: string
  title: string
  /** Optional one-line context under the title. */
  context?: string | null
  /** Optional reassuring cost line, e.g. "+₹0 · reversible". */
  costLine?: string | null
  /** Review CTA label (localized). */
  reviewLabel: string
  /** Pushed when the card / CTA is tapped. */
  href: React.ComponentProps<typeof Link>['href']
  /** Accessible label for the whole card. */
  accessibilityLabel: string
}

export function NeedsAttentionCard({
  eyebrow,
  title,
  context,
  costLine,
  reviewLabel,
  href,
  accessibilityLabel,
}: NeedsAttentionCardProps) {
  const { theme } = useTheme()
  const c = theme.colors

  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          {
            backgroundColor: c.card,
            borderRadius: theme.radii.card,
            borderLeftWidth: 4,
            borderLeftColor: STATUS.warn,
            padding: SPACE.lg,
            opacity: pressed ? 0.92 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
          theme.shadowCard,
        ]}
      >
        <Micro color={STATUS.warn} style={{ letterSpacing: 1 }}>
          {eyebrow.toUpperCase()}
        </Micro>

        <BodyStrong style={{ marginTop: SPACE.xs }}>{title}</BodyStrong>

        {context ? (
          <Body muted style={{ marginTop: SPACE.xs }} numberOfLines={3}>
            {context}
          </Body>
        ) : null}

        {costLine ? (
          <Small muted style={{ marginTop: SPACE.sm }}>
            {costLine}
          </Small>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.xs,
            marginTop: SPACE.md,
          }}
        >
          <Small color={c.accent} style={{ fontWeight: '600' }}>
            {reviewLabel}
          </Small>
          <Feather name="arrow-right" size={14} color={c.accent} />
        </View>
      </Pressable>
    </Link>
  )
}
