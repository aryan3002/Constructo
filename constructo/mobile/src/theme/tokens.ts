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
export type Status = 'ok' | 'warn' | 'risk' | 'info' | 'quiet'

/**
 * Shared status spine — identical across both themes. ALWAYS paired with an
 * icon/word, never color alone (accessibility). `quiet` is the calm grey
 * quiet-period tone (homeowner "Calm Cockpit") — never red, never alarming.
 */
export const STATUS = {
  ok: '#1e9e5a',
  warn: '#e8a317',
  risk: '#e5484d',
  info: '#3b7dd8',
  quiet: '#8c8a82',
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
  /** Soft primary-container tint (selected chips / soft states). */
  accentWarm: string
  /** Celebration / milestone accent (Warm Clay) — NEVER warnings. */
  secondary: string
  /** Soft clay container (weekly-summary accent bg, milestone chips). */
  secondaryContainer: string
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
  /** Calm quiet-period tone (grey) — never red. */
  quiet: string
}

export interface ThemeRadii {
  /** chips / inputs / controls. */
  chip: number
  card: number
  /** hero / large surfaces. */
  hero: number
  sheet: number
  pill: number
  /** alias of `chip` — kept for existing call sites (inputs/controls). */
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
  secondary: '#c5683b', // warm clay (shared celebration accent)
  secondaryContainer: '#f4d9c6',
  onAccent: '#15171c', // dark ink reads best on amber
  text: '#15171c',
  textMute: '#6b6f78',
  ...STATUS,
}

// Daylight = the homeowner surface, on the "Calm Cockpit" system (§3.1):
// warm paper + Calm Pine green + a Warm Clay celebration accent. Warm paper
// background, never pure white; red reserved for genuine risk.
const DAYLIGHT_COLORS: ThemeColors = {
  bg: '#faf6ee', // Warm Paper — app canvas (never pure white)
  card: '#ffffff', // cards / content surfaces
  paper: '#f5f0e5', // surfaceLow — inset surfaces / search fields
  line: '#d9d2c2', // hairlines / dividers
  accent: '#1e7a63', // Calm Pine — primary actions, active nav, "on track"
  accentDeep: '#155c4a', // pressed/hover primary
  accentWarm: '#cde7dd', // primaryContainer — soft green chips / selected states
  secondary: '#c5683b', // Warm Clay — celebration / milestones ONLY (never warnings)
  secondaryContainer: '#f4d9c6', // soft clay chips, weekly-summary accent bg
  onAccent: '#ffffff',
  text: '#1e2230', // body / headings
  textMute: '#5b6166', // metadata, captions, inactive nav
  ...STATUS,
}

/**
 * "Calm Cockpit" extras used by the Daylight (homeowner) screens — kept here so
 * screens read colors from one place rather than hardcoding hexes. (Only the
 * homeowner surface uses these.) Values track the §3.1 palette.
 */
export const AP = {
  surfaceLow: '#f5f0e5', // surfaceLow — inset surfaces
  surfaceContainer: '#efe9dc', // a touch below surfaceLow
  onDark: '#ffffff', // text on the Calm-Pine cards
  onDarkMuted: '#cde7dd', // primaryContainer (eyebrows on pine)
  chip: '#cde7dd', // primaryContainer (soft green chip bg)
  onChip: '#155c4a', // accentDeep (text on green chip)
  outline: '#8c8a82', // muted outline / quiet tone
  ringTrack: '#e7e1d2', // time-bar / track behind the Calm-Pine fill
} as const

export const THEMES: Record<ThemeName, Theme> = {
  blueprint: {
    name: 'blueprint',
    colors: BLUEPRINT_COLORS,
    // Site = 8px cards / 12px sheets.
    radii: { chip: 8, card: 8, hero: 12, sheet: 12, pill: 9999, control: 8 },
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
    // Calm Cockpit (§3.4): chip/input 12, card 16, hero 20, sheet 24, pill 9999.
    radii: { chip: 12, card: 16, hero: 20, sheet: 24, pill: 9999, control: 12 },
    // Soft, warm, residential ambient shadow (§3.5: 0 8px 24px rgba(60,50,30,.06)).
    shadowCard: {
      shadowColor: '#3c321e',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.06,
      shadowRadius: 24,
      elevation: 2,
    },
  },
}

/**
 * The type scale (size / line-height), per the Calm Cockpit spec §3.2
 * (Devanagari-first; never below 14px for visible copy). Families are applied
 * via the loaded font names (see `fonts.ts`).
 *
 * Note: `micro` is 14 (not 12) — the spec floors visible text at 14px. The
 * 13px mono eyebrow (`monoSm`) is the one exception and is mono-only.
 */
export const TYPE = {
  display: { fontSize: 34, lineHeight: 40, letterSpacing: -0.5 },
  h1: { fontSize: 28, lineHeight: 34, letterSpacing: -0.3 },
  h2: { fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  title: { fontSize: 18, lineHeight: 24 },
  bodyLg: { fontSize: 18, lineHeight: 28 },
  body: { fontSize: 16, lineHeight: 24 },
  /** labels / captions / nav — the 14px floor. */
  small: { fontSize: 14, lineHeight: 20 },
  /** eyebrow caption — kept at the 14px floor (was 12). */
  micro: { fontSize: 14, lineHeight: 18 },
  /** ₹ amounts / counts (mono). */
  dataNum: { fontSize: 16, lineHeight: 22 },
  /** dates / timestamps / mono eyebrows — mono-only sub-14 exception. */
  monoSm: { fontSize: 13, lineHeight: 18, letterSpacing: 0.3 },
} as const

/** 4px-base spacing scale (§3.3). `gutter` = screen side margin (20px). */
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  gutter: 20,
} as const

/** Minimum touch target (accessibility floor). */
export const TAP = 48

/** Status → human label (shared with web STATUS_META). */
export const STATUS_LABEL: Record<Status, string> = {
  ok: 'On track',
  warn: 'Needs attention',
  risk: 'At risk',
  info: 'Info',
  quiet: 'Quiet',
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
