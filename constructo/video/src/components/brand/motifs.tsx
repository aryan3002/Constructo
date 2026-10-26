/**
 * Brand motifs drawn from the site itself.
 *  - SurveyGrid: the setting-out grid of dots a site is marked from.
 *  - LevelDatum: the section-drawing level mark (▽ ±0.00) with its datum line.
 *  - Brick / BrickWall: courses laid in stretcher bond, each brick settling in.
 *  - Wordmark: "Neev" with "नींव".
 */
import type {CSSProperties, ReactNode} from 'react';
import {useCurrentFrame} from 'remotion';

import {FONT} from '../../brand/fonts';
import {clamp01, EASE, mix, prog, SETTLE} from '../../brand/motion';

export function SurveyGrid({
  width,
  height,
  pitch = 48,
  dot = 2.4,
  color,
  reveal = 1,
  origin,
  opacity = 1,
  offset = {x: 0, y: 0},
}: {
  width: number;
  height: number;
  pitch?: number;
  dot?: number;
  color: string;
  /** 0–1: the grid spreads out from `origin` (defaults to the centre). */
  reveal?: number;
  origin?: {x: number; y: number};
  opacity?: number;
  /** Slow drift, in pixels (wraps every pitch). */
  offset?: {x: number; y: number};
}) {
  const o = origin ?? {x: width / 2, y: height / 2};
  const maxD = Math.hypot(Math.max(o.x, width - o.x), Math.max(o.y, height - o.y));
  const ox = ((offset.x % pitch) + pitch) % pitch;
  const oy = ((offset.y % pitch) + pitch) % pitch;
  const dots: ReactNode[] = [];
  for (let y = -pitch + oy + pitch / 2; y < height + pitch; y += pitch) {
    for (let x = -pitch + ox + pitch / 2; x < width + pitch; x += pitch) {
      const d = Math.hypot(x - o.x, y - o.y) / maxD;
      const a = clamp01((reveal * 1.25 - d) / 0.25);
      if (a <= 0) continue;
      dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={dot * (0.6 + 0.4 * a)} fill={color} opacity={a} />);
    }
  }
  return (
    <svg width={width} height={height} style={{position: 'absolute', left: 0, top: 0, opacity}}>
      {dots}
    </svg>
  );
}

/** The level mark from a section drawing: a half-filled ▽ on a datum line, with its level. */
export function LevelDatum({
  x,
  y,
  length,
  progress = 1,
  label = '±0.00',
  color,
  size = 1,
  labelStyle,
}: {
  x: number;
  y: number;
  length: number;
  progress?: number;
  label?: string;
  color: string;
  size?: number;
  labelStyle?: CSSProperties;
}) {
  const head = clamp01(progress * 4);
  const s = 18 * size;
  return (
    <div style={{position: 'absolute', left: x, top: y, width: length, height: 0}}>
      <div style={{position: 'absolute', left: 0, top: -0.75 * size, height: 1.5 * size, width: length * progress, background: color}} />
      <svg
        width={s * 1.2}
        height={s}
        viewBox="0 0 24 20"
        style={{position: 'absolute', left: 6 * size, top: -s - 2 * size, opacity: head, overflow: 'visible'}}
      >
        <path d="M2 1 L22 1 L12 18 Z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        <path d="M12 1 L22 1 L12 18 Z" fill={color} />
      </svg>
      <span
        style={{
          position: 'absolute',
          left: 6 * size + s * 1.2 + 10 * size,
          top: -s - 4 * size,
          fontFamily: FONT.data,
          fontSize: 17 * size,
          color,
          opacity: head,
          whiteSpace: 'nowrap',
          ...labelStyle,
        }}
      >
        {label}
      </span>
    </div>
  );
}

export type BrickSpec = {
  /** Width in brick units (1 = a full brick, 0.5 = a half bat). */
  w?: number;
  color: string;
  label?: string;
  labelColor?: string;
};

export function Brick({
  width,
  height,
  color,
  label,
  labelColor = '#fcfaf3',
  fontSize,
  style,
}: {
  width: number;
  height: number;
  color: string;
  label?: string;
  labelColor?: string;
  fontSize?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: Math.min(height * 0.18, 14),
        background: color,
        boxShadow: `inset 0 ${height * 0.06}px 0 rgba(255,255,255,0.14), inset 0 -${height * 0.08}px 0 rgba(0,0,0,0.14)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: labelColor,
        fontFamily: FONT.text,
        fontWeight: 600,
        fontSize: fontSize ?? height * 0.3,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        ...style,
      }}
    >
      {label}
    </div>
  );
}

export type WallLayout = {
  courses: BrickSpec[][];
  brick: {w: number; h: number};
  joint: number;
};

/** Absolute position of every brick in a stretcher-bond wall (bottom course first). */
export function layWall({courses, brick, joint}: WallLayout) {
  const placed: Array<{course: number; index: number; x: number; y: number; w: number; spec: BrickSpec}> = [];
  courses.forEach((course, c) => {
    let x = 0;
    course.forEach((spec, i) => {
      const w = (spec.w ?? 1) * brick.w + ((spec.w ?? 1) - 1) * joint;
      placed.push({course: c, index: i, x, y: -(c + 1) * (brick.h + joint), w, spec});
      x += w + joint;
    });
  });
  return placed;
}

/**
 * A wall laid course by course. Each brick drops a short distance and settles,
 * in reading order, `stagger` frames apart, starting at `start`.
 * Returns the frames each brick lands (for sound cues) via `landingFrames`.
 */
export function BrickWall({
  layout,
  start,
  stagger = 3,
  duration = 14,
  from = 'above',
  fontSize,
  style,
}: {
  layout: WallLayout;
  start: number;
  stagger?: number;
  duration?: number;
  from?: 'above' | 'left' | 'right';
  fontSize?: number;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const placed = layWall(layout);
  const height = layout.courses.length * (layout.brick.h + layout.joint);
  return (
    <div style={{position: 'relative', height, ...style}}>
      {placed.map((b, i) => {
        const p = prog(frame, start + i * stagger, duration, SETTLE);
        const dx = from === 'left' ? -1 : from === 'right' ? 1 : 0;
        const dy = from === 'above' ? -1 : 0;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: b.x,
              top: height + b.y,
              opacity: clamp01(p * 3),
              transform: `translate(${dx * (1 - p) * 120}px, ${dy * (1 - p) * 90}px)`,
            }}
          >
            <Brick width={b.w} height={layout.brick.h} color={b.spec.color} label={b.spec.label} labelColor={b.spec.labelColor} fontSize={fontSize} />
          </div>
        );
      })}
    </div>
  );
}

export const landingFrames = (count: number, start: number, stagger = 3, duration = 14) =>
  Array.from({length: count}, (_, i) => start + i * stagger + Math.round(duration * 0.55));

export function Wordmark({
  size,
  color,
  hindiColor,
  start,
  showHindi = true,
  align = 'left',
}: {
  size: number;
  color: string;
  hindiColor?: string;
  /** Frame the word rises in; omit for static. */
  start?: number;
  showHindi?: boolean;
  align?: 'left' | 'center';
}) {
  const frame = useCurrentFrame();
  const p = start === undefined ? 1 : prog(frame, start, 20, SETTLE);
  const h = start === undefined ? 1 : prog(frame, start + 10, 20, EASE);
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'flex-start'}}>
      <div style={{overflow: 'hidden', paddingBottom: size * 0.08}}>
        <div
          style={{
            fontFamily: FONT.display,
            fontWeight: 600,
            fontSize: size,
            lineHeight: 1,
            letterSpacing: mix(size * 0.02, -size * 0.025, p),
            color,
            transform: `translateY(${(1 - p) * 100}%)`,
          }}
        >
          Neev
        </div>
      </div>
      {showHindi ? (
        <div
          style={{
            fontFamily: FONT.display,
            fontWeight: 600,
            fontSize: size * 0.34,
            lineHeight: 1.3,
            color: hindiColor ?? color,
            opacity: h,
            transform: `translateY(${(1 - h) * 12}px)`,
            marginTop: size * 0.02,
          }}
        >
          नींव
        </div>
      ) : null}
    </div>
  );
}
