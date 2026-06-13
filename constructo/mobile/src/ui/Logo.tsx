import { Svg, Rect, G, Circle, Path } from 'react-native-svg'
import { useAuth } from '../auth/AuthContext'

export function Logo({ size = 64 }: { size?: number }) {
  const { role } = useAuth()
  const isHomeowner = role === 'homeowner'

  if (isHomeowner) {
    return (
      <Svg width={size} height={size} viewBox="0 0 1024 1024" role="img" aria-label="Neev home app icon">
        <Rect width="1024" height="1024" rx="229" fill="#F1ECE0" />
        <Rect x="5" y="5" width="1014" height="1014" rx="225" fill="none" stroke="#E3D9C6" strokeWidth="6" />
        <G transform="translate(204.8,204.8) scale(6.144)">
          <Circle cx="50" cy="28" r="5.5" fill="#AE5635" />
          <Path d="M29 67 L50 45 L71 67" fill="none" stroke="#3E7A66" strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round" />
          <Rect x="24" y="74" width="52" height="8" rx="4" fill="#3E7A66" />
        </G>
      </Svg>
    )
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" role="img" aria-label="Neev app icon">
      <Rect width="1024" height="1024" rx="229" fill="#1B1916" />
      <G transform="translate(204.8,204.8) scale(6.144)">
        <Circle cx="50" cy="28" r="5.5" fill="#F0A21F" />
        <Path d="M29 67 L50 45 L71 67" fill="none" stroke="#F0A21F" strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round" />
        <Rect x="24" y="74" width="52" height="8" rx="4" fill="#F0A21F" />
      </G>
    </Svg>
  )
}
