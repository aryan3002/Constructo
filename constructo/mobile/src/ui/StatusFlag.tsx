/**
 * StatusFlag — Neev's signature "register page" status mark: a folded-corner
 * dog-ear in the top-right of a card, in the status colour, with a crease shadow
 * along the fold — a *flagged page in the site register*, not a generic coloured
 * rail. It is DECORATIVE and always pairs with a {@link StatusPill} (shape +
 * label), so status is never carried by colour alone.
 *
 * Drawn with SVG and rounded to the card's corner radius, so it sits flush in a
 * rounded card without needing `overflow:hidden` (which would clip iOS shadows).
 */
import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { useTheme } from '../theme/ThemeProvider'
import type { Status } from '../theme/tokens'

export interface StatusFlagProps {
  status: Status
  /** Box size of the fold (field cards use a slightly larger flag). */
  size?: number
  /** Corner radius to follow (defaults to the active card radius). */
  radius?: number
}

export function StatusFlag({ status, size = 34, radius }: StatusFlagProps) {
  const { theme } = useTheme()
  const color = theme.colors[status]
  const n = size
  const r = Math.min(radius ?? theme.radii.card, n - 2)

  // Upper-right triangle, with the top-right (card) corner rounded to `r`.
  // Box local coords: (0,0) top-left → (n,0) top-right (the card corner).
  const flap = `M0 0 L${n - r} 0 A${r} ${r} 0 0 1 ${n} ${r} L${n} ${n} Z`
  // Crease: the diagonal fold from the top-left of the box to the bottom-right.
  const crease = `M0 0 L${n} ${n}`

  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ position: 'absolute', top: 0, right: 0, width: n, height: n }}
    >
      <Svg width={n} height={n} viewBox={`0 0 ${n} ${n}`}>
        <Path d={flap} fill={color} />
        {/* warm-ink crease (never pure black) — a low shadow along the fold */}
        <Path d={crease} stroke="rgba(40,30,15,0.28)" strokeWidth={1.5} fill="none" />
      </Svg>
    </View>
  )
}
