/**
 * A colour from a CSS custom property that still takes Tailwind's opacity
 * modifier: `bg-ok/10` becomes `color-mix(in srgb, var(--c-ok) 10%,
 * transparent)`. A bare `var(--x)` can't carry alpha, so before this every
 * `/10`-style class was silently dropped and status pills rendered hollow.
 * Works for every skin, since it mixes whatever the variable holds.
 */
const token = (name) => ({ opacityValue }) => {
  const alpha = Number(opacityValue)
  if (opacityValue === undefined || Number.isNaN(alpha) || alpha >= 1) return `var(${name})`
  return `color-mix(in srgb, var(${name}) ${+(alpha * 100).toFixed(2)}%, transparent)`
}

/** Every `'var(--x)'` entry of a colour map, made alpha-aware. */
const tokens = (map) =>
  Object.fromEntries(
    Object.entries(map).map(([k, v]) => {
      const m = /^var\((--[\w-]+)\)$/.exec(v)
      return [k, m ? token(m[1]) : v]
    }),
  )

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Mode is driven by `data-theme="dark"` on <html> (set by ThemeModeProvider).
  // This lets optional `dark:` utilities resolve, though most theming flows
  // through CSS custom properties (which switch automatically).
  darkMode: ['variant', '&:where([data-theme="dark"], [data-theme="dark"] *)'],
  theme: {
    extend: {
      colors: tokens({
        // --- Brand: repointed from the old unused blue palette to the safety-amber
        //     accent var, so `accent-brand` / `bg-brand` resolve to amber, mode-aware. ---
        brand: 'var(--brand)',
        'brand-subtle': 'var(--brand-subtle)',
        'brand-text': 'var(--brand-text)',
        // --- Celebrate (terracotta clay): milestones / eyebrows / capture-suggest accent. ---
        celebrate: 'var(--celebrate)',
        'celebrate-subtle': 'var(--celebrate-subtle)',
        'celebrate-text': 'var(--celebrate-text)',

        // --- Status spine (solids) ---
        ok: 'var(--c-ok)',
        warn: 'var(--c-warn)',
        risk: 'var(--c-risk)',
        info: 'var(--c-info)',
        done: 'var(--done-solid)',
        // Status tints + text (for pills/badges)
        'ok-bg': 'var(--ok-bg)',
        'ok-fg': 'var(--ok-fg)',
        'warn-bg': 'var(--warn-bg)',
        'warn-fg': 'var(--warn-fg)',
        'risk-bg': 'var(--risk-bg)',
        'risk-fg': 'var(--risk-fg)',
        'info-bg': 'var(--info-bg)',
        'info-fg': 'var(--info-fg)',
        'done-bg': 'var(--done-bg)',
        'done-fg': 'var(--done-fg)',

        // --- NEW semantic role tokens (prefer these in new code) ---
        surface: 'var(--surface)',
        'surface-card': 'var(--surface-card)',
        'surface-elevated': 'var(--surface-elevated)',
        'surface-overlay': 'var(--surface-overlay)',
        'surface-sunken': 'var(--surface-sunken)',
        'surface-hover': 'var(--surface-hover)',
        'surface-selected': 'var(--surface-selected)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'text-on-brand': 'var(--text-on-brand)',
        'chart-1': 'var(--chart-1)',
        'chart-2': 'var(--chart-2)',
        'chart-3': 'var(--chart-3)',
        'chart-4': 'var(--chart-4)',
        'chart-5': 'var(--chart-5)',

        // --- Legacy aliases (kept so existing pages build; → role tokens via --c-*) ---
        ink: 'var(--c-ink)',
        'ink-2': 'var(--c-ink-2)',
        paper: 'var(--c-paper)',
        'paper-2': 'var(--c-paper-2)',
        line: 'var(--c-line)',
        bg: 'var(--c-bg)',
        card: 'var(--c-card)',
        primary: 'var(--c-primary)',
        'primary-deep': 'var(--c-primary-deep)',
        accent: 'var(--c-accent)',
        'accent-warm': 'var(--c-accent-warm)',
        'on-primary': 'var(--c-on-primary)',
        text: 'var(--c-text)',
        'text-mute': 'var(--c-text-mute)',
      }),
      // Status and action colours used AS TEXT read at AA (4.5:1) on cards,
      // the page and their own tints: text takes the deep `-fg` / `brand-text`
      // tone, while dots, fills and borders keep the bright solid.
      textColor: tokens({
        ok: 'var(--ok-fg)',
        warn: 'var(--warn-fg)',
        risk: 'var(--risk-fg)',
        info: 'var(--info-fg)',
        done: 'var(--done-fg)',
        brand: 'var(--brand-text)',
        primary: 'var(--brand-text)',
        'primary-deep': 'var(--brand-text)',
      }),
      borderColor: tokens({
        edge: 'var(--border)',
        strong: 'var(--border-strong)',
        divider: 'var(--divider)',
      }),
      ringColor: tokens({
        DEFAULT: 'var(--ring)',
        brand: 'var(--ring)',
      }),
      fontFamily: {
        // Bind to the CSS vars so the active theme/skin controls the face:
        // Blueprint (:root) = Anek/Hind/Spline; neev = Eczar/Hind/IBM Plex Mono.
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        // Constructo scale (size / line-height). Never below 14px for on-site content;
        // 13px caption/mono-sm allowed for desk-density grid metadata only.
        micro: ['12px', { lineHeight: '16px' }],
        caption: ['13px', { lineHeight: '18px' }],
        'mono-sm': ['13px', { lineHeight: '18px' }],
        small: ['14px', { lineHeight: '20px' }],
        body: ['16px', { lineHeight: '24px' }],
        h2: ['18px', { lineHeight: '24px' }],
        h1: ['22px', { lineHeight: '28px' }],
        display: ['28px', { lineHeight: '34px' }],
      },
      spacing: {
        tap: '48px',
      },
      minWidth: { tap: '48px' },
      minHeight: { tap: '48px' },
      borderRadius: {
        card: 'var(--radius-card)',
        sheet: 'var(--radius-sheet)',
        control: 'var(--radius-control)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        sheet: 'var(--shadow-sheet)',
        pop: 'var(--shadow-pop)',
      },
      transitionDuration: {
        160: '160ms',
      },
      keyframes: {
        'reveal-down': {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'reveal-down': 'reveal-down 160ms ease-out',
      },
    },
  },
  plugins: [],
}
