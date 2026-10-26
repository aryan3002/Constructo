/**
 * Neev colour tokens for film. Values mirror the design system's tokens.css
 * (Day and Night themes) so the films and the app read as one product.
 */

export const day = {
  name: 'day' as const,
  surface: '#f3efe6',
  surfaceRaised: '#fcfaf3',
  surfaceInset: '#f7f2e8',
  surfaceSunken: '#ece5d7',
  line: '#d7cfbc',
  lineControl: '#8f836b',
  ink: '#2a2519',
  inkMuted: '#6a6047',
  quiet: '#8c7f66',
  brand: '#3e7a66',
  onBrand: '#ffffff',
  brandStrong: '#2f6151',
  brandSoft: '#cfe3d9',
  clay: '#ae5635',
  onClay: '#ffffff',
  clayText: '#92482a',
  claySoft: '#efdccb',
  marigold: '#f0a21f',
  marigoldEdge: '#a8690a',
  onMarigold: '#1b1916',
  ok: '#2f6151',
  okSoft: '#dcebe3',
  warn: '#7d5a13',
  warnSoft: '#f3e6c6',
  risk: '#a4382a',
  onRisk: '#ffffff',
  riskSoft: '#f4dcd5',
  info: '#6a6047',
  infoSoft: '#e7e1d4',
  scrim: 'rgba(27, 25, 22, 0.45)',
  shadowCard: '0 4px 12px rgba(42, 37, 25, 0.12)',
  shadowFloat: '0 6px 20px rgba(60, 50, 30, 0.14)',
};

export type Theme = Omit<typeof day, 'name'> & {name: 'day' | 'night'};

export const night: Theme = {
  name: 'night',
  surface: '#171511',
  surfaceRaised: '#221f19',
  surfaceInset: '#1c1915',
  surfaceSunken: '#2c2821',
  line: '#3a342b',
  lineControl: '#7a7060',
  ink: '#f1ece1',
  inkMuted: '#b3a991',
  quiet: '#8f8672',
  brand: '#74b89d',
  onBrand: '#0f231c',
  brandStrong: '#93cdb5',
  brandSoft: '#1d3a30',
  clay: '#dc8a64',
  onClay: '#24120a',
  clayText: '#e8a586',
  claySoft: '#3d2519',
  marigold: '#f0a21f',
  marigoldEdge: '#f0a21f',
  onMarigold: '#1b1916',
  ok: '#7cc6a5',
  okSoft: '#17302a',
  warn: '#e5b75c',
  warnSoft: '#33270f',
  risk: '#f08a7b',
  onRisk: '#2a0f0a',
  riskSoft: '#3b1d18',
  info: '#b3a991',
  infoSoft: '#2a261f',
  scrim: 'rgba(0, 0, 0, 0.62)',
  shadowCard: '0 4px 14px rgba(0, 0, 0, 0.45)',
  shadowFloat: '0 8px 24px rgba(0, 0, 0, 0.55)',
};

/** Fixed brand colours that never change with the theme. */
export const brand = {
  /** The mark as the app draws it on sand: sage level and peak, clay point. */
  sage: '#3e7a66',
  clay: '#ae5635',
  /** The store icon tile and the dark canvas of the bold film. */
  inkTile: '#1b1916',
  marigold: '#f0a21f',
  sand: '#f3efe6',
};

export const radius = {
  control: 11,
  bubble: 14,
  card: 16,
  sheet: 20,
  pill: 999,
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  gutter: 20,
  xl: 24,
  xxl: 32,
};
