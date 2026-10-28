/**
 * Cut sheets: every film is a list of sections measured in bars of its score,
 * so picture and music share one grid. cuts.json is also read by the score
 * generator (scripts/score.py).
 */
import cuts from './cuts.json';

export const FPS = 30;

export type Variant = 'a' | 'b' | 'c';
export type Format = 'youtube' | 'reel';

export type Section = {id: string; from: number; duration: number; bars: number};

export function framesPerBar(variant: Variant) {
  return (60 / cuts[variant].bpm) * 4 * FPS;
}

export function framesPerBeat(variant: Variant) {
  return (60 / cuts[variant].bpm) * FPS;
}

export function sections(variant: Variant, format: Format): Section[] {
  const bar = framesPerBar(variant);
  let from = 0;
  return (cuts[variant][format] as Array<[string, number]>).map(([id, bars]) => {
    const duration = Math.round(bars * bar);
    const s = {id, from, duration, bars};
    from += duration;
    return s;
  });
}

export function totalFrames(variant: Variant, format: Format) {
  const s = sections(variant, format);
  const last = s[s.length - 1];
  return last.from + last.duration;
}

export const DIMENSIONS: Record<Format, {width: number; height: number}> = {
  youtube: {width: 1920, height: 1080},
  reel: {width: 1080, height: 1920},
};
