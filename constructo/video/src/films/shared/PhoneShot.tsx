/**
 * PhoneShot: places the phone in the frame, brings it in, and lets the scene
 * push in on any point of the screen (in app points) and back out.
 */
import type {ReactNode} from 'react';
import {useCurrentFrame} from 'remotion';

import {EXIT, GLIDE, mix, prog, SETTLE} from '../../brand/motion';
import type {Theme} from '../../brand/tokens';
import {DEVICE, PhoneFrame} from '../../components/ui/PhoneFrame';

/** z = zoom; (fx, fy) = the screen point (in 390×844 app points) to keep at its resting spot. */
export type FocusKey = {f: number; z: number; fx?: number; fy?: number; dx?: number; dy?: number};

export function PhoneShot({
  x,
  y,
  scale,
  enterAt = 0,
  exitAt,
  focus = [],
  time,
  theme,
  glow,
  tilt = 3,
  children,
}: {
  /** Top-left of the device at rest, in composition pixels. */
  x: number;
  y: number;
  scale: number;
  enterAt?: number;
  exitAt?: number;
  focus?: FocusKey[];
  time?: string;
  theme?: Theme;
  glow?: boolean;
  tilt?: number;
  children: ReactNode;
}) {
  const frame = useCurrentFrame();
  const enter = prog(frame, enterAt, 26, SETTLE);
  const leave = exitAt === undefined ? 0 : prog(frame, exitAt, 14, EXIT);

  // Interpolate zoom and focus between keys.
  let z = 1;
  let fx = DEVICE.width / 2;
  let fy = DEVICE.height / 2;
  let dx = 0;
  let dy = 0;
  if (focus.length) {
    const k0 = focus[0];
    z = k0.z;
    fx = k0.fx ?? fx;
    fy = k0.fy ?? fy;
    dx = k0.dx ?? 0;
    dy = k0.dy ?? 0;
    for (let i = 1; i < focus.length; i++) {
      const a = focus[i - 1];
      const b = focus[i];
      if (frame < a.f) break;
      const t = prog(frame, a.f, b.f - a.f, GLIDE);
      z = mix(a.z, b.z, t);
      fx = mix(a.fx ?? DEVICE.width / 2, b.fx ?? DEVICE.width / 2, t);
      fy = mix(a.fy ?? DEVICE.height / 2, b.fy ?? DEVICE.height / 2, t);
      dx = mix(a.dx ?? 0, b.dx ?? 0, t);
      dy = mix(a.dy ?? 0, b.dy ?? 0, t);
    }
  }
  // Screen point → device pixels (13px bezel), then into the frame.
  const ox = (fx + 13) * scale;
  const oy = (fy + 13) * scale;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: DEVICE.width * scale,
        height: DEVICE.height * scale,
        opacity: Math.min(1, enter * 1.5) * (1 - leave),
        transform: `translate(${dx}px, ${(1 - enter) * 260 + dy + leave * 60}px) rotate(${(1 - enter) * tilt}deg)`,
        transformOrigin: 'bottom center',
      }}
    >
      <div style={{position: 'absolute', inset: 0, transform: `scale(${z})`, transformOrigin: `${ox}px ${oy}px`}}>
        <PhoneFrame scale={scale} time={time} theme={theme} glow={glow}>
          {children}
        </PhoneFrame>
      </div>
    </div>
  );
}
