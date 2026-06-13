/**
 * TimeBar — the prototype's "position in time" bar (screen-home.jsx, lines 164–192).
 *
 * A 10px-tall rounded track on sand/line color, a green gradient fill to `pct%`,
 * an 18px clay "you-are-here" dot with a surface ring + soft shadow, a clay "Now"
 * label above it, and "Started {start}" / "Handover {end}" meta below.
 *
 * Props:
 *   start    — "Jan 2026" label for the left end
 *   end      — "Sep 2026" label for the right end
 *   pct      — 0–100 (elapsed percentage of timeline)
 *   nowLabel — label above the marker dot (default "Now")
 */
import { View } from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import { AP, SPACE } from '../theme/tokens'
import { Small, Micro } from './Typography'

const TRACK_H = 10
const DOT_SIZE = 18
const LABEL_ABOVE = 20 // space reserved above the track for the "Now" label

export interface TimeBarProps {
  start: string
  end: string
  /** Elapsed fraction 0–100. */
  pct: number
  nowLabel?: string
}

export function TimeBar({ start, end, pct, nowLabel = 'Now' }: TimeBarProps) {
  const { theme } = useTheme()
  const c = theme.colors
  // Clay tokens from AP (matches Eyebrow color + milestone dot)
  const clay = AP.clay          // #92482a — label text
  const clayMarker = AP.clayMarker  // #ae5635 — the dot fill

  // Clamp pct to 0–100
  const p = Math.max(0, Math.min(100, pct))

  return (
    <View style={{ paddingTop: LABEL_ABOVE + SPACE.sm }}>
      {/* Track + fill + marker (all relative to the track row) */}
      <View style={{ position: 'relative', height: TRACK_H, borderRadius: 9999, backgroundColor: AP.surfaceContainer }}>
        {/* Green fill */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            // LinearGradient not used to keep this dep-free; a solid ok color is close enough.
            // The prototype uses linear-gradient(90deg, --green-500, --green-600).
            backgroundColor: c.ok,
            borderRadius: 9999,
            width: `${p}%`,
          }}
        />

        {/* You-are-here dot + "Now" label */}
        <View
          style={{
            position: 'absolute',
            // Centre the DOT_SIZE dot on the pct position.
            // We use `left` as a percentage and offset half the dot with negative margin.
            left: `${p}%` as unknown as number,
            top: -(DOT_SIZE - TRACK_H) / 2,
            // Shift left by half the dot width via marginLeft so it's centered
            marginLeft: -(DOT_SIZE / 2),
            alignItems: 'center',
          }}
        >
          {/* "Now" label above the dot */}
          <View style={{ position: 'absolute', bottom: DOT_SIZE + 4, alignItems: 'center', minWidth: 40 }}>
            <Micro
              color={clay}
              style={{ fontWeight: '700', textAlign: 'center', textTransform: 'none', letterSpacing: 0 }}
            >
              {nowLabel}
            </Micro>
          </View>

          {/* Clay dot with surface ring */}
          <View
            style={{
              width: DOT_SIZE,
              height: DOT_SIZE,
              borderRadius: DOT_SIZE / 2,
              backgroundColor: clayMarker,
              borderWidth: 3,
              borderColor: c.card,
              shadowColor: '#2a2519',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 6,
              elevation: 4,
            }}
          />
        </View>
      </View>

      {/* "Started …" / "Handover …" meta below */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.sm }}>
        <Small muted>Started {start}</Small>
        <Small muted>Handover {end}</Small>
      </View>
    </View>
  )
}
