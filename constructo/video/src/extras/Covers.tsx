/**
 * Thumbnails (YouTube 1280×720) and Reel covers (1080×1920) for the films.
 * Reel covers keep their words inside the centre 3:4 crop that the Instagram
 * profile grid shows.
 */
import {AbsoluteFill} from 'remotion';

import {FONT} from '../brand/fonts';
import {brand, day} from '../brand/tokens';
import {BenchmarkMark} from '../components/brand/BenchmarkMark';
import {Brick, SurveyGrid} from '../components/brand/motifs';
import {Bubble} from '../components/ui/chat';
import {HOME_HERO_HI, HomeHero} from '../components/ui/cards';
import {EvidenceChip} from '../components/ui/primitives';
import {ThemeProvider} from '../brand/theme';
import {INK} from '../films/b/scenes';

function Lockup({night, size = 1}: {night?: boolean; size?: number}) {
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 14 * size}}>
      <BenchmarkMark
        size={64 * size}
        levelColor={night ? brand.marigold : brand.sage}
        peakColor={night ? brand.marigold : brand.sage}
        pointColor={night ? brand.marigold : brand.clay}
      />
      <span style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 52 * size, color: night ? INK.paper : day.ink, letterSpacing: -1}}>Neev</span>
    </div>
  );
}

/** The family's Home card, used as the hero of film A's covers. */
function HomeCard({width}: {width: number}) {
  return (
    <ThemeProvider theme={day}>
      {/* zoom (not transform) so the scaled card still takes its full height in layout */}
      <div style={{width: 360, zoom: width / 360}}>
        <div style={{width: 360}}>
          <HomeHero copy={HOME_HERO_HI} progress={0.62} />
        </div>
      </div>
    </ThemeProvider>
  );
}

export function ThumbA() {
  return (
    <AbsoluteFill style={{background: day.surface, overflow: 'hidden'}}>
      <SurveyGrid width={1280} height={720} pitch={44} dot={2} color={day.line} />
      <div style={{position: 'absolute', left: 70, top: 92}}>
        <div style={{transform: 'scale(2.1)', transformOrigin: 'left top'}}>
          <Bubble side="in" time="8:48 pm" fontSize={18}>
            सब बढ़िया है, सर।
          </Bubble>
        </div>
        <div style={{fontFamily: FONT.display, fontWeight: 700, fontSize: 132, lineHeight: 0.98, letterSpacing: -3, color: day.ink, marginTop: 100}}>
          All good,
          <br />
          sir?
        </div>
      </div>
      <div style={{position: 'absolute', left: 74, bottom: 50}}>
        <Lockup />
      </div>
      <div style={{position: 'absolute', left: 760, top: 70, transform: 'rotate(3deg)'}}>
        <div style={{boxShadow: '0 40px 80px rgba(42,37,25,0.25)', borderRadius: 26}}>
          <HomeCard width={470} />
        </div>
        <div
          style={{
            marginTop: 26,
            marginLeft: 20,
            fontFamily: FONT.text,
            fontWeight: 600,
            fontSize: 30,
            color: day.brandStrong,
            background: day.brandSoft,
            borderRadius: 999,
            padding: '10px 22px',
            display: 'inline-block',
          }}
        >
          …this time, with proof.
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function ThumbB() {
  return (
    <AbsoluteFill style={{background: brand.inkTile, overflow: 'hidden'}}>
      <SurveyGrid width={1280} height={720} pitch={46} dot={2} color="#3a342b" />
      <div style={{position: 'absolute', left: 70, top: 64, display: 'flex', flexDirection: 'column', gap: 0}}>
        <div style={{display: 'flex', alignItems: 'baseline', gap: 26}}>
          <span style={{fontFamily: FONT.data, fontWeight: 500, fontSize: 176, color: INK.paper, letterSpacing: -8}}>120</span>
          <span style={{fontFamily: FONT.display, fontWeight: 700, fontSize: 84, color: INK.paper}}>billed.</span>
        </div>
        <div style={{display: 'flex', alignItems: 'baseline', gap: 26, marginTop: -18}}>
          <span style={{fontFamily: FONT.data, fontWeight: 500, fontSize: 176, color: INK.paper, letterSpacing: -8}}>100</span>
          <span style={{fontFamily: FONT.display, fontWeight: 700, fontSize: 84, color: INK.paper}}>delivered.</span>
        </div>
        <div style={{fontFamily: FONT.display, fontWeight: 700, fontSize: 92, color: INK.risk, marginTop: 6, letterSpacing: -2}}>₹12,000 gone.</div>
      </div>
      <div style={{position: 'absolute', right: 70, bottom: 56, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12}}>
        <Lockup night size={1.25} />
        <span style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 30, color: INK.marigold}}>Build on the truth.</span>
      </div>
    </AbsoluteFill>
  );
}

export function CoverA() {
  return (
    <AbsoluteFill style={{background: day.surface, overflow: 'hidden'}}>
      <SurveyGrid width={1080} height={1920} pitch={56} dot={2.2} color={day.line} />
      <div style={{position: 'absolute', left: 90, top: 330, right: 90}}>
        <div style={{transform: 'scale(2.6)', transformOrigin: 'left top', display: 'inline-block'}}>
          <Bubble side="in" time="8:48 pm" fontSize={18}>
            सब बढ़िया है, सर।
          </Bubble>
        </div>
        <div style={{fontFamily: FONT.display, fontWeight: 700, fontSize: 176, lineHeight: 0.96, letterSpacing: -4, color: day.ink, marginTop: 160}}>
          All good,
          <br />
          sir?
        </div>
      </div>
      <div style={{position: 'absolute', left: 150, top: 1010, transform: 'rotate(-2deg)'}}>
        <div style={{boxShadow: '0 40px 80px rgba(42,37,25,0.25)', borderRadius: 26}}>
          <HomeCard width={780} />
        </div>
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 1610, display: 'flex', justifyContent: 'center'}}>
        <Lockup size={1.2} />
      </div>
    </AbsoluteFill>
  );
}

export function CoverB() {
  return (
    <AbsoluteFill style={{background: brand.inkTile, overflow: 'hidden'}}>
      <SurveyGrid width={1080} height={1920} pitch={60} dot={2.2} color="#3a342b" />
      <div style={{position: 'absolute', left: 90, top: 380, right: 60}}>
        <div style={{fontFamily: FONT.data, fontWeight: 500, fontSize: 250, lineHeight: 1, color: INK.paper, letterSpacing: -10}}>120</div>
        <div style={{fontFamily: FONT.display, fontWeight: 700, fontSize: 110, color: INK.paper, marginTop: 10}}>bags billed.</div>
        <div style={{fontFamily: FONT.data, fontWeight: 500, fontSize: 250, lineHeight: 1, color: INK.paper, letterSpacing: -10, marginTop: 60}}>100</div>
        <div style={{fontFamily: FONT.display, fontWeight: 700, fontSize: 110, color: INK.paper, marginTop: 10}}>delivered.</div>
        <div style={{fontFamily: FONT.display, fontWeight: 700, fontSize: 110, color: INK.risk, marginTop: 50}}>₹12,000 gone.</div>
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 1570, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14}}>
        <Lockup night size={1.3} />
        <span style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 38, color: INK.marigold}}>Build on the truth.</span>
      </div>
    </AbsoluteFill>
  );
}

/** A course of the record along the bottom edge, with the marigold point on top. */
function RecordCourse({top, brickW, brickH, offset = 0, width}: {top: number; brickW: number; brickH: number; offset?: number; width: number}) {
  const labels = ['Voice note', 'Site photo', 'Invoice', 'Weekly letter', 'Approval', 'Delivery', 'Question', 'Milestone'];
  const colors = [brand.clay, '#3e7a66', '#c9bfa9', '#8a5a2b', '#4a443a'];
  const gap = brickH * 0.16;
  const n = Math.ceil((width - offset) / (brickW + gap)) + 1;
  // The point sits on the brick nearest the middle of the frame.
  const mid = Math.round((width / 2 - offset - brickW / 2) / (brickW + gap));
  return (
    <>
      <div style={{position: 'absolute', left: offset, top, display: 'flex', gap}}>
        {Array.from({length: n}, (_, i) => {
          const color = colors[(i * 3) % colors.length];
          return <Brick key={i} width={brickW} height={brickH} color={color} label={labels[i % labels.length]} labelColor={color === '#c9bfa9' ? '#2a2519' : '#fcfaf3'} fontSize={brickH * 0.3} />;
        })}
      </div>
      <div
        style={{
          position: 'absolute',
          left: offset + mid * (brickW + gap) + brickW / 2 - brickH * 0.36,
          top: top - brickH * 0.92,
          width: brickH * 0.72,
          height: brickH * 0.72,
          borderRadius: brickH,
          background: brand.marigold,
          boxShadow: '0 10px 30px rgba(240,162,31,0.35)',
        }}
      />
    </>
  );
}

function ProofChips({size = 1}: {size?: number}) {
  return (
    <ThemeProvider theme={day}>
      <div style={{display: 'flex', gap: 10, zoom: size}}>
        <EvidenceChip icon="mic" label="Site log · 6:52 am" />
        <EvidenceChip icon="image" label="2 photos" />
        <EvidenceChip icon="file-text" label="Weekly letter" />
      </div>
    </ThemeProvider>
  );
}

/** Film C: the question, the family's answer with its proof, and the record it stands on. */
export function ThumbC() {
  return (
    <AbsoluteFill style={{background: day.surface, overflow: 'hidden'}}>
      <SurveyGrid width={1280} height={720} pitch={44} dot={2} color={day.line} />
      <div style={{position: 'absolute', left: 70, top: 64}}>
        <div style={{transform: 'scale(2)', transformOrigin: 'left top', display: 'inline-block'}}>
          <Bubble side="in" time="8:48 pm" fontSize={18}>
            सब ठीक है, सर।
          </Bubble>
        </div>
        <div style={{fontFamily: FONT.display, fontWeight: 700, fontSize: 124, lineHeight: 0.98, letterSpacing: -3, color: day.ink, marginTop: 96}}>
          All good,
          <br />
          sir?
        </div>
        <div style={{marginTop: 26}}>
          <Lockup size={0.8} />
        </div>
      </div>
      <div style={{position: 'absolute', left: 740, top: 52, transform: 'rotate(3deg)'}}>
        <div style={{boxShadow: '0 40px 80px rgba(42,37,25,0.25)', borderRadius: 26, display: 'inline-block'}}>
          <HomeCard width={460} />
        </div>
        <div style={{marginTop: 18, marginLeft: 6}}>
          <ProofChips size={1.25} />
        </div>
      </div>
      <RecordCourse top={634} brickW={190} brickH={54} offset={-60} width={1280} />
    </AbsoluteFill>
  );
}

export function CoverC() {
  return (
    <AbsoluteFill style={{background: day.surface, overflow: 'hidden'}}>
      <SurveyGrid width={1080} height={1920} pitch={56} dot={2.2} color={day.line} />
      <div style={{position: 'absolute', left: 90, top: 300, right: 90}}>
        <div style={{transform: 'scale(2.5)', transformOrigin: 'left top', display: 'inline-block'}}>
          <Bubble side="in" time="8:48 pm" fontSize={18}>
            सब ठीक है, सर।
          </Bubble>
        </div>
        <div style={{fontFamily: FONT.display, fontWeight: 700, fontSize: 168, lineHeight: 0.96, letterSpacing: -4, color: day.ink, marginTop: 150}}>
          All good,
          <br />
          sir?
        </div>
      </div>
      <div style={{position: 'absolute', left: 140, top: 880, transform: 'rotate(-2deg)'}}>
        <div style={{boxShadow: '0 40px 80px rgba(42,37,25,0.25)', borderRadius: 26, display: 'inline-block'}}>
          <HomeCard width={780} />
        </div>
        <div style={{marginTop: 24, marginLeft: 8}}>
          <ProofChips size={1.6} />
        </div>
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 1548, display: 'flex', justifyContent: 'center'}}>
        <Lockup size={1.2} />
      </div>
      <RecordCourse top={1770} brickW={250} brickH={70} offset={-80} width={1080} />
    </AbsoluteFill>
  );
}
