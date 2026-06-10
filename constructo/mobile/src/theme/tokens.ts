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

/**
 * Soft tints derived from the status spine — used as container backgrounds
 * behind a status glyph/banner (never as color-alone). Shared across both
 * surfaces, exactly like {@link STATUS}, and spread into each palette.
 * `infoTint` = 10% of `STATUS.info` (#3b7dd8).
 */
export const STATUS_TINT = {
  infoTint: 'rgba(59,125,216,0.10)',
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
  /** 10% tint of `info` — soft container bg behind an info glyph/banner. */
  infoTint: string
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

/** A single type role's size/line-height (+ optional tracking). */
export type TypeStyle = { fontSize: number; lineHeight: number; letterSpacing?: number }
export type TypeRole =
  | 'display' | 'h1' | 'h2' | 'title' | 'bodyLg' | 'body'
  | 'small' | 'micro' | 'dataNum' | 'monoSm'
/** A full type scale (one size per role). Theme-aware: Daylight = Calm Cockpit,
 *  Blueprint = the contractor's tighter engineered scale. */
export type TypeScale = Record<TypeRole, TypeStyle>

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

// Blueprint key now carries the contractor "Neev · Site Register" identity:
// warm concrete paper, deep ink, a single marigold spark. The primary ACTION is
// ink (survives direct sun); marigold = capture + the one affirmative "yes".
// Money is ink-first. Own warm status spine (not the shared blueprint spine).
const BLUEPRINT_COLORS: ThemeColors = {
  bg: '#efeadf', // paper-100 — warm concrete app canvas (never clinical white)
  card: '#fffdf8', // surface — warm-white card / sheet
  paper: '#f4f0e7', // paper-50 — raised row / subtle fill
  line: '#ded7c9', // cement-200 — hairline borders / card edges
  accent: '#f0a21f', // marigold-500 — capture, focus, the single affirmative
  accentDeep: '#d6850c', // marigold-600 — pressed/hover
  accentWarm: '#fbe8c4', // marigold-200 — attention tint
  secondary: '#d6850c', // no celebration accent in Neev — reuse deep marigold
  secondaryContainer: '#fcf3df', // marigold-100 faint wash
  onAccent: '#1b1916', // dark ink reads best on marigold
  text: '#1b1916', // ink-900
  textMute: '#7a7368', // steel-500 — muted text
  // Neev status spine — warm, restrained (own values, not the shared STATUS):
  ok: '#2f7d52', // verified / on-track
  warn: '#c77a12', // attention / proposed / waiting
  risk: '#b23a2e', // behind / overdue / blocked (brick red)
  info: '#3a6491', // recorded / neutral fact (slate)
  quiet: '#7a7368', // neutral / quiet
  infoTint: 'rgba(58,100,145,0.10)',
}

// Daylight = the homeowner surface, on the "Calm Cockpit" system — Direction C
// "Blend" (locked). Warm SAND canvas (never clinical white), SAGE-green primary +
// on-track, Warm CLAY celebration/milestone, AMBER "needs you" choices, RED for
// genuine delay ONLY, neutral grey for progress/quiet/info (a disciplined 4-hue +
// neutral system — NO blue). All text colors verified >= 4.5:1 on the sand canvas.
const DAYLIGHT_COLORS: ThemeColors = {
  bg: '#f3efe6', // sand-200 — app canvas (warm sand, never pure white)
  card: '#fcfaf3', // surface — card surfaces
  paper: '#f8f4ec', // sand-100 — letter / elevated panel
  line: '#e3dccb', // hairline (≈ rgba(42,37,25,.09) over sand)
  accent: '#3e7a66', // sage green-600 — primary actions, active nav, on-track fill
  accentDeep: '#2f6151', // green-700 — pressed, on-track text, links
  accentWarm: '#cfe3d9', // soft sage chip / selected (green-tint as solid)
  secondary: '#ae5635', // clay-600 — celebration / milestones ONLY (never warnings)
  secondaryContainer: '#efdccb', // soft clay chips, weekly-summary accent bg
  onAccent: '#ffffff',
  text: '#2a2519', // ink-900 — headlines + primary text (warm near-black)
  textMute: '#6a6047', // ink-600 — secondary text (5.42:1 on sand)
  // Direction-C status spine (homeowner-specific — NOT the shared blueprint spine):
  ok: '#2f6151', // on-track → green-700 text (6.20:1 on sand)
  warn: '#7d5a13', // needs-you → amber-700 (5.47:1) — a choice, not a risk
  risk: '#a4382a', // genuine delay / money risk ONLY → red-600 (5.76:1)
  info: '#6a6047', // progress / neutral update → neutral ink (no blue hue)
  quiet: '#8c7f66', // quiet-period → muted sand-grey (calm, never red)
  infoTint: 'rgba(42,37,25,0.07)', // neutral tint behind a progress/info glyph
}

/**
 * "Calm Cockpit" extras used by the Daylight (homeowner) screens — kept here so
 * screens read colors from one place rather than hardcoding hexes. (Only the
 * homeowner surface uses these.) Values track the §3.1 palette.
 */
export const AP = {
  surfaceLow: '#f7f2e8', // surface-2 — inset surfaces / search fields
  surfaceContainer: '#ece5d7', // sand-300 — sunken / track
  onDark: '#ffffff', // text on the sage-green cards
  onDarkMuted: '#cfe3d9', // soft sage (eyebrows on green)
  chip: '#cfe3d9', // soft sage chip bg (green-tint as solid)
  onChip: '#2f6151', // green-700 (text on sage chip)
  outline: '#8c7f66', // muted outline / quiet tone (ink-400)
  ringTrack: '#ece5d7', // sand-300 — time-bar track behind the sage fill
  // Eyebrow / clay text (uppercase kickers, you-are-here marker, milestones):
  clay: '#92482a', // clay-700 — eyebrow text on sand (5.75:1)
  clayMarker: '#ae5635', // clay-600 — the "you are here" dot
  // Warm letter panel + dashed-quiet surfaces (Card variants):
  letter: '#f8f4ec', // sand-100 — weekly-summary "letter" panel
  borderStrong: '#d7cfbc', // hairline-strong (≈ rgba(42,37,25,.15))
} as const

export const THEMES: Record<ThemeName, Theme> = {
  blueprint: {
    name: 'blueprint',
    colors: BLUEPRINT_COLORS,
    // Neev "sturdy, not toy": buttons/inputs 10, cards 14, sheets/big 18, pill.
    radii: { chip: 10, card: 14, hero: 18, sheet: 18, pill: 9999, control: 10 },
    // A record leans on hairline borders over heavy shadow — a low, warm-ink lift.
    shadowCard: {
      shadowColor: '#1b1916',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
  },
  daylight: {
    name: 'daylight',
    colors: DAYLIGHT_COLORS,
    // Direction C — soft, residential "pebbles, not boxes": buttons/inputs 14,
    // primary cards 22, hero 28, sheet 24, pill full. (Tiles use 18 directly.)
    radii: { chip: 14, card: 22, hero: 28, sheet: 24, pill: 9999, control: 14 },
    // Warm, soft "lifted paper" lift — ink-tinted, never a hard black drop
    // (skill --shadow-card: 0 14px 30px -24px rgba(42,37,25,.50)).
    shadowCard: {
      shadowColor: '#2a2519',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.1,
      shadowRadius: 24,
      elevation: 3,
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
  // NOTE: Eczar is a tall serif — on iOS, RN's <Text> CLIPS the ascenders when
  // lineHeight is near the fontSize. The heading line-heights below are kept
  // generous (~1.27–1.36×) so the serif tops never cut off. Don't tighten them.
  /** Hero "You're okay." — the 3-second answer (Eczar serif, 500). */
  display: { fontSize: 44, lineHeight: 60, letterSpacing: -0.7 },
  /** Screen titles (Eczar 600). */
  h1: { fontSize: 28, lineHeight: 38, letterSpacing: -0.3 },
  /** Section / letter headings (Eczar 600). */
  h2: { fontSize: 22, lineHeight: 30, letterSpacing: -0.2 },
  /** Card titles (Eczar 600 — the skill's h3). */
  title: { fontSize: 18, lineHeight: 25 },
  /** Primary reading copy / status sentence (Hind). */
  bodyLg: { fontSize: 18, lineHeight: 27 },
  body: { fontSize: 16, lineHeight: 24 },
  /** labels / captions / nav — the 14px floor. */
  small: { fontSize: 14, lineHeight: 20 },
  /** eyebrow caption — kept at the 14px floor (skill 11.5; we honour the a11y floor). */
  micro: { fontSize: 14, lineHeight: 18, letterSpacing: 0.6 },
  /** ₹ amounts / counts (IBM Plex Mono). */
  dataNum: { fontSize: 16, lineHeight: 22 },
  /** dates / timestamps / mono eyebrows — mono-only sub-14 exception. */
  monoSm: { fontSize: 13, lineHeight: 18, letterSpacing: 0.3 },
} as const

/**
 * Blueprint (contractor) type scale — the original "engineered/dense" sizing,
 * one notch smaller than the homeowner Calm Cockpit scale. The contractor app
 * keeps a 12px micro (the homeowner floors visible text at 14px). Lives behind
 * `theme.type` so the shared Typography components size per active surface.
 */
export const TYPE_BLUEPRINT: TypeScale = {
  // Neev scale. Display = Bricolage (Latin, generous line-height so it never
  // clips); titles/body = Mukta; ₹ amounts = Spline mono (bumped, tabular).
  display: { fontSize: 34, lineHeight: 42, letterSpacing: -0.6 },
  h1: { fontSize: 25, lineHeight: 31, letterSpacing: -0.3 },
  h2: { fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  title: { fontSize: 17, lineHeight: 24 },
  bodyLg: { fontSize: 17, lineHeight: 26 },
  body: { fontSize: 15.5, lineHeight: 23 },
  small: { fontSize: 13, lineHeight: 18 },
  micro: { fontSize: 12, lineHeight: 16 },
  dataNum: { fontSize: 18, lineHeight: 24 }, // ₹ amounts / counts (Spline mono)
  monoSm: { fontSize: 11.5, lineHeight: 16, letterSpacing: 0.4 },
}

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
