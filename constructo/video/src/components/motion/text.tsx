/**
 * Type in motion. KineticText reveals words from a mask; TypeOn types by
 * grapheme (so Devanagari conjuncts never appear half-formed); Counter rolls
 * a number with Indian grouping.
 */
import {Fragment, type CSSProperties} from 'react';
import {useCurrentFrame} from 'remotion';

import {EXIT, prog, SETTLE} from '../../brand/motion';

export type KineticTextProps = {
  /** Use "\n" for a hard line break. */
  text: string;
  /** Frame (in the parent sequence) the first word starts. */
  start?: number;
  /** Frames between words. */
  stagger?: number;
  /** Frames each word takes to arrive. */
  duration?: number;
  /** Frame at which the whole line leaves (rises out). Omit to stay. */
  exitAt?: number;
  exitDuration?: number;
  /** Words (exact, punctuation included) to colour, e.g. {"₹12,000": clay}. */
  highlight?: Record<string, string>;
  /** Rise distance in em. */
  rise?: number;
  style?: CSSProperties;
  wordStyle?: (word: string, index: number) => CSSProperties | undefined;
};

export function KineticText({
  text,
  start = 0,
  stagger = 3,
  duration = 16,
  exitAt,
  exitDuration = 10,
  highlight,
  rise = 0.9,
  style,
  wordStyle,
}: KineticTextProps) {
  const frame = useCurrentFrame();
  const lines = text.split('\n');
  let index = 0;
  const out = exitAt === undefined ? 0 : prog(frame, exitAt, exitDuration, EXIT);
  return (
    <div style={{...style}}>
      {lines.map((line, li) => (
        <div key={li} style={{display: 'block'}}>
          {line.split(' ').map((word, wi) => {
            const i = index++;
            const p = prog(frame, start + i * stagger, duration, SETTLE);
            const y = (1 - p) * rise - out * rise;
            return (
              <Fragment key={wi}>
                <span style={{display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: '0.12em', marginBottom: '-0.12em'}}>
                  <span
                    style={{
                      display: 'inline-block',
                      transform: `translateY(${y}em)`,
                      opacity: Math.min(p * 1.6, 1) * (1 - out),
                      color: highlight?.[word],
                      ...wordStyle?.(word, i),
                    }}
                  >
                    {word}
                  </span>
                </span>
                {wi < line.split(' ').length - 1 ? ' ' : null}
              </Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const segmenter = new Intl.Segmenter('hi', {granularity: 'grapheme'});

export function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

/** Types `text` from `start` at `cps` graphemes per second (30fps). */
export function TypeOn({
  text,
  start = 0,
  cps = 22,
  caret = false,
  style,
}: {
  text: string;
  start?: number;
  cps?: number;
  caret?: boolean;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const g = graphemes(text);
  const n = Math.max(0, Math.min(g.length, Math.floor(((frame - start) / 30) * cps)));
  const done = n >= g.length;
  const showCaret = caret && (!done || Math.floor(frame / 15) % 2 === 0) && frame >= start;
  return (
    <span style={style}>
      {g.slice(0, n).join('')}
      {/* Reserve the rest invisibly so the layout never reflows while typing. */}
      <span style={{opacity: 0}}>{g.slice(n).join('')}</span>
      {showCaret ? (
        <span style={{display: 'inline-block', width: '0.08em', height: '1em', background: 'currentColor', marginLeft: '0.04em', verticalAlign: '-0.12em'}} />
      ) : null}
    </span>
  );
}

/** How many frames TypeOn needs for `text` at `cps`. */
export const typeDuration = (text: string, cps = 22) => Math.ceil((graphemes(text).length / cps) * 30);

export function Counter({
  from,
  to,
  start,
  duration,
  format = (n) => Math.round(n).toLocaleString('en-IN'),
  style,
}: {
  from: number;
  to: number;
  start: number;
  duration: number;
  format?: (n: number) => string;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const p = prog(frame, start, duration, SETTLE);
  return <span style={{fontVariantNumeric: 'tabular-nums', ...style}}>{format(from + (to - from) * p)}</span>;
}

/**
 * Roller: one slot of characters that rolls from one value to the next —
 * changed characters slide up and out as the new ones slide up and in.
 * `values` change at `at` frames (the first value shows from the start).
 */
export function Roller({
  values,
  at,
  duration = 10,
  stagger = 2,
  style,
  colors,
}: {
  values: string[];
  at: number[];
  duration?: number;
  stagger?: number;
  style?: CSSProperties;
  /** Optional colour per value. */
  colors?: string[];
}) {
  const frame = useCurrentFrame();
  let i = 0;
  for (let k = 1; k < values.length; k++) if (frame >= at[k - 1]) i = k;
  const cur = graphemes(values[i]);
  const prev = i > 0 ? graphemes(values[i - 1]) : null;
  const start = i > 0 ? at[i - 1] : -1000;
  const n = Math.max(cur.length, prev?.length ?? 0);
  return (
    <span style={{display: 'inline-flex', overflow: 'hidden', paddingBottom: '0.08em', ...style, color: colors?.[i] ?? style?.color}}>
      {Array.from({length: n}, (_, c) => {
        // Right-align the two values so units line up.
        const a = cur[c - (n - cur.length)];
        const b = prev ? prev[c - (n - prev.length)] : undefined;
        const changed = prev !== null && a !== b;
        const p = changed ? prog(frame, start + (n - 1 - c) * stagger, duration, SETTLE) : 1;
        return (
          <span key={c} style={{position: 'relative', display: 'inline-block'}}>
            <span style={{display: 'inline-block', transform: `translateY(${(1 - p) * 100}%)`, opacity: p}}>{a ?? ''}</span>
            {changed && b !== undefined ? (
              <span style={{position: 'absolute', left: 0, top: 0, transform: `translateY(${-p * 100}%)`, opacity: 1 - p, color: colors?.[i - 1]}}>{b}</span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
