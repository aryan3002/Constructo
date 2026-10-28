/**
 * A lock-screen style notification from Neev: app tile, title, one line of
 * news and an optional site photo. Drops in from above and settles.
 */
import {useCurrentFrame} from 'remotion';

import {FONT} from '../../brand/fonts';
import {clamp01, prog, SETTLE} from '../../brand/motion';
import {brand} from '../../brand/tokens';
import {BenchmarkMark} from '../brand/BenchmarkMark';
import {SiteIllustration, type SiteScene} from './SiteIllustration';

export function Notification({
  at,
  title,
  body,
  time = 'now',
  photo,
  width = 560,
  scale = 1,
}: {
  /** Frame it drops in. */
  at: number;
  title: string;
  body: string;
  time?: string;
  photo?: SiteScene;
  width?: number;
  scale?: number;
}) {
  const frame = useCurrentFrame();
  const k = prog(frame, at, 16, SETTLE);
  return (
    <div
      style={{
        width,
        zoom: scale,
        opacity: clamp01(k * 1.8),
        transform: `translateY(${(1 - k) * -40}px) scale(${0.94 + 0.06 * k})`,
        transformOrigin: '50% 0%',
        background: 'rgba(252,250,243,0.97)',
        borderRadius: 28,
        border: '1px solid rgba(42,37,25,0.07)',
        boxShadow: '0 24px 60px rgba(42,37,25,0.20), 0 2px 8px rgba(42,37,25,0.08)',
        padding: '16px 18px 18px',
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
      }}
    >
      <div style={{flex: 'none', width: 52, height: 52, borderRadius: 13, background: brand.inkTile, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <BenchmarkMark size={34} />
      </div>
      <div style={{flex: 1, minWidth: 0}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
          <span style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 15, letterSpacing: 1.2, color: '#7a705c'}}>NEEV</span>
          <span style={{fontFamily: FONT.text, fontSize: 16, color: '#7a705c'}}>{time}</span>
        </div>
        <div style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 21, color: '#2a2519', marginTop: 2}}>{title}</div>
        <div style={{fontFamily: FONT.text, fontSize: 19, lineHeight: 1.3, color: '#4a4334', marginTop: 2}}>{body}</div>
      </div>
      {photo ? (
        <div style={{flex: 'none', width: 74, height: 74, borderRadius: 12, overflow: 'hidden', marginTop: 4}}>
          <SiteIllustration scene={photo} />
        </div>
      ) : null}
    </div>
  );
}
