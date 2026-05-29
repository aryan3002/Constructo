/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // --- Legacy brand palette (kept so not-yet-retrofitted pages build) ---
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1e40af',
        },

        // --- Constructo "Blueprint & Daylight" tokens (CSS-var backed) ---
        // These resolve per active data-theme. Use bg-paper / text-ink / etc.
        ok: 'var(--c-ok)',
        warn: 'var(--c-warn)',
        risk: 'var(--c-risk)',
        info: 'var(--c-info)',

        ink: 'var(--c-ink)',
        'ink-2': 'var(--c-ink-2)',
        paper: 'var(--c-paper)',
        'paper-2': 'var(--c-paper-2)',
        line: 'var(--c-line)',

        // Theme-mapped roles
        bg: 'var(--c-bg)',
        card: 'var(--c-card)',
        primary: 'var(--c-primary)',
        'primary-deep': 'var(--c-primary-deep)',
        accent: 'var(--c-accent)',
        'accent-warm': 'var(--c-accent-warm)',
        'on-primary': 'var(--c-on-primary)',

        text: 'var(--c-text)',
        'text-mute': 'var(--c-text-mute)',
      },
      fontFamily: {
        display: ['Anek Latin', 'Anek Devanagari', 'system-ui', 'sans-serif'],
        body: ['Hind', 'Anek Devanagari', 'system-ui', 'sans-serif'],
        mono: ['Spline Sans Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Constructo mobile scale (size / line-height). Never below 14px content.
        micro: ['12px', { lineHeight: '16px' }],
        small: ['14px', { lineHeight: '20px' }],
        body: ['16px', { lineHeight: '24px' }],
        h2: ['18px', { lineHeight: '24px' }],
        h1: ['22px', { lineHeight: '28px' }],
        display: ['28px', { lineHeight: '34px' }],
      },
      spacing: {
        // 4px base scale: 4/8/12/16/24/32/48 (existing Tailwind scale already
        // covers these; alias `tap` for the >=48px touch-target minimum).
        tap: '48px',
      },
      minWidth: {
        tap: '48px',
      },
      minHeight: {
        tap: '48px',
      },
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
