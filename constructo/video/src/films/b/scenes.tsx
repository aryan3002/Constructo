/**
 * Film B — "Build on the truth." Bold, kinetic, on ink, cut to the beat.
 *
 * 120 bags billed. 100 delivered. ₹12,000 paid for nothing — and nobody
 * noticed, because building runs on WhatsApp, phone calls and trust. The
 * chatter collapses and is laid again as bricks: one honest record. Three
 * courses — site team, builder, family — then the mark, built on the level.
 */
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';

import {FONT} from '../../brand/fonts';
import {clamp01, EASE, EXIT, prog, SETTLE} from '../../brand/motion';
import {brand} from '../../brand/tokens';
import {BenchmarkMark, MARK_BUILD} from '../../components/brand/BenchmarkMark';
import {Brick, BrickWall, landingFrames, layWall, Wordmark, type WallLayout} from '../../components/brand/motifs';
import {KineticText, Roller} from '../../components/motion/text';
import {HomeownerHomeScreen} from '../../screens/HomeownerHomeScreen';
import {OwnerBriefScreen} from '../../screens/OwnerBriefScreen';
import {SiteCaptureScreen} from '../../screens/SiteCaptureScreen';
import {ChatBurst} from '../shared/ChatFlood';
import {InkStage, Sfx, useLayout} from '../shared/layout';
import {PhoneShot} from '../shared/PhoneShot';
import {framesPerBeat, type Format} from '../timing';

export const INK = {
  paper: '#f3efe6',
  muted: '#b3a991',
  marigold: brand.marigold,
  risk: '#f08a7b',
  sage: '#74b89d',
  clay: '#dc8a64',
};

const BEAT = framesPerBeat('b'); // 15 frames at 120 bpm
const BAR = BEAT * 4;

type SceneProps = {dur: number; fmt: Format};

/* ------------------------------------------------------------------ hook */

export function HookB({dur, fmt}: SceneProps) {
  const frame = useCurrentFrame();
  const L = useLayout() === 'landscape';
  const reel = fmt === 'reel';
  // One number slot that rolls; the words change with it, a bar apart.
  const steps = reel
    ? [
        {at: 0, n: '120', words: 'bags billed.'},
        {at: BAR, n: '100', words: 'bags delivered.'},
        {at: BAR * 2, n: '₹12,000', words: 'paid for nothing.'},
      ]
    : [
        {at: 0, n: '120', words: 'bags billed.'},
        {at: BAR, n: '100', words: 'bags delivered.'},
        {at: BAR * 2, n: '₹12,000', words: 'paid for nothing.'},
      ];
  const nobody = reel ? -1 : BAR * 3;
  const numOut = nobody > 0 ? prog(frame, nobody - 6, 8, EXIT) : prog(frame, dur - 8, 8, EXIT);
  const numIn = prog(frame, 0, 8, SETTLE);
  const numSize = L ? 300 : 214;
  const wordSize = L ? 132 : 112;
  return (
    <InkStage grid={0.5} gridReveal={prog(frame, 0, 30, EASE)}>
      {steps.map((s, i) => (
        <Sfx key={i} name="hit" at={s.at + 1} volume={0.55} />
      ))}
      {nobody > 0 ? <Sfx name="swell" at={nobody - 4} volume={0.4} /> : null}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          paddingLeft: L ? 240 : 80,
          paddingBottom: L ? 40 : 120,
          opacity: 1 - numOut,
          transform: `scale(${1.06 - 0.06 * numIn})`,
          transformOrigin: 'left center',
        }}
      >
        <Roller
          values={steps.map((s) => s.n)}
          at={steps.slice(1).map((s) => s.at)}
          duration={10}
          stagger={2}
          colors={[INK.paper, INK.paper, INK.risk]}
          style={{fontFamily: FONT.data, fontWeight: 500, fontSize: numSize, lineHeight: 1, letterSpacing: -numSize * 0.04, alignSelf: 'flex-start'}}
        />
        <div style={{position: 'relative', height: wordSize * 1.2, marginTop: L ? 8 : 16}}>
          {steps.map((s, i) => {
            const next = steps[i + 1]?.at ?? (nobody > 0 ? nobody : dur);
            return (
              <div key={s.words} style={{position: 'absolute', left: 0, top: 0}}>
                <KineticText
                  text={s.words}
                  start={s.at + 4}
                  stagger={3}
                  duration={12}
                  exitAt={next - 6}
                  exitDuration={6}
                  style={{fontFamily: FONT.display, fontWeight: 700, fontSize: wordSize, lineHeight: 1.05, letterSpacing: -2, color: i === 2 ? INK.risk : INK.paper, whiteSpace: 'nowrap'}}
                />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      {nobody > 0 ? (
        <AbsoluteFill style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <KineticText
            text="Nobody noticed."
            start={nobody}
            stagger={5}
            duration={18}
            exitAt={dur - 8}
            exitDuration={8}
            style={{fontFamily: FONT.display, fontWeight: 600, fontSize: L ? 130 : 120, color: INK.muted, letterSpacing: -2}}
          />
        </AbsoluteFill>
      ) : null}
    </InkStage>
  );
}

/* ----------------------------------------------------------------- noise */

function WordSlam({word, at, until, size, color = INK.paper}: {word: string; at: number; until: number; size: number; color?: string}) {
  const frame = useCurrentFrame();
  if (frame < at || frame >= until) return null;
  const p = prog(frame, at, 7, SETTLE);
  return (
    <AbsoluteFill style={{display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'}}>
      <div
        style={{
          background: brand.inkTile,
          padding: `${size * 0.1}px ${size * 0.32}px ${size * 0.16}px`,
          borderRadius: size * 0.12,
          boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
          transform: `scale(${1.25 - 0.25 * p})`,
          opacity: clamp01(p * 2),
          fontFamily: FONT.display,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.1,
          letterSpacing: -size * 0.02,
          color,
          whiteSpace: 'nowrap',
        }}
      >
        {word}
      </div>
    </AbsoluteFill>
  );
}

export function NoiseB({dur, fmt}: SceneProps) {
  const frame = useCurrentFrame();
  const L = useLayout() === 'landscape';
  const reel = fmt === 'reel';
  const lead = prog(frame, 0, 10, EASE) * (1 - prog(frame, reel ? BAR * 0.5 : BAR - 8, 8, EXIT));
  const size = L ? 190 : 150;
  const slams = reel
    ? [
        {word: 'WhatsApp.', at: BAR * 0.5},
        {word: 'Phone calls.', at: BAR},
        {word: 'And trust.', at: BAR * 1.5, color: INK.marigold},
      ]
    : [
        {word: 'WhatsApp.', at: BAR},
        {word: 'Phone calls.', at: BAR * 2},
        {word: 'And trust.', at: BAR * 3, color: INK.marigold},
      ];
  return (
    <InkStage grid={0.35}>
      <ChatBurst start={reel ? 2 : 14} count={reel ? 24 : 30} stagger={reel ? 3 : 5} scale={L ? 1.35 : 1.6} seed={3} />
      {slams.map((s, i) => (
        <Sfx key={i} name="hit" at={s.at} volume={0.5} />
      ))}
      <Sfx name="riser" at={0} volume={0.3} duration={dur} />
      <AbsoluteFill style={{display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: lead}}>
        <div
          style={{
            fontFamily: FONT.display,
            fontWeight: 600,
            fontSize: L ? 84 : 92,
            lineHeight: 1.1,
            color: INK.paper,
            textAlign: 'center',
            background: 'rgba(27,25,22,0.88)',
            padding: '18px 44px 26px',
            borderRadius: 24,
          }}
        >
          <KineticText text={L ? 'Because building a home runs on…' : 'Because building\na home runs on…'} start={2} stagger={3} duration={14} />
        </div>
      </AbsoluteFill>
      {slams.map((s, i) => (
        <WordSlam key={s.word} word={s.word} at={s.at} until={slams[i + 1]?.at ?? dur} size={size} color={s.color} />
      ))}
    </InkStage>
  );
}

/* ------------------------------------------------------------------ turn */

const RECORD_BRICKS = ['Voice note', 'Photo', 'Invoice', 'Delivery', 'Approval', 'Drawing', 'Attendance', 'Payment'];

function recordWall(L: boolean): WallLayout {
  const c = [brand.clay, '#3e7a66', '#c9bfa9', '#8a5a2b', '#4a443a', brand.clay, '#3e7a66', '#c9bfa9'];
  const label = (i: number) => (L ? RECORD_BRICKS[i % RECORD_BRICKS.length] : undefined);
  const brick = (i: number, w = 1) => ({w, color: c[i % c.length], label: w === 1 ? label(i) : undefined, labelColor: c[i % c.length] === '#c9bfa9' ? '#2a2519' : '#fcfaf3'});
  return L
    ? {
        brick: {w: 250, h: 74},
        joint: 12,
        courses: [
          [0, 1, 2, 3, 4, 5].map((i) => brick(i)),
          [brick(6, 0.5), ...[7, 8, 9, 10, 11].map((i) => brick(i)), brick(12, 0.5)],
          [13, 14, 15, 16, 17, 18].map((i) => brick(i)),
        ],
      }
    : {
        brick: {w: 216, h: 70},
        joint: 10,
        courses: [
          [0, 1, 2, 3].map((i) => brick(i)),
          [brick(4, 0.5), ...[5, 6, 7].map((i) => brick(i)), brick(8, 0.5)],
          [9, 10, 11, 12].map((i) => brick(i)),
          [brick(13, 0.5), ...[14, 15, 16].map((i) => brick(i)), brick(17, 0.5)],
        ],
      };
}

export function TurnB({dur, fmt}: SceneProps) {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const L = useLayout() === 'landscape';
  const reel = fmt === 'reel';
  const wall = recordWall(L);
  const placed = layWall(wall);
  const wallW = Math.max(...placed.map((b) => b.x + b.w));
  const wallH = wall.courses.length * (wall.brick.h + wall.joint);
  const layStart = reel ? 8 : 18;
  const stagger = reel ? 2 : 3;
  const lands = landingFrames(placed.length, layStart, stagger, 12);
  const titleAt = reel ? BAR : BAR * 2;
  const lineAt = titleAt + (reel ? 26 : 40);
  // The wall settles lower to make room for the name.
  const lift = prog(frame, titleAt - 10, 20, SETTLE);
  const wallTop = L ? height * 0.5 - wallH / 2 + lift * 170 : height * 0.5 - wallH / 2 + lift * 300;
  const point = prog(frame, titleAt - 8, 12, SETTLE);
  const out = prog(frame, dur - 10, 10, EXIT);
  return (
    <InkStage grid={0.5}>
      {/* The chatter collapses. */}
      <ChatBurst start={-400} count={reel ? 24 : 30} stagger={reel ? 3 : 5} scale={L ? 1.35 : 1.6} seed={3} fallAt={0} />
      {lands.filter((_, i) => i % 2 === 0).map((f, i) => (
        <Sfx key={i} name="thud" at={f} volume={0.32} />
      ))}
      <Sfx name="hit" at={titleAt} volume={0.6} />
      <Sfx name="chime" at={titleAt + 4} volume={0.45} />
      <div style={{position: 'absolute', left: (width - wallW) / 2, top: wallTop, width: wallW, opacity: 1 - out}}>
        <BrickWall layout={wall} start={layStart} stagger={stagger} duration={12} fontSize={L ? 21 : 18} />
        {/* The benchmark point drops onto the top course. */}
        <div
          style={{
            position: 'absolute',
            left: wallW / 2 - 26,
            top: -60 - (1 - point) * 160,
            width: 52,
            height: 52,
            borderRadius: 26,
            background: INK.marigold,
            opacity: point,
            boxShadow: '0 10px 30px rgba(240,162,31,0.35)',
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: L ? 110 : 330,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          opacity: 1 - out,
        }}
      >
        <Wordmark size={L ? 210 : 230} color={INK.paper} hindiColor={INK.marigold} start={titleAt} align="center" showHindi={false} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: L ? 352 : 610,
          textAlign: 'center',
          fontFamily: FONT.text,
          fontSize: L ? 44 : 50,
          color: INK.muted,
          opacity: prog(frame, lineAt, 14, EASE) * (1 - out),
          padding: '0 60px',
        }}
      >
        <span style={{color: INK.marigold, fontFamily: FONT.display, fontWeight: 600}}>नींव</span>
        {'  ·  '}One honest record of the build.
      </div>
    </InkStage>
  );
}

/* --------------------------------------------------------- three courses */

type CourseCopy = {label: string; brick: string; brickText: string; words: string[]; accent: number; sub: string};

function CourseScene({
  dur,
  fmt,
  copy,
  children,
  focus,
  time,
  captionOutAt,
}: SceneProps & {
  copy: CourseCopy;
  children: React.ReactNode;
  focus: Array<{f: number; z: number; fy?: number; dy?: number}>;
  time: string;
  /** Fade the words early (Reels: before the phone rises over them). */
  captionOutAt?: number;
}) {
  const frame = useCurrentFrame();
  const L = useLayout() === 'landscape';
  const reel = fmt === 'reel';
  const brickIn = prog(frame, 0, 12, SETTLE);
  const wordGap = reel ? BEAT : BEAT * 2;
  const wordsAt = reel ? 6 : BEAT * 2;
  const subAt = wordsAt + copy.words.length * wordGap + (reel ? 4 : BEAT);
  const sub = prog(frame, subAt, 14, EASE);
  const out = Math.max(prog(frame, dur - 10, 10, EXIT), captionOutAt === undefined ? 0 : prog(frame, captionOutAt, 10, EXIT));
  const wordSize = L ? 150 : 132;
  return (
    <InkStage grid={0.3}>
      <Sfx name="whoosh" at={0} volume={0.35} />
      {copy.words.map((_, i) => (
        <Sfx key={i} name="tick" at={wordsAt + i * wordGap} volume={0.4} />
      ))}
      <PhoneShot
        x={L ? 1210 : 246}
        y={L ? 44 : 820}
        scale={L ? 1.13 : 1.42}
        enterAt={reel ? 2 : 8}
        exitAt={dur - 10}
        glow
        time={time}
        focus={focus}
      >
        {children}
      </PhoneShot>
      <div style={{position: 'absolute', left: L ? 150 : 80, top: L ? 200 : 262, width: L ? 960 : 920, opacity: 1 - out}}>
        <div style={{transform: `translateX(${(1 - brickIn) * -420}px)`, opacity: brickIn, display: 'inline-block'}}>
          <Brick width={L ? 330 : 300} height={L ? 74 : 70} color={copy.brick} label={copy.label} labelColor={copy.brickText} fontSize={L ? 24 : 24} />
        </div>
        <div style={{marginTop: L ? 34 : 26, display: 'flex', flexDirection: reel && copy.words.length > 2 ? 'row' : 'column', flexWrap: 'wrap', columnGap: 26}}>
          {copy.words.map((w, i) => (
            <KineticText
              key={w}
              text={w}
              start={wordsAt + i * wordGap}
              stagger={3}
              duration={12}
              style={{
                fontFamily: FONT.display,
                fontWeight: 700,
                fontSize: reel && copy.words.length > 2 ? 104 : L ? wordSize : 112,
                lineHeight: 1.02,
                letterSpacing: -wordSize * 0.02,
                color: i === copy.accent ? INK.marigold : INK.paper,
              }}
            />
          ))}
        </div>
        <div
          style={{
            marginTop: L ? 40 : 28,
            fontFamily: FONT.text,
            fontSize: L ? 36 : 38,
            lineHeight: 1.4,
            color: INK.muted,
            maxWidth: L ? 820 : 900,
            opacity: sub,
            transform: `translateY(${(1 - sub) * 12}px)`,
          }}
        >
          {copy.sub}
        </div>
      </div>
    </InkStage>
  );
}

export function SiteB({dur, fmt}: SceneProps) {
  const reel = fmt === 'reel';
  const marks = reel ? {pressAt: 16, releaseAt: 62, entryAt: 100} : {pressAt: 60, releaseAt: 140, entryAt: 205};
  return (
    <CourseScene
      dur={dur}
      fmt={fmt}
      time="6:52"
      copy={{
        label: 'Site team',
        brick: INK.marigold,
        brickText: '#1b1916',
        words: ['Speak.', 'Snap.', 'Done.'],
        accent: 2,
        sub: reel ? 'Hindi or English. Neev writes it down.' : 'Hold to talk, in Hindi or English. Neev writes it down, with the voice note and photos as proof.',
      }}
      focus={
        reel
          ? [
              {f: 0, z: 1},
              {f: 66, z: 1},
              {f: 86, z: 1.12, fy: 470},
              {f: 98, z: 1.12, fy: 470},
              {f: 118, z: 1.06, fy: 330},
            ]
          : [
              {f: 0, z: 1},
              {f: 146, z: 1},
              {f: 172, z: 1.28, fy: 470},
              {f: 200, z: 1.28, fy: 470},
              {f: 224, z: 1.24, fy: 320},
              {f: 296, z: 1.24, fy: 320},
            ]
      }
    >
      <SiteCaptureScreen marks={marks} />
      <Sfx name="press" at={marks.pressAt} volume={0.45} />
      <Sfx name="send" at={marks.releaseAt} volume={0.45} />
      <Sfx name="ping" at={marks.entryAt + 6} volume={0.4} />
    </CourseScene>
  );
}

export function BuilderB({dur, fmt}: SceneProps) {
  const reel = fmt === 'reel';
  const marks = reel ? {evidenceAt: 34, compareAt: 46, holdAt: 118} : {evidenceAt: 110, compareAt: 128, holdAt: 250};
  return (
    <CourseScene
      dur={dur}
      fmt={fmt}
      time="11:40"
      copy={{
        label: 'Builder',
        brick: brand.clay,
        brickText: '#fcfaf3',
        words: ['Decisions', 'with proof.'],
        accent: 1,
        sub: reel ? 'Neev never moves money. It shows the proof.' : 'The invoice says 120 bags; the site logged 100. Neev never moves money. It shows you what doesn’t add up.',
      }}
      captionOutAt={reel ? 56 : undefined}
      focus={
        reel
          ? [
              // Reels: lift the proof clear of Instagram's caption area.
              {f: 0, z: 1},
              {f: 50, z: 1},
              {f: 70, z: 1.12, fy: 560, dy: -480},
              {f: 110, z: 1.12, fy: 560, dy: -480},
              {f: 128, z: 1.06, fy: 600, dy: -440},
            ]
          : [
              {f: 0, z: 1},
              {f: 118, z: 1},
              {f: 154, z: 1.34, fy: 470},
              {f: 236, z: 1.34, fy: 470},
              {f: 262, z: 1.16, fy: 600},
              {f: 352, z: 1.16, fy: 600},
            ]
      }
    >
      <OwnerBriefScreen marks={marks} />
      <Sfx name="tick" at={marks.evidenceAt} volume={0.35} />
      <Sfx name="whoosh" at={marks.compareAt} volume={0.3} />
      <Sfx name="press" at={marks.holdAt} volume={0.45} />
      <Sfx name="ping" at={marks.holdAt + 12} volume={0.4} />
    </CourseScene>
  );
}

export function FamilyB({dur, fmt}: SceneProps) {
  const reel = fmt === 'reel';
  const marks = reel ? {heroAt: 8, toggleAt: 84} : {heroAt: 36, toggleAt: 170};
  return (
    <CourseScene
      dur={dur}
      fmt={fmt}
      time="7:30"
      copy={{
        label: 'Family',
        brick: '#3e7a66',
        brickText: '#fcfaf3',
        words: ['Calm.', 'Clear.', 'True.'],
        accent: 2,
        sub: reel ? 'In Hindi or English, top to bottom.' : '“You’re okay” only when the record says so. In Hindi or English, top to bottom.',
      }}
      focus={
        reel
          ? [
              {f: 0, z: 1},
              {f: 14, z: 1},
              {f: 44, z: 1.1, fy: 300},
              {f: 80, z: 1.1, fy: 300},
              {f: 90, z: 1, fy: 300},
              {f: 112, z: 1.12, fy: 300},
            ]
          : [
              {f: 0, z: 1},
              {f: 40, z: 1},
              {f: 76, z: 1.28, fy: 290},
              {f: 150, z: 1.28, fy: 290},
              {f: 166, z: 1, fy: 330},
              {f: 200, z: 1.3, fy: 300},
              {f: 296, z: 1.3, fy: 300},
            ]
      }
    >
      <HomeownerHomeScreen marks={marks} />
      <Sfx name="tick" at={marks.toggleAt} volume={0.45} />
    </CourseScene>
  );
}

/* ---------------------------------------------------------------- truths */

export function TruthsB({dur}: SceneProps) {
  const frame = useCurrentFrame();
  const L = useLayout() === 'landscape';
  const step = Math.round(dur / 3);
  const lines: Array<Array<{t: string; c: string}>> = [
    [{t: 'Nothing', c: INK.paper}, {t: 'invented.', c: INK.paper}],
    [{t: 'Proof', c: INK.marigold}, {t: 'on tap.', c: INK.paper}],
    [{t: 'हिंदी.', c: INK.marigold}, {t: 'English.', c: INK.paper}],
  ];
  const i = Math.min(2, Math.floor(frame / step));
  const local = frame - i * step;
  const p = prog(local, 0, 8, SETTLE);
  const size = L ? 200 : 176;
  return (
    <InkStage grid={0.3}>
      {lines.map((_, k) => (
        <Sfx key={k} name="hit" at={k * step} volume={0.5} />
      ))}
      <AbsoluteFill style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div
          style={{
            display: 'flex',
            flexDirection: L ? 'row' : 'column',
            alignItems: 'center',
            gap: L ? size * 0.28 : 0,
            transform: `scale(${1.1 - 0.1 * p})`,
            opacity: clamp01(p * 2) * (1 - prog(frame, dur - 8, 8, EXIT)),
          }}
        >
          {lines[i].map((w) => (
            <span key={w.t} style={{fontFamily: FONT.display, fontWeight: 700, fontSize: size, lineHeight: 1.08, letterSpacing: -size * 0.02, color: w.c, whiteSpace: 'nowrap'}}>
              {w.t}
            </span>
          ))}
        </div>
      </AbsoluteFill>
    </InkStage>
  );
}

/* ------------------------------------------------------------------- end */

export function EndB({dur, fmt}: SceneProps) {
  const frame = useCurrentFrame();
  const L = useLayout() === 'landscape';
  const reel = fmt === 'reel';
  const markSize = L ? 300 : 320;
  const speed = 1.4;
  const built = 4 + MARK_BUILD.total / speed;
  const word = prog(frame, built - 6, 18, SETTLE);
  const tag = prog(frame, built + 10, 16, EASE);
  const cta = prog(frame, built + 28, 16, EASE);
  const fadeOut = reel ? 0 : prog(frame, dur - 16, 16, EASE);
  return (
    <InkStage grid={0.45} gridReveal={prog(frame, 0, 40, EASE)}>
      <Sfx name="hit" at={built - 4} volume={0.6} />
      <Sfx name="chime" at={built - 2} volume={0.5} />
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: L ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: L ? 60 : 30,
          opacity: 1 - fadeOut,
          paddingBottom: L ? 120 : 380,
        }}
      >
        <BenchmarkMark size={markSize} buildFrom={4} speed={speed} levelColor={brand.marigold} peakColor={brand.marigold} pointColor={brand.marigold} />
        <div style={{display: 'flex', flexDirection: 'column', alignItems: L ? 'flex-start' : 'center', opacity: word, transform: `translateX(${L ? (1 - word) * -30 : 0}px)`}}>
          <div style={{fontFamily: FONT.display, fontWeight: 700, fontSize: L ? 190 : 200, lineHeight: 0.95, letterSpacing: -5, color: INK.paper}}>Neev</div>
          <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: L ? 64 : 70, color: INK.marigold, marginTop: 6}}>नींव</div>
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: L ? 690 : 1180,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          opacity: 1 - fadeOut,
        }}
      >
        <div style={{fontFamily: FONT.display, fontWeight: 700, fontSize: L ? 76 : 84, color: INK.paper, letterSpacing: -1.5, opacity: tag, transform: `translateY(${(1 - tag) * 16}px)`}}>
          Build on the truth.
        </div>
        <div
          style={{
            marginTop: L ? 34 : 44,
            opacity: cta,
            transform: `translateY(${(1 - cta) * 12}px)`,
            border: `2px solid ${INK.marigold}`,
            color: INK.marigold,
            borderRadius: 999,
            padding: L ? '12px 30px' : '16px 36px',
            fontFamily: FONT.text,
            fontWeight: 600,
            fontSize: L ? 26 : 32,
          }}
        >
          Coming soon to iPhone and Android
        </div>
      </div>
    </InkStage>
  );
}

export const SCENES_B = {hook: HookB, noise: NoiseB, turn: TurnB, site: SiteB, builder: BuilderB, family: FamilyB, truths: TruthsB, end: EndB};
