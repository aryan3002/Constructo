/**
 * BenchmarkMark — the Neev mark, built in reading order exactly like the app's
 * splash: the LEVEL draws, the two LEGS grow up to meet, then the POINT drops
 * in and settles. Frame-driven, so it can be scrubbed, reversed or held.
 *
 * Geometry (viewBox 0 0 100 100) matches mobile/src/ui/BenchmarkMark.tsx:
 *   level = M26 78 L74 78 (stroke 8), legs = M29 67 L50 45 · M71 67 L50 45
 *   (stroke 8.5), point = circle 50,28 r5.7.
 */
import {useCurrentFrame} from 'remotion';

import {EASE, prog} from '../../brand/motion';
import {brand} from '../../brand/tokens';

const LEVEL_LEN = 48;
const LEG_LEN = 30.42;

/** Frame offsets of the app's build (0.5–1.1s level, 1.0–1.8s legs, 1.8–2.2s point), from the build start. */
export const MARK_BUILD = {level: [0, 18], legs: [15, 24], point: [39, 12], total: 51} as const;

export type BenchmarkMarkProps = {
  size: number;
  /** Frame (in the parent sequence) the build starts. Omit to show the resolved mark. */
  buildFrom?: number;
  /** Speed multiplier for the build (2 = twice as fast). */
  speed?: number;
  levelColor?: string;
  peakColor?: string;
  pointColor?: string;
  /** Draw the ink tile behind the mark (store-icon look). */
  tile?: string;
  /** 0–1: unbuild progress, for handing off or reversing out. */
  dissolve?: number;
};

export function BenchmarkMark({
  size,
  buildFrom,
  speed = 1,
  levelColor = brand.sage,
  peakColor = brand.sage,
  pointColor = brand.clay,
  tile,
  dissolve = 0,
}: BenchmarkMarkProps) {
  const frame = useCurrentFrame();
  const built = buildFrom === undefined;
  const t = built ? Infinity : (frame - buildFrom) * speed;

  const level = built ? 1 : prog(t, MARK_BUILD.level[0], MARK_BUILD.level[1], EASE);
  const legs = built ? 1 : prog(t, MARK_BUILD.legs[0], MARK_BUILD.legs[1], EASE);
  const point = built ? 1 : prog(t, MARK_BUILD.point[0], MARK_BUILD.point[1], EASE);
  const fade = 1 - dissolve;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{overflow: 'visible', display: 'block'}}>
      {tile ? <rect x={0} y={0} width={100} height={100} rx={22.4} fill={tile} opacity={fade} /> : null}
      <g transform={tile ? 'translate(20 20) scale(0.6)' : undefined} opacity={fade}>
        <path
          d="M26 78 L74 78"
          stroke={levelColor}
          strokeWidth={8}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={LEVEL_LEN}
          strokeDashoffset={LEVEL_LEN * (1 - level)}
          opacity={level > 0 ? 1 : 0}
        />
        {[
          'M29 67 L50 45',
          'M71 67 L50 45',
        ].map((d) => (
          <path
            key={d}
            d={d}
            stroke={peakColor}
            strokeWidth={8.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={LEG_LEN}
            strokeDashoffset={LEG_LEN * (1 - legs)}
            opacity={legs > 0 ? 1 : 0}
          />
        ))}
        <circle
          cx={50}
          cy={28 - 7 * (1 - point)}
          r={5.7 * (0.5 + 0.5 * point)}
          fill={pointColor}
          opacity={point}
        />
      </g>
    </svg>
  );
}
