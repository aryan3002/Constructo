/**
 * The 3-second logo sting: the mark builds (level → legs → point), the name
 * rises, नींव follows. Transparent by default so it drops onto any edit
 * (render as ProRes 4444 or WebM VP9 with alpha); `background` fills it.
 */
import {AbsoluteFill, useCurrentFrame} from 'remotion';

import {FONT} from '../brand/fonts';
import {EASE, prog, SETTLE} from '../brand/motion';
import {brand, day} from '../brand/tokens';
import {BenchmarkMark, MARK_BUILD} from '../components/brand/BenchmarkMark';
import {Sfx} from '../films/shared/layout';

export type LogoStingProps = {
  tone: 'day' | 'night';
  background?: string;
  audio?: boolean;
};

export function LogoSting({tone, background}: LogoStingProps) {
  const frame = useCurrentFrame();
  const night = tone === 'night';
  const markColor = night ? brand.marigold : brand.sage;
  const pointColor = night ? brand.marigold : brand.clay;
  const word = night ? day.surface : day.ink;
  const built = 10 + MARK_BUILD.total;
  const name = prog(frame, built - 14, 20, SETTLE);
  const hindi = prog(frame, built - 2, 18, EASE);
  return (
    <AbsoluteFill style={{background: background ?? 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <Sfx name="chime" at={built - 8} volume={0.6} />
      <div style={{display: 'flex', alignItems: 'center', gap: 44}}>
        <BenchmarkMark size={260} buildFrom={10} levelColor={markColor} peakColor={markColor} pointColor={pointColor} />
        <div style={{display: 'flex', flexDirection: 'column'}}>
          <div style={{overflow: 'hidden', paddingBottom: 12}}>
            <div
              style={{
                fontFamily: FONT.display,
                fontWeight: 600,
                fontSize: 190,
                lineHeight: 1,
                letterSpacing: -5,
                color: word,
                transform: `translateY(${(1 - name) * 105}%)`,
              }}
            >
              Neev
            </div>
          </div>
          <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 64, color: night ? brand.marigold : brand.clay, opacity: hindi, transform: `translateY(${(1 - hindi) * 14}px)`}}>
            नींव
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
