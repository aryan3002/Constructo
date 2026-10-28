/**
 * Film C — "सब ठीक है?" · the Neev intro.
 *
 * Anita lives in Dubai; her parents' home is being built in Pune. Every evening
 * the site says "सब ठीक है, सर।" (All good, sir.). But is it? The chatter
 * of a build goes dark and is laid again as bricks: Neev, one honest record.
 * The site team speaks it, the builder sees what doesn't add up, and the
 * family gets the whole picture — home, photos, a weekly letter, answers from
 * the record, their own choices — with Maa reading it all in Hindi.
 * Same words. This time, with proof.
 */
import type {ReactNode} from 'react';
import {AbsoluteFill, interpolateColors, useCurrentFrame, useVideoConfig} from 'remotion';

import {FONT} from '../../brand/fonts';
import {clamp01, EASE, prog, SETTLE} from '../../brand/motion';
import {ThemeProvider} from '../../brand/theme';
import {brand, day} from '../../brand/tokens';
import {BenchmarkMark, MARK_BUILD} from '../../components/brand/BenchmarkMark';
import {CITY_MAP_TIMING, CityMap} from '../../components/brand/CityMap';
import {Brick, BrickWall, landingFrames, layWall, SurveyGrid, Wordmark, type WallLayout} from '../../components/brand/motifs';
import {KineticText} from '../../components/motion/text';
import {Bubble, TypingDots} from '../../components/ui/chat';
import {HOME_HERO_HI, HomeHero} from '../../components/ui/cards';
import {Notification} from '../../components/ui/Notification';
import {EvidenceChip} from '../../components/ui/primitives';
import {SiteIllustration, type SiteScene} from '../../components/ui/SiteIllustration';
import {AskScreen} from '../../screens/homeowner/AskScreen';
import {HouseholdSheet} from '../../screens/homeowner/HouseholdSheet';
import {PhotosScreen} from '../../screens/homeowner/PhotosScreen';
import {SelectionScreen} from '../../screens/homeowner/SelectionScreen';
import {MilestoneStrip, UpdatesScreen} from '../../screens/homeowner/UpdatesScreen';
import {HomeownerHomeScreen} from '../../screens/HomeownerHomeScreen';
import {OwnerBriefScreen} from '../../screens/OwnerBriefScreen';
import {SiteCaptureScreen} from '../../screens/SiteCaptureScreen';
import {CaptionBlock} from '../shared/CaptionBlock';
import {ChatColumns} from '../shared/ChatFlood';
import {SandStage, Sfx, useLayout} from '../shared/layout';
import {PhoneShot, type FocusKey} from '../shared/PhoneShot';
import {sections, type Format} from '../timing';

const COLORS = {eyebrow: day.clayText, title: day.ink, body: day.inkMuted};
const PAPER = '#f3efe6';

type SceneProps = {dur: number; fmt: Format};

/** The chat columns are already moving when the noise cuts in. */
const NOISE_LEAD = 12;

/* -------------------------------------------------------------- helpers */

/** A brick that names the chapter, laid in from the left. */
function ChapterBrick({label, color, textColor = '#fcfaf3', at = 0, size = 1}: {label: string; color: string; textColor?: string; at?: number; size?: number}) {
  const frame = useCurrentFrame();
  const k = prog(frame, at, 12, SETTLE);
  return (
    <div style={{display: 'inline-block', transform: `translateX(${(1 - k) * -360}px)`, opacity: clamp01(k * 2)}}>
      <Brick width={260 * size} height={60 * size} color={color} label={label} labelColor={textColor} fontSize={20 * size} />
    </div>
  );
}

/** Phone on one side, words on the other (16:9); words above, phone below (9:16). */
function useRig(side: 'left' | 'right') {
  const L = useLayout() === 'landscape';
  if (!L) return {L, phone: {x: 246, y: 820, scale: 1.42}, caption: {left: 80, top: 250, width: 920}, titleSize: 84, bodySize: 36};
  return side === 'right'
    ? {L, phone: {x: 1196, y: 44, scale: 1.13}, caption: {left: 150, top: 230, width: 880}, titleSize: 92, bodySize: 35}
    : {L, phone: {x: 250, y: 44, scale: 1.13}, caption: {left: 900, top: 230, width: 880}, titleSize: 92, bodySize: 35};
}

/** A sand stage that can fall into night (0 = day, 1 = night). */
function DuskStage({night, children}: {night: number; children?: ReactNode}) {
  const {width, height} = useVideoConfig();
  const bg = interpolateColors(night, [0, 1], [day.surface, brand.inkTile]);
  const dot = interpolateColors(night, [0, 1], [day.line, '#3f3a31']);
  return (
    <AbsoluteFill style={{background: bg, overflow: 'hidden'}}>
      <SurveyGrid width={width} height={height} pitch={56} dot={2.2} color={dot} opacity={0.5} />
      {children}
      <AbsoluteFill style={{pointerEvents: 'none', background: `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 50%, rgba(0,0,0,${0.07 + 0.3 * night}) 100%)`}} />
    </AbsoluteFill>
  );
}

/** A word stamped on a paper label over the noise. */
function Slam({word, at, until, size, tilt = 0}: {word: string; at: number; until: number; size: number; tilt?: number}) {
  const frame = useCurrentFrame();
  if (frame < at || frame >= until) return null;
  const p = prog(frame, at, 7, SETTLE);
  return (
    <AbsoluteFill style={{display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'}}>
      <div
        style={{
          background: PAPER,
          padding: `${size * 0.08}px ${size * 0.3}px ${size * 0.14}px`,
          borderRadius: size * 0.1,
          borderBottom: `${size * 0.05}px solid #d9cfb9`,
          boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
          transform: `scale(${1.25 - 0.25 * p}) rotate(${tilt}deg)`,
          opacity: clamp01(p * 2),
          fontFamily: FONT.display,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.1,
          letterSpacing: -size * 0.02,
          color: day.ink,
          whiteSpace: 'nowrap',
        }}
      >
        {word}
      </div>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ hook */

export function HookC({fmt}: SceneProps) {
  const frame = useCurrentFrame();
  const L = useLayout() === 'landscape';
  const reel = fmt === 'reel';
  const tQ = reel ? 4 : 8;
  const tDots = reel ? 18 : 26;
  const tA = reel ? 44 : 46;
  const tBut = reel ? 84 : 160;
  const q = prog(frame, tQ, 14, SETTLE);
  const dots = prog(frame, tDots, 8, EASE) * (1 - prog(frame, tA - 4, 6, EASE));
  const a = prog(frame, tA, 14, SETTLE);
  // A slow push in on the answer while the voice speaks.
  const push = prog(frame, tA + 20, tBut - tA - 20, EASE);
  const fs = L ? 40 : 46;
  const panel = L ? {left: 160, top: 350, width: 780} : {left: 70, top: 420, width: 940};
  return (
    <SandStage>
      <Sfx name="send" at={tQ} volume={0.5} />
      <Sfx name="pop" at={tA} volume={0.55} />
      <Sfx name="swell" at={tBut - 8} volume={0.5} />
      <div style={{position: 'absolute', ...panel, transform: `scale(${1 + 0.06 * push})`, transformOrigin: '20% 70%'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 18, marginBottom: 34, opacity: prog(frame, 0, 12)}}>
          <span
            style={{
              width: L ? 64 : 80,
              height: L ? 64 : 80,
              borderRadius: 40,
              background: day.brandSoft,
              color: day.brandStrong,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: FONT.text,
              fontWeight: 600,
              fontSize: L ? 28 : 34,
            }}
          >
            R
          </span>
          <span style={{display: 'flex', flexDirection: 'column'}}>
            <span style={{fontFamily: FONT.text, fontWeight: 600, fontSize: L ? 30 : 38, color: day.ink}}>Ramesh · Site</span>
            <span style={{fontFamily: FONT.text, fontSize: L ? 22 : 28, color: day.inkMuted}}>Verma Duplex, Pune</span>
          </span>
        </div>
        <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
          <div style={{alignSelf: 'flex-end', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', opacity: q, transform: `translateY(${(1 - q) * 24}px)`}}>
            <Bubble side="out" time="8:47 pm" fontSize={fs} maxWidth={panel.width}>
              काम कैसा चल रहा है?
            </Bubble>
            <span style={{fontFamily: FONT.text, fontStyle: 'italic', fontSize: L ? 24 : 30, color: day.inkMuted, marginTop: 8, marginRight: 6}}>“How’s the work going?”</span>
          </div>
          <div style={{height: L ? 60 : 76, position: 'relative'}}>
            <div style={{position: 'absolute', left: 0, top: 6, opacity: dots, transform: `scale(${L ? 1.5 : 1.9})`, transformOrigin: 'left top'}}>
              <TypingDots phase={frame / 9} />
            </div>
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                opacity: a,
                transform: `translateY(${(1 - a) * 24}px)`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
              }}
            >
              <Bubble side="in" time="8:48 pm" fontSize={fs} maxWidth={panel.width}>
                सब ठीक है, सर।
              </Bubble>
              <span style={{fontFamily: FONT.text, fontStyle: 'italic', fontSize: L ? 24 : 30, color: day.inkMuted, marginTop: 8, marginLeft: 6}}>“All good, sir.”</span>
            </div>
          </div>
        </div>
      </div>
      <div style={{position: 'absolute', ...(L ? {left: 1060, top: 470, width: 800} : {left: 70, top: 1050, width: 940})}}>
        <KineticText
          text="But is it?"
          start={tBut}
          stagger={4}
          duration={20}
          style={{fontFamily: FONT.display, fontWeight: 600, fontSize: L ? 168 : 176, lineHeight: 1, letterSpacing: -3, color: day.ink}}
        />
      </div>
    </SandStage>
  );
}

/* ----------------------------------------------------------------- noise */

export function NoiseC({dur, fmt}: SceneProps) {
  const frame = useCurrentFrame();
  const {height} = useVideoConfig();
  const L = useLayout() === 'landscape';
  const reel = fmt === 'reel';
  const night = prog(frame, 0, Math.round(dur * 0.55), EASE);
  const slams = reel
    ? [
        {word: 'WhatsApp.', at: 10},
        {word: 'Calls.', at: 32},
        {word: 'Promises.', at: 54},
      ]
    : [
        {word: 'WhatsApp.', at: 70},
        {word: 'Calls.', at: 100},
        {word: 'Voice notes.', at: 128},
        {word: 'Promises.', at: 158},
      ];
  const lostAt = reel ? 80 : 196;
  const dim = prog(frame, lostAt - 6, 12, EASE);
  return (
    <DuskStage night={night}>
      <div style={{opacity: 1 - 0.55 * dim}}>
        <ChatColumns
          start={-NOISE_LEAD}
          columns={L ? [60, 530, 1000, 1470] : [30, 560]}
          colWidth={L ? 420 : 500}
          scale={L ? 1.3 : 1.55}
          v0={L ? 2.4 : 3.2}
          accel={reel ? 0.09 : 0.03}
        />
      </div>
      <Sfx name="riser" at={reel ? 0 : 40} volume={0.32} duration={dur} />
      {slams.map((s, i) => (
        <Sfx key={s.word} name="hit" at={s.at} volume={0.42 - i * 0.03} />
      ))}
      {slams.map((s, i) => (
        <Slam key={s.word} word={s.word} at={s.at} until={slams[i + 1]?.at ?? lostAt - 4} size={L ? 170 : 140} tilt={[-2.5, 1.8, -1.2, 2.4][i % 4]} />
      ))}
      <div style={{position: 'absolute', left: 0, right: 0, top: height / 2 - (L ? 80 : 150), display: 'flex', justifyContent: 'center'}}>
        <div style={{background: 'rgba(27,25,22,0.86)', borderRadius: 26, padding: L ? '20px 52px 28px' : '24px 40px 32px', opacity: dim}}>
          <KineticText
            text={L ? 'And most of it gets lost.' : 'And most of it\ngets lost.'}
            start={lostAt}
            stagger={3}
            duration={16}
            highlight={{lost: brand.marigold, 'lost.': brand.marigold}}
            style={{fontFamily: FONT.display, fontWeight: 600, fontSize: L ? 96 : 100, lineHeight: 1.08, letterSpacing: -1.6, color: PAPER, textAlign: 'center'}}
          />
        </div>
      </div>
    </DuskStage>
  );
}

/* ------------------------------------------------------------------ turn */

/** What the record is made of, bottom course first; `null` is a half bat at a course end. */
const RECORD_WIDE: Array<Array<string | null>> = [
  ['Voice note', 'Site photo', 'Invoice', 'Delivery', 'Attendance', 'Drawing'],
  [null, 'Payment', 'Question', 'Selection', 'Milestone', 'Weekly letter', null],
  ['Approval', 'Material', 'Quality check', 'Site log', 'Decision', 'Handover'],
];
const RECORD_TALL: Array<Array<string | null>> = [
  ['Voice note', 'Site photo', 'Invoice', 'Delivery'],
  [null, 'Payment', 'Question', 'Selection', null],
  ['Attendance', 'Milestone', 'Weekly letter', 'Drawing'],
  [null, 'Approval', 'Site log', 'Decision', null],
];

function recordWall(L: boolean, labels = true): WallLayout {
  const c = [brand.clay, '#3e7a66', '#c9bfa9', '#8a5a2b', '#4a443a'];
  let n = 0;
  const courses = (L ? RECORD_WIDE : RECORD_TALL).map((course) =>
    course.map((label) => {
      const color = c[(n++ * 3) % c.length];
      return {w: label === null ? 0.5 : 1, color, label: labels && label !== null ? label : undefined, labelColor: color === '#c9bfa9' ? '#2a2519' : '#fcfaf3'};
    }),
  );
  return L ? {brick: {w: 250, h: 74}, joint: 12, courses} : {brick: {w: 216, h: 70}, joint: 10, courses};
}

export function TurnC({dur, fmt}: SceneProps) {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const L = useLayout() === 'landscape';
  const reel = fmt === 'reel';
  const wall = recordWall(L);
  const placed = layWall(wall);
  const wallW = Math.max(...placed.map((b) => b.x + b.w));
  const wallH = wall.courses.length * (wall.brick.h + wall.joint);
  const layStart = reel ? 6 : 10;
  const stagger = 2;
  const lands = landingFrames(placed.length, layStart, stagger, 12);
  const titleAt = reel ? 60 : 90;
  const dawn = prog(frame, titleAt + 26, 30, EASE);
  const lineAt = titleAt + 30;
  const lift = prog(frame, titleAt - 12, 22, SETTLE);
  const wallTop = L ? height * 0.5 - wallH / 2 + lift * 170 : height * 0.5 - wallH / 2 + lift * 300;
  const point = prog(frame, titleAt - 10, 12, SETTLE);
  // After dawn: a slow push in, and one sweep of light across the record.
  const push = prog(frame, titleAt, dur - titleAt, EASE);
  const sheen = prog(frame, titleAt + 44, 40, EASE);
  const word = interpolateColors(dawn, [0, 1], [PAPER, day.ink]);
  const muted = interpolateColors(dawn, [0, 1], ['#b3a991', day.inkMuted]);
  const noiseDur = sections('c', fmt).find((s) => s.id === 'noise')?.duration ?? 0;
  return (
    <DuskStage night={1 - dawn}>
      {/* The chatter falls away. */}
      <ChatColumns
        columns={L ? [60, 530, 1000, 1470] : [30, 560]}
        colWidth={L ? 420 : 500}
        scale={L ? 1.3 : 1.55}
        v0={L ? 2.4 : 3.2}
        accel={reel ? 0.09 : 0.03}
        start={-noiseDur - NOISE_LEAD}
        freezeAt={0}
        fallAt={6}
        style={{opacity: 0.45}}
      />
      {lands
        .filter((_, i) => i % 2 === 0)
        .map((f, i) => (
          <Sfx key={i} name="thud" at={f} volume={0.3} />
        ))}
      <Sfx name="hit" at={titleAt} volume={0.55} />
      <Sfx name="chime" at={titleAt + 6} volume={0.45} />
      <AbsoluteFill style={{transform: `scale(${1 + 0.05 * push})`, transformOrigin: '50% 45%'}}>
        <div style={{position: 'absolute', left: (width - wallW) / 2, top: wallTop, width: wallW}}>
          <BrickWall layout={wall} start={layStart} stagger={stagger} duration={12} fontSize={L ? 21 : 18} />
          {sheen > 0 && sheen < 1 ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(105deg, rgba(255,250,235,0) 38%, rgba(255,250,235,0.55) 50%, rgba(255,250,235,0) 62%)',
                backgroundSize: '250% 100%',
                backgroundPosition: `${(1 - sheen) * 100}% 0`,
                mixBlendMode: 'soft-light',
              }}
            />
          ) : null}
          <div
            style={{
              position: 'absolute',
              left: wallW / 2 - 26,
              top: -60 - (1 - point) * 160,
              width: 52,
              height: 52,
              borderRadius: 26,
              background: brand.marigold,
              opacity: point,
              boxShadow: '0 10px 30px rgba(240,162,31,0.35)',
            }}
          />
        </div>
        <div style={{position: 'absolute', left: 0, right: 0, top: L ? 110 : 330, display: 'flex', justifyContent: 'center'}}>
          <Wordmark size={L ? 210 : 230} color={word} start={titleAt} align="center" showHindi={false} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: L ? 352 : 610,
            textAlign: 'center',
            fontFamily: FONT.text,
            fontSize: L ? 44 : 48,
            color: muted,
            opacity: prog(frame, lineAt, 14, EASE),
            padding: '0 60px',
          }}
        >
          <span style={{color: dawn > 0.5 ? brand.clay : brand.marigold, fontFamily: FONT.display, fontWeight: 600}}>नींव</span>
          {'  ·  '}One honest record of your home.
        </div>
      </AbsoluteFill>
    </DuskStage>
  );
}

/* ------------------------------------------------------- site & builder */

export function SiteC({fmt}: SceneProps) {
  const rig = useRig('right');
  const reel = fmt === 'reel';
  const marks = reel ? {pressAt: 8, releaseAt: 40, entryAt: 66} : {pressAt: 20, releaseAt: 82, entryAt: 128};
  const focus: FocusKey[] = reel
    ? [
        {f: 0, z: 1},
        {f: 44, z: 1},
        {f: 58, z: 1.1, fy: 470},
        {f: 66, z: 1.1, fy: 470},
        {f: 82, z: 1.06, fy: 320},
      ]
    : [
        {f: 0, z: 1},
        {f: 86, z: 1},
        {f: 104, z: 1.24, fy: 470},
        {f: 124, z: 1.24, fy: 470},
        {f: 146, z: 1.2, fy: 320},
        {f: 210, z: 1.2, fy: 320},
      ];
  return (
    <SandStage>
      <Sfx name="press" at={marks.pressAt} volume={0.45} />
      <Sfx name="send" at={marks.releaseAt} volume={0.45} />
      <Sfx name="ping" at={marks.entryAt + 6} volume={0.4} />
      <PhoneShot {...rig.phone} enterAt={2} enterDur={16} time="6:52" focus={focus}>
        <SiteCaptureScreen marks={marks} />
      </PhoneShot>
      <div style={{position: 'absolute', ...rig.caption}}>
        <CaptionBlock
          eyebrow="For the site team · 6:52 am"
          title={'Speak. Snap.\nDone.'}
          body={reel ? undefined : 'In Hindi or English. Neev writes it down, with the voice note and photos as proof.'}
          start={4}
          titleSize={rig.titleSize}
          bodySize={rig.bodySize}
          colors={COLORS}
        />
      </div>
    </SandStage>
  );
}

export function BuilderC({fmt}: SceneProps) {
  const rig = useRig('left');
  const reel = fmt === 'reel';
  const marks = reel ? {evidenceAt: 30, compareAt: 40, holdAt: 76} : {evidenceAt: 40, compareAt: 54, holdAt: 140};
  const focus: FocusKey[] = reel
    ? [
        {f: 0, z: 1},
        {f: 34, z: 1},
        {f: 52, z: 1.12, fy: 560, dy: -400},
        {f: 74, z: 1.12, fy: 560, dy: -400},
        {f: 88, z: 1.06, fy: 600, dy: -360},
      ]
    : [
        {f: 0, z: 1},
        {f: 46, z: 1},
        {f: 72, z: 1.34, fy: 470},
        {f: 128, z: 1.34, fy: 470},
        {f: 150, z: 1.16, fy: 600},
        {f: 210, z: 1.16, fy: 600},
      ];
  return (
    <SandStage>
      <Sfx name="tick" at={marks.evidenceAt} volume={0.35} />
      <Sfx name="whoosh" at={marks.compareAt} volume={0.3} />
      <Sfx name="press" at={marks.holdAt} volume={0.45} />
      <Sfx name="ping" at={marks.holdAt + 12} volume={0.4} />
      <PhoneShot {...rig.phone} enterAt={2} enterDur={16} time="11:40" focus={focus}>
        <OwnerBriefScreen marks={marks} />
      </PhoneShot>
      <div style={{position: 'absolute', ...rig.caption}}>
        <CaptionBlock
          eyebrow="For the builder · 11:40 am"
          title={'What doesn’t add up\ncomes first.'}
          body={reel ? undefined : '120 bags billed. 100 logged on site. It’s on top, with both pieces of proof, before anyone pays. Neev never moves money.'}
          start={4}
          exitAt={reel ? 34 : undefined}
          titleSize={rig.titleSize}
          bodySize={rig.bodySize}
          colors={COLORS}
          highlight={{'120': day.clay, '100': day.clay}}
        />
      </div>
    </SandStage>
  );
}

/* --------------------------------------------------------- family chapter */

export function FamilyC() {
  const L = useLayout() === 'landscape';
  const start = 6;
  const landAt = start + CITY_MAP_TIMING.depart + CITY_MAP_TIMING.travel - 2;
  const dubai = L ? {x: 560, y: 640} : {x: 300, y: 900};
  const pune = L ? {x: 1400, y: 760} : {x: 760, y: 1400};
  const note = L ? {left: 650, top: 380} : {left: 400, top: 830};
  return (
    <SandStage grid={0.5}>
      <Sfx name="whoosh" at={start + 4} volume={0.28} />
      <Sfx name="send" at={start + CITY_MAP_TIMING.depart} volume={0.3} />
      <Sfx name="ping" at={landAt} volume={0.42} />
      <div>
        <CityMap
          start={start}
          scale={L ? 1.25 : 1.2}
          bend={L ? -1 : 1}
          distance="2,060 km"
          colors={{ink: day.ink, muted: day.inkMuted, line: day.lineControl, accent: brand.clay, surface: day.surfaceRaised, update: brand.marigold}}
          from={{
            ...pune,
            name: 'Pune',
            time: '9:00 pm',
            side: 'below',
            people: [
              {initial: 'R', label: 'Site · Verma Duplex', color: '#8a5a2b'},
              {initial: 'M', label: 'Maa', color: '#3e7a66'},
            ],
          }}
          to={{...dubai, name: 'Dubai', time: '7:30 pm', side: L ? 'left' : 'above', people: [{initial: 'A', label: 'Anita', color: brand.clay}]}}
        />
        <div style={{position: 'absolute', ...note}}>
          <Notification
            at={landAt}
            title="Today on site"
            body="Shuttering for the second-floor slab has started. Pour on Thursday."
            photo="shuttering"
            width={L ? 560 : 600}
            scale={L ? 1.05 : 1.1}
          />
        </div>
        <div style={{position: 'absolute', left: L ? 150 : 80, top: L ? 110 : 250, width: L ? 1000 : 920}}>
          <CaptionBlock eyebrow="For the family" title={'Far from site.\nNever out of the loop.'} start={4} titleSize={L ? 80 : 78} colors={COLORS} />
        </div>
      </div>
    </SandStage>
  );
}

function Callout({x, y, toX, toY, text, at, align}: {x: number; y: number; toX: number; toY: number; text: string; at: number; align: 'left' | 'right'}) {
  const frame = useCurrentFrame();
  const k = prog(frame, at, 16, SETTLE);
  const line = prog(frame, at + 6, 14, EASE);
  return (
    <>
      <svg style={{position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none'}}>
        <line x1={x} y1={y} x2={x + (toX - x) * line} y2={y + (toY - y) * line} stroke={day.clay} strokeWidth={2.5} strokeDasharray="2 7" strokeLinecap="round" />
        <circle cx={toX} cy={toY} r={8 * line} fill={day.clay} />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: y - 34,
          ...(align === 'left' ? {right: `calc(100% - ${x - 14}px)`} : {left: x + 14}),
          width: 420,
          textAlign: align === 'left' ? 'right' : 'left',
          fontFamily: FONT.display,
          fontWeight: 600,
          fontSize: 34,
          lineHeight: 1.22,
          color: day.ink,
          opacity: k,
          transform: `translateY(${(1 - k) * 12}px)`,
        }}
      >
        {text}
      </div>
    </>
  );
}

export function HomeC({fmt}: SceneProps) {
  const L = useLayout() === 'landscape';
  const reel = fmt === 'reel';
  const s = 1.13;
  const px = (1920 - 414 * s) / 2;
  // Screen point (app points) → frame pixels.
  const at = (sx: number, sy: number) => ({x: px + (sx + 13) * s, y: 44 + (sy + 13) * s});
  const hero = at(20, 300);
  const bar = at(372, 380);
  const today = at(20, 560);
  return (
    <SandStage grid={0.35}>
      <Sfx name="tick" at={22} volume={0.3} />
      {L && !reel ? (
        <>
          <PhoneShot x={px} y={44} scale={s} enterAt={0} enterDur={16} time="7:30">
            <HomeownerHomeScreen marks={{heroAt: 6}} />
          </PhoneShot>
          <div style={{position: 'absolute', left: 120, top: 120}}>
            <ChapterBrick label="Home" color={brand.clay} at={0} />
          </div>
          <Callout x={500} y={360} toX={hero.x} toY={hero.y} text="“You’re okay” only when nothing needs you" at={22} align="left" />
          <Callout x={1500} y={500} toX={bar.x} toY={bar.y} text="Where the build stands" at={44} align="right" />
          <Callout x={500} y={720} toX={today.x} toY={today.y} text="Today’s update, with its proof" at={66} align="left" />
        </>
      ) : (
        <>
          <PhoneShot
            x={246}
            y={820}
            scale={1.42}
            enterAt={0}
            enterDur={16}
            time="7:30"
            focus={[
              {f: 0, z: 1},
              {f: 30, z: 1.08, fy: 300},
            ]}
          >
            <HomeownerHomeScreen marks={{heroAt: 6}} />
          </PhoneShot>
          <div style={{position: 'absolute', left: 80, top: 250, width: 920}}>
            <ChapterBrick label="For the family" color={brand.clay} at={0} />
            <div style={{marginTop: 24}}>
              <CaptionBlock title={'Calm, finally.'} body="“You’re okay” only when nothing needs you." start={4} titleSize={84} bodySize={36} colors={COLORS} />
            </div>
          </div>
        </>
      )}
    </SandStage>
  );
}

function Print({scene, x, y, rot, at, label}: {scene: SiteScene; x: number; y: number; rot: number; at: number; label: string}) {
  const frame = useCurrentFrame();
  const k = prog(frame, at, 18, SETTLE);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 300,
        padding: '12px 12px 40px',
        background: '#fcfaf3',
        boxShadow: '0 18px 40px rgba(42,37,25,0.22)',
        transform: `translate(${(1 - k) * -260}px, ${(1 - k) * 120}px) rotate(${rot * k - 12 * (1 - k)}deg)`,
        opacity: clamp01(k * 2),
        borderRadius: 4,
      }}
    >
      <div style={{height: 210, overflow: 'hidden', borderRadius: 2}}>
        <SiteIllustration scene={scene} />
      </div>
      <div style={{position: 'absolute', left: 14, bottom: 9, fontFamily: FONT.data, fontSize: 16, color: day.inkMuted}}>{label}</div>
    </div>
  );
}

export function PhotosC() {
  const rig = useRig('right');
  return (
    <SandStage>
      <Sfx name="pop" at={14} volume={0.3} />
      <Sfx name="pop" at={26} volume={0.3} />
      <Sfx name="pop" at={38} volume={0.3} />
      <PhoneShot
        {...rig.phone}
        enterAt={0}
        enterDur={16}
        time="7:31"
        focus={[
          {f: 0, z: 1},
          {f: 40, z: 1.08, fy: 330},
        ]}
      >
        <PhotosScreen cardsAt={8} pinAt={88} />
      </PhoneShot>
      <div style={{position: 'absolute', ...rig.caption}}>
        <ChapterBrick label="Photos" color="#3e7a66" />
        <div style={{marginTop: 26}}>
          <CaptionBlock
            title={'Every photo,\nin its place.'}
            body="Dated, placed and tagged. Shared by your builder."
            start={4}
            titleSize={rig.titleSize}
            bodySize={rig.bodySize}
            colors={COLORS}
          />
        </div>
      </div>
      {rig.L ? (
        <>
          <Print scene="shuttering" x={150} y={690} rot={-6} at={12} label="Today · 6:52 am" />
          <Print scene="cement" x={430} y={660} rot={3} at={24} label="Today · 9:21 am" />
          <Print scene="brickwork" x={720} y={700} rot={-2} at={36} label="Yesterday" />
        </>
      ) : null}
    </SandStage>
  );
}

export function LetterC() {
  const frame = useCurrentFrame();
  const rig = useRig('left');
  const strip = prog(frame, 30, 40, EASE);
  return (
    <SandStage>
      <Sfx name="tick" at={110} volume={0.4} />
      <PhoneShot
        {...rig.phone}
        enterAt={0}
        enterDur={16}
        time="7:32"
        focus={[
          {f: 0, z: 1},
          {f: 96, z: 1},
          {f: 120, z: 1.2, fy: 560},
          {f: 210, z: 1.2, fy: 560},
        ]}
      >
        <UpdatesScreen stripAt={10} letterAt={44} listenAt={112} />
      </PhoneShot>
      <div style={{position: 'absolute', ...rig.caption}}>
        <ChapterBrick label="Weekly letter" color="#8a5a2b" />
        <div style={{marginTop: 26}}>
          <CaptionBlock
            title={'A letter,\nevery week.'}
            body="Where the build stands and what's next. Read it, or listen to it."
            start={4}
            titleSize={rig.titleSize}
            bodySize={rig.bodySize}
            colors={COLORS}
          />
        </div>
        {rig.L ? (
          <div style={{marginTop: 54, width: 820, opacity: strip}}>
            <ThemeProvider theme={day}>
              <div style={{transform: 'scale(1.6)', transformOrigin: 'left top', width: 820 / 1.6}}>
                <MilestoneStrip fill={strip} />
              </div>
            </ThemeProvider>
          </div>
        ) : null}
      </div>
    </SandStage>
  );
}

export function AskC({fmt}: SceneProps) {
  const rig = useRig('right');
  const reel = fmt === 'reel';
  const marks = reel ? {q1At: 32, a1At: 54} : {q1At: 40, a1At: 66, q2At: 132, a2At: 158};
  return (
    <SandStage>
      <Sfx name="send" at={marks.q1At} volume={0.4} />
      <Sfx name="ping" at={marks.a1At} volume={0.35} />
      {!reel ? <Sfx name="send" at={132} volume={0.4} /> : null}
      <PhoneShot
        {...rig.phone}
        enterAt={0}
        enterDur={16}
        time="7:34"
        focus={[
          {f: 0, z: 1},
          {f: 30, z: 1.12, fy: 360},
        ]}
      >
        <AskScreen marks={marks} />
      </PhoneShot>
      <div style={{position: 'absolute', ...rig.caption}}>
        <ChapterBrick label="Ask" color={brand.marigold} textColor="#1b1916" />
        <div style={{marginTop: 26}}>
          <CaptionBlock
            title={'Ask your home.'}
            body={reel ? 'Answers come from the record.' : 'Answers come from the record, with the proof. Money and safety go to your builder. Never a guess.'}
            start={4}
            titleSize={rig.titleSize}
            bodySize={rig.bodySize}
            colors={COLORS}
          />
        </div>
      </div>
    </SandStage>
  );
}

export function DesignC({fmt}: SceneProps) {
  const rig = useRig('left');
  const reel = fmt === 'reel';
  const marks = reel ? {pickAt: 34, approveAt: 70} : {pickAt: 80, approveAt: 140};
  return (
    <SandStage>
      <Sfx name="tick" at={marks.pickAt} volume={0.4} />
      <Sfx name="press" at={marks.approveAt} volume={0.45} />
      <Sfx name="ping" at={marks.approveAt + 10} volume={0.4} />
      <PhoneShot
        {...rig.phone}
        enterAt={0}
        enterDur={16}
        time="7:36"
        focus={
          reel
            ? [
                {f: 0, z: 1},
                {f: 24, z: 1.1, fy: 430},
                {f: 52, z: 1.1, fy: 430},
                {f: 66, z: 1.1, fy: 520, dy: -340},
              ]
            : [
                {f: 0, z: 1},
                {f: 50, z: 1},
                {f: 74, z: 1.24, fy: 420},
                {f: 130, z: 1.24, fy: 420},
                {f: 150, z: 1.1, fy: 560},
              ]
        }
      >
        <SelectionScreen pickAt={marks.pickAt} approveAt={marks.approveAt} />
      </PhoneShot>
      <div style={{position: 'absolute', ...rig.caption}}>
        <ChapterBrick label="Your choices" color="#3e7a66" />
        <div style={{marginTop: 26}}>
          <CaptionBlock
            title={'Decide what’s\ntruly yours.'}
            body={reel ? undefined : 'Every option checked against your style, with the cost difference and the wait spelled out.'}
            start={4}
            exitAt={reel ? 48 : undefined}
            titleSize={rig.titleSize}
            bodySize={rig.bodySize}
            colors={COLORS}
          />
        </div>
      </div>
    </SandStage>
  );
}

function PersonTag({initial, name, lang, color}: {initial: string; name: string; lang: string; color: string}) {
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
      <span
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          background: color,
          color: '#fcfaf3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONT.text,
          fontWeight: 600,
          fontSize: 22,
        }}
      >
        {initial}
      </span>
      <span style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 28, color: day.ink}}>{name}</span>
      <span style={{padding: '4px 14px', borderRadius: 999, background: day.ink, color: day.surface, fontFamily: FONT.text, fontWeight: 600, fontSize: 20}}>{lang}</span>
    </div>
  );
}

export function LanguageC({fmt}: SceneProps) {
  const frame = useCurrentFrame();
  const L = useLayout() === 'landscape';
  const reel = fmt === 'reel';
  const invite = !reel;
  const sendAt = 44;
  const swap = invite ? prog(frame, 74, 12, EASE) : 1;
  const maaIn = invite ? 88 : 4;
  const s = L ? 0.92 : 0.95;
  const w = 414 * s;
  const gap = L ? 70 : 24;
  const cx = L ? 960 : 540;
  const y = L ? 252 : 790;
  // Anita's phone holds the centre until Maa's arrives beside it.
  const slide = invite ? prog(frame, maaIn - 8, 20, EASE) : 1;
  const leftX = cx - w / 2 - (w / 2 + gap / 2) * slide;
  const rightX = cx + gap / 2;
  const tagK = prog(frame, maaIn + 10, 14, EASE);
  return (
    <SandStage>
      {invite ? <Sfx name="press" at={sendAt} volume={0.45} /> : null}
      <Sfx name="whoosh" at={maaIn} volume={0.35} />
      <Sfx name="chime" at={maaIn + 16} volume={0.35} />
      <div style={{position: 'absolute', left: 0, right: 0, top: L ? 56 : 250, display: 'flex', justifyContent: 'center'}}>
        <div style={{width: L ? 1400 : 920, textAlign: 'center'}}>
          <KineticText
            text={L ? 'Same truth. In everyone’s own language.' : 'Same truth.\nTheir own language.'}
            start={4}
            stagger={3}
            duration={16}
            style={{fontFamily: FONT.display, fontWeight: 600, fontSize: L ? 72 : 80, lineHeight: 1.1, letterSpacing: -1.2, color: day.ink}}
          />
        </div>
      </div>
      <div style={{position: 'absolute', left: leftX, top: y - 66, opacity: prog(frame, 6, 14, EASE)}}>
        <PersonTag initial="A" name="Anita · Dubai" lang="English" color={brand.clay} />
      </div>
      <div style={{position: 'absolute', left: rightX, top: y - 66, opacity: tagK}}>
        <PersonTag initial="M" name="Maa · Pune" lang="हिंदी" color="#3e7a66" />
      </div>
      <PhoneShot x={leftX} y={y} scale={s} enterAt={0} enterDur={16} time="7:38">
        <div style={{position: 'absolute', inset: 0, opacity: 1 - swap}}>{invite ? <HouseholdSheet sendAt={sendAt} /> : null}</div>
        <div style={{position: 'absolute', inset: 0, opacity: swap}}>
          <HomeownerHomeScreen marks={{heroAt: invite ? 74 : 0}} />
        </div>
      </PhoneShot>
      <PhoneShot x={rightX} y={y} scale={s} enterAt={maaIn} enterDur={16} time="9:08" tilt={-3}>
        <HomeownerHomeScreen marks={{heroAt: maaIn + 4, toggleAt: -100}} />
      </PhoneShot>
    </SandStage>
  );
}

/* ---------------------------------------------------------------- payoff */

export function PayoffC({fmt}: SceneProps) {
  const frame = useCurrentFrame();
  const L = useLayout() === 'landscape';
  const reel = fmt === 'reel';
  const k = reel ? 0.5 : 1;
  const bubble = prog(frame, 4, 14, SETTLE);
  const card = prog(frame, Math.round(14 * k), 18, SETTLE);
  const chipsAt = Math.round(34 * k);
  const titleAt = Math.round(72 * k);
  const chips = [
    {icon: 'mic' as const, label: 'Site log · 6:52 am'},
    {icon: 'image' as const, label: '2 photos'},
    {icon: 'file-text' as const, label: 'Weekly letter'},
  ];
  return (
    <SandStage grid={0.4}>
      <Sfx name="pop" at={4} volume={0.4} />
      <Sfx name="whoosh" at={Math.round(14 * k)} volume={0.3} />
      {chips.map((_, i) => (
        <Sfx key={i} name="tick" at={chipsAt + i * 8} volume={0.3} />
      ))}
      <Sfx name="chime" at={titleAt + 20} volume={0.4} />
      <div>
        <div
          style={{
            position: 'absolute',
            left: L ? 150 : 80,
            top: L ? 270 : 290,
            opacity: bubble * (1 - 0.35 * prog(frame, titleAt, 20, EASE)),
            transform: `translateY(${(1 - bubble) * 20}px)`,
          }}
        >
          <div style={{transform: `scale(${L ? 2.1 : 2.4})`, transformOrigin: 'left top', display: 'inline-block'}}>
            <Bubble side="in" time="8:48 pm" fontSize={18}>
              सब ठीक है, सर।
            </Bubble>
          </div>
        </div>
        <div style={{position: 'absolute', left: L ? 150 : 80, top: L ? 500 : 520, width: L ? 820 : 920}}>
          <KineticText
            text="Same words."
            start={titleAt}
            stagger={4}
            duration={18}
            style={{fontFamily: FONT.display, fontWeight: 700, fontSize: L ? 120 : 130, lineHeight: 1, letterSpacing: -3, color: day.ink}}
          />
          <KineticText
            text="This time, with proof."
            start={titleAt + 14}
            stagger={4}
            duration={18}
            highlight={{'proof.': day.brand}}
            style={{fontFamily: FONT.display, fontWeight: 700, fontSize: L ? 84 : 92, lineHeight: 1.1, letterSpacing: -2, color: day.ink, marginTop: 14}}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            ...(L ? {left: 1040, top: 255} : {left: 150, top: 900}),
            transform: `translateY(${(1 - card) * 80}px) rotate(${L ? 3 : -2}deg)`,
            opacity: clamp01(card * 1.6),
          }}
        >
          <ThemeProvider theme={day}>
            <div style={{width: 360, zoom: L ? 1.95 : 2.05, boxShadow: '0 20px 40px rgba(42,37,25,0.18)', borderRadius: 16}}>
              <HomeHero copy={HOME_HERO_HI} progress={0.62} />
            </div>
            <div style={{display: 'flex', gap: 10, marginTop: 26, flexWrap: 'wrap', width: L ? 700 : 820, zoom: L ? 1.4 : 1.45}}>
              {chips.map((c, i) => {
                const ck = prog(frame, chipsAt + i * 8, 12, SETTLE);
                return (
                  <span key={c.label} style={{opacity: ck, transform: `translateY(${(1 - ck) * 10}px) scale(${0.9 + 0.1 * ck})`, display: 'inline-block'}}>
                    <EvidenceChip icon={c.icon} label={c.label} />
                  </span>
                );
              })}
            </div>
          </ThemeProvider>
        </div>
      </div>
    </SandStage>
  );
}

/* ------------------------------------------------------------------- end */

export function EndC({dur, fmt}: SceneProps) {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const L = useLayout() === 'landscape';
  const reel = fmt === 'reel';
  const wall = recordWall(L, true);
  const placed = layWall(wall);
  const wallW = Math.max(...placed.map((b) => b.x + b.w));
  const wallH = wall.courses.length * (wall.brick.h + wall.joint);
  const stagger = reel ? 1.5 : 2.4;
  const lands = landingFrames(placed.length, 2, stagger, 12);
  const markFrom = reel ? 18 : 40;
  const built = markFrom + MARK_BUILD.total;
  const wordAt = reel ? 30 : 84;
  const tag = prog(frame, wordAt + 22, 18, EASE);
  const cta = prog(frame, wordAt + 44, 18, EASE);
  const fadeOut = reel ? 0 : prog(frame, dur - 20, 20, EASE);
  const scaleW = L ? 0.72 : 0.86;
  return (
    <SandStage grid={0.45}>
      {lands
        .filter((_, i) => i % 3 === 0)
        .map((f, i) => (
          <Sfx key={i} name="thud" at={f} volume={0.26} />
        ))}
      <Sfx name="chime" at={built - 8} volume={0.5} />
      <AbsoluteFill style={{opacity: 1 - fadeOut}}>
        <div
          style={{
            position: 'absolute',
            left: (width - wallW * scaleW) / 2,
            top: L ? 776 : height - wallH * scaleW - 470,
            width: wallW,
            transform: `scale(${scaleW})`,
            transformOrigin: 'top left',
          }}
        >
          <BrickWall layout={wall} start={2} stagger={stagger} duration={12} fontSize={L ? 21 : 18} />
        </div>
        <div style={{position: 'absolute', left: 0, right: 0, top: L ? 150 : 300, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
          <BenchmarkMark size={L ? 150 : 200} buildFrom={markFrom} />
          <div style={{marginTop: L ? 10 : 24}}>
            <Wordmark size={L ? 130 : 170} color={day.ink} hindiColor={day.clay} start={wordAt} align="center" />
          </div>
          <div
            style={{
              fontFamily: FONT.display,
              fontWeight: 600,
              fontSize: L ? 46 : 56,
              color: day.ink,
              marginTop: L ? 20 : 36,
              opacity: tag,
              transform: `translateY(${(1 - tag) * 14}px)`,
              textAlign: 'center',
              padding: '0 60px',
            }}
          >
            One honest record of your home.
          </div>
          <div
            style={{
              marginTop: L ? 24 : 40,
              opacity: cta,
              transform: `translateY(${(1 - cta) * 12}px)`,
              border: `2px solid ${day.brand}`,
              color: day.brandStrong,
              borderRadius: 999,
              padding: L ? '10px 28px' : '14px 34px',
              fontFamily: FONT.text,
              fontWeight: 600,
              fontSize: L ? 24 : 32,
            }}
          >
            Coming soon to iPhone and Android
          </div>
        </div>
      </AbsoluteFill>
    </SandStage>
  );
}

export const SCENES_C = {
  hook: HookC,
  noise: NoiseC,
  turn: TurnC,
  site: SiteC,
  builder: BuilderC,
  family: FamilyC,
  home: HomeC,
  photos: PhotosC,
  letter: LetterC,
  ask: AskC,
  design: DesignC,
  language: LanguageC,
  payoff: PayoffC,
  end: EndC,
};
