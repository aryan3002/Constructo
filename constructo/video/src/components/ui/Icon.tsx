/**
 * Feather icons from the same font the app uses (@expo/vector-icons Feather),
 * so every glyph matches the product exactly.
 */
import type {CSSProperties} from 'react';

import {FONT} from '../../brand/fonts';
import glyphs from '../../feather-glyphs.json';

export type IconName = keyof typeof glyphs;

export function Icon({
  name,
  size = 20,
  color = 'currentColor',
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      style={{
        fontFamily: FONT.icon,
        fontSize: size,
        lineHeight: 1,
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        flexShrink: 0,
        ...style,
      }}
    >
      {String.fromCodePoint(glyphs[name])}
    </span>
  );
}
