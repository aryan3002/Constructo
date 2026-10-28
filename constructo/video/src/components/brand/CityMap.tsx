/**
 * Two places, one record: city markers with local clocks, joined by a dotted
 * arc that small marigold "updates" travel along. Used to show a family far
 * from site (Pune → Dubai).
 */
import {useCurrentFrame} from 'remotion';

import {FONT} from '../../brand/fonts';
import {clamp01, EASE, prog, SETTLE} from '../../brand/motion';

export type City = {
  x: number;
  y: number;
  name: string;
  time: string;
  people: Array<{initial: string; label: string; color: string}>;
  /** Where the label sits relative to the marker. */
  side?: 'left' | 'right' | 'above' | 'below';
};

/** When the first update leaves `from` and lands at `to`, relative to `start`. */
export const CITY_MAP_TIMING = {draw: [6, 24], depart: 32, travel: 28, every: 40} as const;

export function CityMap({
  from,
  to,
  start = 0,
  distance,
  colors,
  scale = 1,
  bend = 1,
}: {
  from: City;
  to: City;
  start?: number;
  distance: string;
  colors: {ink: string; muted: string; line: string; accent: string; surface: string; update?: string};
  scale?: number;
  /** How far, and to which side, the arc bows (1 = to the left of travel, -1 = to the right). */
  bend?: number;
}) {
  const frame = useCurrentFrame();
  const T = CITY_MAP_TIMING;
  const markA = prog(frame, start, 18, SETTLE);
  const arc = prog(frame, start + T.draw[0], T.draw[1], EASE);
  const markB = prog(frame, start + T.draw[0] + T.draw[1] - 6, 18, SETTLE);
  const dist = prog(frame, start + T.draw[0] + T.draw[1], 16, EASE);
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const bow = len * 0.28 * bend;
  const cx = mx + (dy / len) * bow;
  const cy = my - (dx / len) * bow;
  const path = `M${from.x} ${from.y} Q${cx} ${cy} ${to.x} ${to.y}`;
  const arcLen = len * (1 + 0.12 * Math.abs(bend));
  const at = (t: number) => ({
    x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * cx + t ** 2 * to.x,
    y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * cy + t ** 2 * to.y,
  });
  // The distance sits just outside the arc's midpoint, away from the bow.
  const mid = at(0.5);
  const nl = Math.hypot(mx - cx, my - cy) || 1;
  const distPos = {x: mid.x + ((mx - cx) / nl) * 42 * scale, y: mid.y + ((my - cy) / nl) * 42 * scale};
  // Updates leave every `every` frames; each has a short comet trail.
  const since = frame - start - T.depart;
  const updates = since < 0 ? [] : Array.from({length: Math.floor(since / T.every) + 1}, (_, i) => (since - i * T.every) / T.travel).filter((t) => t >= 0 && t <= 1);
  const dotColor = colors.update ?? colors.accent;

  const marker = (city: City, k: number) => (
    <g opacity={k} transform={`translate(${city.x} ${city.y}) scale(${0.6 + 0.4 * k})`}>
      <circle r={34 * scale} fill={colors.accent} opacity={0.12 * (1 + Math.sin(frame / 9))} />
      <circle r={13 * scale} fill={colors.accent} />
      <circle r={5 * scale} fill={colors.surface} />
    </g>
  );

  const label = (city: City, k: number) => {
    const side = city.side ?? 'below';
    const off = 50 * scale;
    const w = 520 * scale;
    const pos =
      side === 'left'
        ? {right: `calc(100% - ${city.x - off}px)`, top: city.y - 46 * scale, alignItems: 'flex-end' as const}
        : side === 'right'
          ? {left: city.x + off, top: city.y - 46 * scale, alignItems: 'flex-start' as const}
          : side === 'above'
            ? {left: city.x - w / 2, width: w, top: city.y - 150 * scale, alignItems: 'center' as const}
            : {left: city.x - w / 2, width: w, top: city.y + 44 * scale, alignItems: 'center' as const};
    return (
      <div
        style={{
          position: 'absolute',
          ...pos,
          display: 'flex',
          flexDirection: 'column',
          gap: 10 * scale,
          opacity: k,
          transform: `translateY(${(1 - k) * 14}px)`,
        }}
      >
        <div style={{display: 'flex', alignItems: 'baseline', gap: 14 * scale}}>
          <span style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 48 * scale, lineHeight: 1, color: colors.ink}}>{city.name}</span>
          <span style={{fontFamily: FONT.data, fontSize: 26 * scale, color: colors.muted}}>{city.time}</span>
        </div>
        <div style={{display: 'flex', gap: 10 * scale, flexWrap: 'wrap', justifyContent: side === 'left' ? 'flex-end' : side === 'right' ? 'flex-start' : 'center'}}>
          {city.people.map((p) => (
            <span
              key={p.label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10 * scale,
                padding: `${6 * scale}px ${16 * scale}px ${6 * scale}px ${6 * scale}px`,
                borderRadius: 999,
                background: colors.surface,
                border: `1.5px solid ${colors.line}`,
                fontFamily: FONT.text,
                fontWeight: 600,
                fontSize: 22 * scale,
                color: colors.ink,
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  width: 36 * scale,
                  height: 36 * scale,
                  borderRadius: 18 * scale,
                  background: p.color,
                  color: '#fcfaf3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18 * scale,
                }}
              >
                {p.initial}
              </span>
              {p.label}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{position: 'absolute', inset: 0}}>
      <svg style={{position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible'}}>
        <path d={path} fill="none" stroke={colors.line} strokeWidth={3 * scale} strokeDasharray={`${arcLen}`} strokeDashoffset={arcLen * (1 - arc)} />
        <path d={path} fill="none" stroke={colors.muted} strokeWidth={2.5 * scale} strokeDasharray={`2 ${14 * scale}`} strokeLinecap="round" opacity={arc} />
        {updates.map((t, i) =>
          [0, 0.03, 0.06, 0.09].map((lag, j) => {
            const tt = clamp01(t - lag);
            const p = at(tt);
            return <circle key={`${i}-${j}`} cx={p.x} cy={p.y} r={(10 - j * 2) * scale} fill={dotColor} opacity={(1 - j * 0.28) * Math.min(1, Math.sin(Math.PI * clamp01(t)) * 2.2)} />;
          }),
        )}
        {marker(from, markA)}
        {marker(to, markB)}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: distPos.x - 160,
          width: 320,
          top: distPos.y - 16 * scale,
          textAlign: 'center',
          fontFamily: FONT.data,
          fontWeight: 500,
          fontSize: 26 * scale,
          color: colors.muted,
          opacity: dist,
        }}
      >
        {distance}
      </div>
      {label(from, markA)}
      {label(to, markB)}
    </div>
  );
}
