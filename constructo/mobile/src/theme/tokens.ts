/**
 * Constructo "Blueprint & Daylight" design tokens — React Native port.
 *
 * Values are ported VERBATIM from the web design system
 * (`web/src/ui/theme.css`) so the two clients stay visually identical:
 *   - `blueprint` (a.k.a web `data-theme="site"`)  — contractor app: bold, warm
 *     paper, amber primary.
 *   - `daylight`  (web `data-theme="daylight"`)     — homeowner app: soft,
 *     photo-forward, calm green.
 *
 * The status spine (ok/warn/risk/info) is SHARED across both surfaces and is
 * always paired with an icon/shape — never color alone (accessibility).
 */

export type ThemeName = 'blueprint' | 'daylight'
export type Status = 'ok' | 'warn' | 'risk' | 'info'

/** Shared status spine — identical across both themes. */
export const STATUS = {
  ok: '#1e9e5a',
  warn: '#e8a317',
  risk: '#e5484d',
  info: '#3b7dd8',
} as const

export interface ThemeColors {
  /** App canvas. */
  bg: string
  /** Card / sheet surface. */
  card: string
  /** Secondary surface (warm paper on blueprint, white on daylight). */
  paper: string
  /** Hairline borders / dividers. */
  line: string
  /** Primary action. */
  accent: string
  accentDeep: string
  /** Warm secondary accent. */
  accentWarm: string
  /** Label color that reads best ON the accent. */
  onAccent: string
  /** Default text + muted text. */
  text: string
  textMute: string
  /** Status spine (shared). */
  ok: string
  warn: string
  risk: string
  info: string
}

export interface ThemeRadii {
  card: number
  sheet: number
  pill: number
  control: number
}

export interface Theme {
  name: ThemeName
  colors: ThemeColors
  radii: ThemeRadii
  /** A soft shadow preset (RN shadow props). */
  shadowCard: {
    shadowColor: string
    shadowOffset: { width: number; height: number }
    shadowOpacity: number
    shadowRadius: number
    elevation: number
  }
}

const BLUEPRINT_COLORS: ThemeColors = {
  bg: '#f7f5f0', // warm, NOT clinical white
  card: '#ffffff',
  paper: '#f7f5f0',
  line: '#d9d4c8',
  accent: '#f2a100', // amber — THE primary action
  accentDeep: '#c77f00',
  accentWarm: '#c77f00',
  onAccent: '#15171c', // dark ink reads best on amber
  text: '#15171c',
  textMute: '#6b6f78',
  ...STATUS,
}

// Daylight = the homeowner surface, refined to the "Architectural Precision"
// system (warm cream + desaturated teal-green, quiet-luxury). Values ported
// from the Stitch DESIGN.md.
const DAYLIGHT_COLORS: ThemeColors = {
  bg: '#fcf9f3', // warm cream base
  card: '#ffffff', // surface-container-lowest
  paper: '#f6f3ed', // surface-container-low (inset surfaces)
  line: '#e6e2da', // tertiary-fixed (card stroke)
  accent: '#214b49', // primary (deep teal-green)
  accentDeep: '#3a6361', // primary-container (pressed/hover)
  accentWarm: '#cfe8e3', // secondary-container (soft chips)
  onAccent: '#ffffff',
  text: '#1c1c18', // on-surface
  textMute: '#404848', // on-surface-variant
  ...STATUS,
}

/**
 * "Architectural Precision" extras used by the Daylight (homeowner) Stitch
 * screens — kept here so screens read colors from one place rather than
 * hardcoding hexes. (Only the homeowner surface uses these.)
 */
export const AP = {
  surfaceLow: '#f6f3ed', // surface-container-low
  surfaceContainer: '#f0eee8', // surface-container
  onDark: '#ffffff', // text on the deep-teal cards
  onDarkMuted: '#b2ddda', // on-primary-container (eyebrows on teal)
  chip: '#cfe8e3', // secondary-container (soft chip bg)
  onChip: '#526965', // on-secondary-container
  outline: '#717978',
  ringTrack: '#e5e2dc', // surface-variant (progress-ring track)
} as const

export const THEMES: Record<ThemeName, Theme> = {
  blueprint: {
    name: 'blueprint',
    colors: BLUEPRINT_COLORS,
    // Site = 8px cards / 12px sheets.
    radii: { card: 8, sheet: 12, pill: 9999, control: 8 },
    shadowCard: {
      shadowColor: '#15171c',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    },
  },
  daylight: {
    name: 'daylight',
    colors: DAYLIGHT_COLORS,
    // Architectural Precision: cards 16px, hero/sheets 24px, controls 10px.
    radii: { card: 16, sheet: 24, pill: 9999, control: 10 },
    // Soft, teal-tinted ambient shadow — surfaces sit just above the cream base.
    shadowCard: {
      shadowColor: '#4d635f',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 2,
    },
  },
}

/**
 * The type scale (size / line-height), ported from the web scale. Families are
 * applied via the loaded font names (see `fonts.ts`).
 */
export const TYPE = {
  display: { fontSize: 28, lineHeight: 34 },
  h1: { fontSize: 22, lineHeight: 28 },
  h2: { fontSize: 18, lineHeight: 24 },
  body: { fontSize: 16, lineHeight: 24 },
  small: { fontSize: 14, lineHeight: 20 },
  micro: { fontSize: 12, lineHeight: 16 },
} as const

/** 4 / 8 spacing scale. */
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

/** Minimum touch target (accessibility floor). */
export const TAP = 48

/** Status → human label (shared with web STATUS_META). */
export const STATUS_LABEL: Record<Status, string> = {
  ok: 'On track',
  warn: 'Needs attention',
  risk: 'At risk',
  info: 'Info',
}

/** Map the backend RiskSeverity (high/med/low) onto the status spine. */
export function severityToStatus(severity: string): Status {
  switch (severity) {
    case 'high':
      return 'risk'
    case 'med':
      return 'warn'
    case 'low':
      return 'info'
    default:
      return 'info'
  }
}
