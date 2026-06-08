/**
 * StatusCard — the Home screen's anchor card (handoff §4 "StatusCard").
 *
 * A white card that OVERLAPS the LivingHomeHero's bottom by ~24px. It wraps:
 *   - the {@link SettleBar} honest time-bar (NEVER a percentage/ring — §8),
 *   - the current milestone title (Anek h2),
 *   - a one-line AI status sentence (bodyLg),
 *   - a "✦ Reviewed by site" trust badge — the human-review cue from the
 *     Honest-AI rule (and the home for the old H5 "Reviewed by ✓" leftover).
 *
 * Presentational: dates/fractions are computed by the caller (home.tsx) and the
 * SettleBar is passed only colors + labels, so this stays trivial to reason
 * about. When the build has no dated timeline the bar is omitted (the caller
 * passes `hasTimeline={false}`) — the sentence still reassures.
 */
import { View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { AP, SPACE } from '../theme/tokens'
import { useTheme } from '../theme/ThemeProvider'
import { Card } from './Card'
import { SettleBar } from './SettleBar'
import { BodyLg, Eyebrow, H2, Micro } from './Typography'

export interface StatusCardProps {
  /** Current milestone title (e.g. "Brickwork — first floor"). */
  milestoneTitle: string
  /** One-line AI status sentence (bodyLg). */
  statusSentence: string
  /** "✦ Reviewed by site" trust-badge label (localized). */
  reviewedLabel: string
  /** When false, the time-bar is omitted (dates unknown / "Starting soon"). */
  hasTimeline: boolean
  /** SettleBar props (only used when hasTimeline). */
  fraction: number
  startLabel: string
  endLabel: string
  tickFraction?: number | null
  /** Clay "you are here" caption beside the phase title (the TimeBar signature). */
  youAreHereLabel?: string
}

export function StatusCard({
  milestoneTitle,
  statusSentence,
  reviewedLabel,
  hasTimeline,
  fraction,
  startLabel,
  endLabel,
  tickFraction,
  youAreHereLabel,
}: StatusCardProps) {
  const { theme } = useTheme()
  const c = theme.colors

  return (
    <Card style={{ gap: SPACE.md }}>
      {hasTimeline ? (
        <SettleBar
          fraction={fraction}
          startLabel={startLabel}
          endLabel={endLabel}
          tickFraction={tickFraction}
          color={c.accent}
          trackColor={AP.ringTrack}
          labelColor={c.textMute}
        />
      ) : null}

      {/* Current phase + clay "you are here" — position in TIME, never a %. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: SPACE.sm,
        }}
      >
        <H2 style={{ flexShrink: 1 }}>{milestoneTitle}</H2>
        {hasTimeline && youAreHereLabel ? <Eyebrow>{youAreHereLabel}</Eyebrow> : null}
      </View>

      <BodyLg numberOfLines={4}>{statusSentence}</BodyLg>

      {/* "✦ Reviewed by site" — the Honest-AI human-review trust badge. */}
      <View
        accessibilityRole="text"
        accessibilityLabel={reviewedLabel}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.xs,
          alignSelf: 'flex-start',
        }}
      >
        <Feather name="check-circle" size={13} color={c.accent} />
        <Micro color={c.accent} style={{ letterSpacing: 0.3 }}>
          {reviewedLabel}
        </Micro>
      </View>
    </Card>
  )
}
