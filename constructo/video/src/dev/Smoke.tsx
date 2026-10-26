import {AbsoluteFill} from 'remotion';

import {FONT} from '../brand/fonts';
import {day} from '../brand/tokens';
import {BenchmarkMark} from '../components/brand/BenchmarkMark';
import {Icon} from '../components/ui/Icon';

export function Smoke() {
  return (
    <AbsoluteFill style={{background: day.surface, padding: 80, gap: 24, color: day.ink}}>
      <BenchmarkMark size={220} buildFrom={0} />
      <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 96}}>You're okay. आप निश्चिंत रहें।</div>
      <div style={{fontFamily: FONT.text, fontSize: 40}}>सर, आज 14 लोग आए हैं। Second-floor shuttering.</div>
      <div style={{fontFamily: FONT.data, fontSize: 56, fontWeight: 500}}>₹72,000 · 120 bags · 6:52 am</div>
      <div style={{display: 'flex', gap: 24, color: day.brand}}>
        {(['home', 'camera', 'mic', 'check-circle', 'alert-triangle', 'image', 'message-circle', 'layout'] as const).map((n) => (
          <Icon key={n} name={n} size={56} />
        ))}
      </div>
    </AbsoluteFill>
  );
}
