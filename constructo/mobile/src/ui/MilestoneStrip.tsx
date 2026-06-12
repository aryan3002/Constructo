/**
 * MilestoneStrip — a compact horizontal sequence of milestone dots + connectors.
 *
 * Driven by `homeowner.milestones()`. Three dot states:
 *   done     → filled check circle (ok / sage green)
 *   now      → clay pulse outline dot (secondary / warm clay)
 *   upcoming → small outline dot (muted line color)
 *
 * Design rules (Calm Cockpit §8):
 *   · NO percentage, NO progress ring — this is a sequence indicator only.
 *   · Status is color + shape + label (accessible); a legend label appears
 *     beneath the active ("now") dot.
 *   · Connectors: a thin horizontal line between dots — filled (ok) between
 *     completed steps, unfilled (line) for the rest.
 *   · Horizontally scrollable when milestones exceed screen width.
 */
import { ScrollView, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE, STATUS } from '../theme/tokens'
import { Micro, Small } from './Typography'
import type { Milestone } from '../api/types'

const DOT_SIZE = 18
const CONNECTOR_H = 2
const CONNECTOR_W = 24

interface MilestoneStripProps {
  milestones: Milestone[]
  /** Label displayed under the "now" dot (e.g. "Now" / "अभी"). */
  nowLabel?: string
  /** Label for upcoming dots (hidden unless in a legend — not shown per-dot). */
  upcomingLabel?: string
}

function Dot({
  status,
  name,
  nowLabel,
  isLast,
}: {
  status: Milestone['status']
  name: string
  nowLabel: string
  isLast: boolean
}) {
  const { theme } = useTheme()
  const c = theme.colors

  const dotColor =
    status === 'done' ? c.ok : status === 'now' ? c.secondary : 'transparent'
  const borderColor =
    status === 'done' ? c.ok : status === 'now' ? c.secondary : c.line

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${name}: ${status}`}
      style={{ alignItems: 'center', gap: SPACE.xs }}
    >
      {/* The dot itself */}
      <View
        style={{
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: DOT_SIZE / 2,
          backgroundColor: dotColor,
          borderWidth: status === 'upcoming' ? 1.5 : 0,
          borderColor,
          alignItems: 'center',
          justifyContent: 'center',
          // "now" gets a soft clay halo to signal "active" without a pulse
          ...(status === 'now'
            ? {
                shadowColor: c.secondary,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.35,
                shadowRadius: 6,
              }
            : {}),
        }}
      >
        {status === 'done' ? (
          <Feather name="check" size={11} color="#ffffff" />
        ) : status === 'now' ? (
          // Inner white circle to make it a ring/outline feel
          <View
            style={{
              width: DOT_SIZE - 6,
              height: DOT_SIZE - 6,
              borderRadius: (DOT_SIZE - 6) / 2,
              backgroundColor: c.secondary,
            }}
          />
        ) : null}
      </View>

      {/* "Now" label beneath the active dot */}
      {status === 'now' ? (
        <Micro color={c.secondary} style={{ fontWeight: '700' }}>
          {nowLabel}
        </Micro>
      ) : null}
    </View>
  )
}

function Connector({ filled }: { filled: boolean }) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View
      style={{
        width: CONNECTOR_W,
        height: CONNECTOR_H,
        backgroundColor: filled ? c.ok : c.line,
        // Vertically centered on the dot center
        marginTop: (DOT_SIZE - CONNECTOR_H) / 2,
        flexShrink: 0,
      }}
    />
  )
}

export function MilestoneStrip({
  milestones,
  nowLabel = 'Now',
}: MilestoneStripProps) {
  // Sort by order ascending
  const sorted = [...milestones].sort((a, b) => a.order - b.order)

  if (sorted.length === 0) return null

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: SPACE.sm,
        paddingHorizontal: 2,
        gap: 0,
      }}
    >
      {sorted.map((m, i) => {
        const isLast = i === sorted.length - 1
        // Connector is filled (ok) only if BOTH this dot and the previous are done
        const connectorFilled = i > 0 && sorted[i - 1]?.status === 'done' && m.status === 'done'
        return (
          <View key={m.id} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            {/* Connector to the left — skip for first item */}
            {i > 0 ? <Connector filled={connectorFilled} /> : null}
            <View style={{ alignItems: 'center', gap: SPACE.xs }}>
              <Dot
                status={m.status}
                name={m.name}
                nowLabel={nowLabel}
                isLast={isLast}
              />
              {/* Milestone name below each dot — truncated */}
              <Small
                muted={m.status !== 'now'}
                color={m.status === 'now' ? undefined : undefined}
                numberOfLines={1}
                style={{
                  maxWidth: DOT_SIZE + CONNECTOR_W,
                  textAlign: 'center',
                  fontSize: 11,
                  lineHeight: 14,
                }}
              >
                {m.name}
              </Small>
            </View>
          </View>
        )
      })}
    </ScrollView>
  )
}
