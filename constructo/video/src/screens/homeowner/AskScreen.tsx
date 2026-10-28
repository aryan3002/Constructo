/**
 * Homeowner · Ask your home: answers come from the published record, with the
 * proof attached; questions about money or safety go to the builder instead of
 * being guessed.
 */
import {useCurrentFrame} from 'remotion';

import {FONT} from '../../brand/fonts';
import {EASE, prog, SETTLE} from '../../brand/motion';
import {useTheme} from '../../brand/theme';
import {Icon} from '../../components/ui/Icon';
import {EvidenceChip} from '../../components/ui/primitives';
import {graphemes} from '../../components/motion/text';
import {TypingDots} from '../../components/ui/chat';

export const ASK = {
  q1: 'When is the slab being poured?',
  a1: 'This Thursday. Shuttering for the second-floor slab started this morning.',
  q2: 'Can we add a skylight over the stairs? What would it cost?',
  a2: 'That touches cost and structure, so your builder will answer it directly. I won’t guess on money or safety.',
};

export type AskMarks = {q1At: number; a1At: number; q2At?: number; a2At?: number};

function Typed({text, at, frame, cps = 30}: {text: string; at: number; frame: number; cps?: number}) {
  const g = graphemes(text);
  const n = Math.max(0, Math.min(g.length, Math.floor(((frame - at) / 30) * cps)));
  return <>{g.slice(0, n).join('')}</>;
}

function Question({text, show}: {text: string; show: number}) {
  const t = useTheme();
  return (
    <div style={{alignSelf: 'flex-end', maxWidth: 290, opacity: show, transform: `translateY(${(1 - show) * 16}px)`}}>
      <div style={{background: t.brand, color: t.onBrand, borderRadius: 16, borderBottomRightRadius: 4, padding: '11px 14px', fontFamily: FONT.text, fontSize: 16.5, lineHeight: '23px'}}>
        {text}
      </div>
    </div>
  );
}

export function AskScreen({marks}: {marks: AskMarks}) {
  const frame = useCurrentFrame();
  const t = useTheme();
  const {q1At, a1At, q2At, a2At} = marks;
  // The question is typed into the box, then sent.
  const typing1 = frame >= q1At - 34 && frame < q1At;
  const typing2 = q2At !== undefined && frame >= q2At - 40 && frame < q2At;
  const q1 = prog(frame, q1At, 10, SETTLE);
  const thinking1 = frame >= q1At + 6 && frame < a1At;
  const a1 = prog(frame, a1At, 14, SETTLE);
  const q2 = q2At === undefined ? 0 : prog(frame, q2At, 10, SETTLE);
  const thinking2 = q2At !== undefined && a2At !== undefined && frame >= q2At + 6 && frame < a2At;
  const a2 = a2At === undefined ? 0 : prog(frame, a2At, 14, SETTLE);
  // Scroll up to keep the latest message in view.

  return (
    <div style={{position: 'absolute', inset: 0, background: t.surface}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, padding: '56px 16px 12px', background: t.surface, zIndex: 5, borderBottom: `1px solid ${t.line}`}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
          <Icon name="chevron-left" size={24} color={t.ink} />
          <span style={{width: 40, height: 40, borderRadius: 20, background: t.brand, color: t.onBrand, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <Icon name="zap" size={19} />
          </span>
          <span style={{display: 'flex', flexDirection: 'column'}}>
            <span style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 11.5, letterSpacing: 1, color: t.inkMuted, textTransform: 'uppercase'}}>Answered from your updates</span>
            <span style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 19, color: t.ink}}>Ask your home</span>
          </span>
        </div>
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 128, bottom: 150, overflow: 'hidden'}}>
        <div style={{display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 16px', transform: 'none'}}>
          {q1 > 0 ? <Question text={ASK.q1} show={q1} /> : null}
          {thinking1 ? (
            <div style={{alignSelf: 'flex-start', transform: 'scale(1.1)', transformOrigin: 'left'}}>
              <TypingDots phase={frame / 9} />
            </div>
          ) : null}
          {a1 > 0 ? (
            <div style={{alignSelf: 'flex-start', maxWidth: 318, opacity: a1, transform: `translateY(${(1 - a1) * 16}px)`}}>
              <div style={{background: t.surfaceRaised, border: `1px solid ${t.line}`, borderRadius: 16, borderBottomLeftRadius: 4, padding: '12px 14px', boxShadow: t.shadowCard}}>
                <div style={{fontFamily: FONT.text, fontSize: 16.5, lineHeight: '24px', color: t.ink}}>{ASK.a1}</div>
                <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10}}>
                  <EvidenceChip icon="mic" label="Site log · 6:52 am" highlight={prog(frame, a1At + 16, 8, EASE) * (1 - prog(frame, a1At + 40, 10, EASE))} />
                  <EvidenceChip icon="image" label="2 photos" />
                </div>
              </div>
            </div>
          ) : null}
          {q2 > 0 ? <Question text={ASK.q2} show={q2} /> : null}
          {thinking2 ? (
            <div style={{alignSelf: 'flex-start', transform: 'scale(1.1)', transformOrigin: 'left'}}>
              <TypingDots phase={frame / 9} />
            </div>
          ) : null}
          {a2 > 0 ? (
            <div style={{alignSelf: 'flex-start', maxWidth: 318, opacity: a2, transform: `translateY(${(1 - a2) * 16}px)`}}>
              <div style={{background: t.claySoft, borderRadius: 16, borderBottomLeftRadius: 4, padding: '12px 14px', display: 'flex', gap: 10}}>
                <Icon name="shield" size={18} color={t.clayText} style={{marginTop: 3}} />
                <div style={{fontFamily: FONT.text, fontSize: 16, lineHeight: '23px', color: t.ink}}>{ASK.a2}</div>
              </div>
              <div style={{display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '6px 12px', borderRadius: 999, background: t.surfaceRaised, border: `1px solid ${t.line}`, fontFamily: FONT.text, fontWeight: 600, fontSize: 14, color: t.brandStrong, opacity: prog(frame, a2At! + 18, 10, EASE)}}>
                <Icon name="send" size={14} />
                Sent to your site team
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {/* Composer */}
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 16px 34px', background: t.surface, borderTop: `1px solid ${t.line}`}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
          <div
            style={{
              flex: 1,
              minHeight: 50,
              borderRadius: 25,
              border: `1.5px solid ${t.line}`,
              background: t.surfaceRaised,
              padding: '12px 16px',
              fontFamily: FONT.text,
              fontSize: 16,
              color: typing1 || typing2 ? t.ink : t.inkMuted,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {typing1 ? <Typed text={ASK.q1} at={q1At - 34} frame={frame} /> : typing2 ? <Typed text={ASK.q2} at={q2At! - 40} frame={frame} cps={42} /> : 'Ask anything about your build…'}
          </div>
          <span style={{width: 50, height: 50, borderRadius: 25, background: t.brand, color: t.onBrand, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <Icon name="arrow-up" size={22} />
          </span>
        </div>
        <div style={{fontFamily: FONT.text, fontSize: 12.5, lineHeight: '17px', color: t.inkMuted, textAlign: 'center', marginTop: 10}}>
          Answers come from your published updates. I never guess on money or safety.
        </div>
      </div>
    </div>
  );
}
