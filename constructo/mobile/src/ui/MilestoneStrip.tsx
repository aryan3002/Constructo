/**
 * MilestoneStrip — a compact horizontal sequence of milestone dots + connectors.
 *
 * Driven by `homeowner.milestones()`. Three dot states:
 *   done     → filled check circle (ok / sage green)
 *   now      → clay RING (you-are-here marker): outer clay border, card-colored
 *              center so it reads as a punched-out ring, not a solid disk
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
import { SPACE } from '../theme/tokens'
import { Small } from './Typography'
import type { Milestone } from '../api/types'

const DOT_SIZE = 18
const CONNECTOR_H = 2
const CONNECTOR_W = 24

interface MilestoneStripProps {
  milestones: Milestone[]
  /** Label displayed under the "now" dot (e.g. "Now" / "अभी"). */
  nowLabel?: string
}

function Dot({
  status,
  name,
  nowLabel,
}: {
  status: Milestone['status']
  name: string
  nowLabel: string
}) {
  const { theme } = useTheme()
  const c = theme.colors

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
          // done: filled sage circle; now: transparent center (ring); upcoming: transparent
          backgroundColor: status === 'done' ? c.ok : 'transparent',
          // done: no border; now: clay ring border; upcoming: muted outline
          borderWidth: status === 'done' ? 0 : status === 'now' ? 2.5 : 1.5,
          borderColor: status === 'done' ? c.ok : status === 'now' ? c.secondary : c.line,
          alignItems: 'center',
          justifyContent: 'center',
          // "now" ring gets a soft clay halo to reinforce the you-are-here marker
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
          // White check on sage green — onAccent is #ffffff on Daylight
          <Feather name="check" size={11} color={c.onAccent} />
        ) : status === 'now' ? (
          // Small filled clay dot in the center of the ring (you-are-here pip)
          <View
            style={{
              width: DOT_SIZE - 10,
              height: DOT_SIZE - 10,
              borderRadius: (DOT_SIZE - 10) / 2,
              backgroundColor: c.secondary,
            }}
          />
        ) : null}
      </View>

      {/* "Now" label beneath the active dot — use Small to match milestone-name labels */}
      {status === 'now' ? (
        <Small color={c.secondary} style={{ fontWeight: '700' }}>
          {nowLabel}
        </Small>
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
