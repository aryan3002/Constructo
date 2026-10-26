/**
 * Motion for Neev films. Quick and quiet: things arrive, settle and stay.
 * Nothing spins, loops or bounces (the brand's "it settles" rule).
 */
import {Easing, interpolate} from 'remotion';

/** The app's ease (motionTokens.EASE): a calm ease-out. */
export const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);
/** Arrives with weight and settles, no overshoot. Bricks, cards, the phone. */
export const SETTLE = Easing.bezier(0.16, 1, 0.3, 1);
/** For moves that start and end at rest (camera pans, swaps). */
export const GLIDE = Easing.bezier(0.65, 0, 0.35, 1);
/** Leaving the frame: gathers speed. */
export const EXIT = Easing.bezier(0.55, 0, 1, 0.45);

/** 0 → 1 between `start` and `start + duration` frames, clamped. */
export function prog(frame: number, start: number, duration: number, easing = EASE): number {
  if (duration <= 0) return frame >= start ? 1 : 0;
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });
}

/** In, hold, out: 0 → 1 over `inDur`, 1 until `end - outDur`, then → 0 at `end`. */
export function window(
  frame: number,
  start: number,
  end: number,
  inDur = 12,
  outDur = 10,
  easing = EASE,
): number {
  const i = prog(frame, start, inDur, easing);
  const o = 1 - prog(frame, end - outDur, outDur, EXIT);
  return Math.min(i, o);
}

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** A deterministic pseudo-random in [0, 1) for seeded layouts (no Math.random in renders). */
export function seeded(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Frames per beat and per bar for a tempo at 30fps. */
export function beatGrid(bpm: number, fps = 30) {
  const beat = (60 / bpm) * fps;
  return {beat, bar: beat * 4, at: (bars: number, beats = 0) => Math.round(bars * beat * 4 + beats * beat)};
}
