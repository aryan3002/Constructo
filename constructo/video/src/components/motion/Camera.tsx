/**
 * Camera: moves a layer through keyframes (scale + translate) with a glide, so
 * a scene can push in on a card and pull back out. Keyframes are in the
 * parent sequence's frames; x/y are pixels in the composition.
 */
import type {CSSProperties, ReactNode} from 'react';
import {useCurrentFrame} from 'remotion';

import {GLIDE, mix, prog} from '../../brand/motion';

export type CameraKey = {f: number; s?: number; x?: number; y?: number; r?: number};

export function cameraAt(frame: number, keys: CameraKey[], easing = GLIDE) {
  let s = keys[0].s ?? 1;
  let x = keys[0].x ?? 0;
  let y = keys[0].y ?? 0;
  let r = keys[0].r ?? 0;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    const t = prog(frame, a.f, b.f - a.f, easing);
    if (frame >= a.f) {
      s = mix(a.s ?? 1, b.s ?? 1, t);
      x = mix(a.x ?? 0, b.x ?? 0, t);
      y = mix(a.y ?? 0, b.y ?? 0, t);
      r = mix(a.r ?? 0, b.r ?? 0, t);
    }
  }
  return {s, x, y, r};
}

export function Camera({
  keys,
  origin = 'center center',
  children,
  style,
}: {
  keys: CameraKey[];
  origin?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const {s, x, y, r} = cameraAt(frame, keys);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `translate(${x}px, ${y}px) scale(${s}) rotate(${r}deg)`,
        transformOrigin: origin,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
