/**
 * Eyebrow, title and body: how every film names what you're looking at.
 * The title rises word by word; eyebrow and body follow; all leave together.
 */
import type {CSSProperties} from 'react';
import {useCurrentFrame} from 'remotion';

import {FONT} from '../../brand/fonts';
import {EASE, EXIT, prog} from '../../brand/motion';
import {KineticText} from '../../components/motion/text';

export type CaptionBlockProps = {
  eyebrow?: string;
  title: string;
  body?: string;
  start?: number;
  exitAt?: number;
  titleSize: number;
  bodySize?: number;
  eyebrowSize?: number;
  colors: {eyebrow: string; title: string; body: string};
  highlight?: Record<string, string>;
  width?: number;
  align?: 'left' | 'center';
  style?: CSSProperties;
};

export function CaptionBlock({
  eyebrow,
  title,
  body,
  start = 0,
  exitAt,
  titleSize,
  bodySize = 34,
  eyebrowSize = 24,
  colors,
  highlight,
  width,
  align = 'left',
  style,
}: CaptionBlockProps) {
  const frame = useCurrentFrame();
  const e = prog(frame, start, 14, EASE);
  const words = title.split(/\s+/).length;
  const b = prog(frame, start + 8 + words * 3, 16, EASE);
  const out = exitAt === undefined ? 0 : prog(frame, exitAt, 12, EXIT);
  return (
    <div style={{width, textAlign: align, opacity: 1 - out, transform: `translateY(${-out * 20}px)`, ...style}}>
      {eyebrow ? (
        <div
          style={{
            fontFamily: FONT.text,
            fontWeight: 600,
            fontSize: eyebrowSize,
            letterSpacing: eyebrowSize * 0.12,
            textTransform: 'uppercase',
            color: colors.eyebrow,
            opacity: e,
            transform: `translateX(${(1 - e) * -16}px)`,
            marginBottom: eyebrowSize * 0.7,
          }}
        >
          {eyebrow}
        </div>
      ) : null}
      <KineticText
        text={title}
        start={start + 4}
        stagger={3}
        duration={18}
        highlight={highlight}
        style={{
          fontFamily: FONT.display,
          fontWeight: 600,
          fontSize: titleSize,
          lineHeight: 1.08,
          letterSpacing: -titleSize * 0.018,
          color: colors.title,
        }}
      />
      {body ? (
        <div
          style={{
            fontFamily: FONT.text,
            fontSize: bodySize,
            lineHeight: 1.42,
            color: colors.body,
            marginTop: bodySize * 0.75,
            opacity: b,
            transform: `translateY(${(1 - b) * 12}px)`,
          }}
        >
          {body}
        </div>
      ) : null}
    </div>
  );
}
