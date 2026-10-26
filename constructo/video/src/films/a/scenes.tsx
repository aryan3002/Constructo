/**
 * Film A — "All good, sir?" Calm, documentary, on sand.
 *
 * A family asks how the work is going and hears "सब बढ़िया है, सर।" (All good,
 * sir.) — but is it? Most site updates drown in the chat. Neev keeps one honest
 * record: the site team speaks it, the builder sees what doesn't add up, and
 * the family gets "सब ठीक है।" (You're okay.) — same words, this time with proof.
 */
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';

import {FONT} from '../../brand/fonts';
import {EASE, EXIT, prog, SETTLE} from '../../brand/motion';
import {day} from '../../brand/tokens';
import {BenchmarkMark, MARK_BUILD} from '../../components/brand/BenchmarkMark';
import {LevelDatum, Wordmark} from '../../components/brand/motifs';
import {KineticText} from '../../components/motion/text';
import {Bubble, TypingDots} from '../../components/ui/chat';
import {Icon, type IconName} from '../../components/ui/Icon';
import {HomeownerHomeScreen} from '../../screens/HomeownerHomeScreen';
import {OwnerBriefScreen} from '../../screens/OwnerBriefScreen';
import {SITE_TRANSCRIPT_EN, SiteCaptureScreen} from '../../screens/SiteCaptureScreen';
import {CaptionBlock} from '../shared/CaptionBlock';
import {ChatColumns} from '../shared/ChatFlood';
import {SandStage, Sfx, useLayout} from '../shared/layout';
import {PhoneShot} from '../shared/PhoneShot';
import type {Format} from '../timing';

const COLORS = {eyebrow: day.clayText, title: day.ink, body: day.inkMuted};

type SceneProps = {dur: number; fmt: Format};

/* ------------------------------------------------------------------ hook */

export function HookA({dur, fmt}: SceneProps) {
  const frame = useCurrentFrame();
  const L = useLayout() === 'landscape';
  const k = fmt === 'reel' ? 0.75 : 1;
  const tQ = Math.round(10 * k);
  const tDots = Math.round(40 * k);
  const tA = Math.round(64 * k);
  const tBut = Math.round(98 * k);
  const q = prog(frame, tQ, 14, SETTLE);
  const dots = prog(frame, tDots, 8, EASE) * (1 - prog(frame, tA - 4, 6, EASE));
  const a = prog(frame, tA, 14, SETTLE);
  const out = prog(frame, dur - 12, 12, EXIT);
  const fs = L ? 40 : 46;
  const panel = L ? {left: 160, top: 300, width: 780} : {left: 70, top: 300, width: 940};

  return (
    <SandStage>
      <Sfx name="send" at={tQ} volume={0.5} />
      <Sfx name="pop" at={tA} volume={0.55} />
      <Sfx name="swell" at={tBut - 6} volume={0.5} />
      <div style={{position: 'absolute', ...panel, opacity: 1 - out}}>
        {/* Chat header */}
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
            <span style={{fontFamily: FONT.text, fontStyle: 'italic', fontSize: L ? 24 : 30, color: day.inkMuted, marginTop: 8, marginRight: 6}}>
              “How’s the work going?”
            </span>
          </div>
          <div style={{height: L ? 60 : 76, position: 'relative'}}>
            <div style={{position: 'absolute', left: 0, top: 6, opacity: dots, transform: `scale(${L ? 1.5 : 1.9})`, transformOrigin: 'left top'}}>
              <TypingDots phase={frame / 9} />
            </div>
            <div style={{position: 'absolute', left: 0, top: 0, opacity: a, transform: `translateY(${(1 - a) * 24}px)`, display: 'flex', flexDirection: 'column', alignItems: 'flex-start'}}>
              <Bubble side="in" time="8:48 pm" fontSize={fs} maxWidth={panel.width}>
                सब बढ़िया है, सर।
              </Bubble>
              <span style={{fontFamily: FONT.text, fontStyle: 'italic', fontSize: L ? 24 : 30, color: day.inkMuted, marginTop: 8, marginLeft: 6}}>
                “All good, sir.”
              </span>
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          ...(L ? {left: 1060, top: 430, width: 800} : {left: 70, top: 1100, width: 940}),
          opacity: 1 - out,
        }}
      >
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

export function NoiseA({dur, fmt}: SceneProps) {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const L = useLayout() === 'landscape';
  const reel = fmt === 'reel';
  const titleSize = L ? 92 : 96;
  const scrim = prog(frame, 6, 20, EASE) * (1 - prog(frame, dur - 10, 10, EXIT));
  return (
    <SandStage>
      <ChatColumns
        columns={L ? [60, 530, 1000, 1470] : [30, 560]}
        colWidth={L ? 420 : 500}
        scale={L ? 1.3 : 1.55}
        v0={L ? 2.4 : 3.2}
        accel={reel ? 0.09 : 0.03}
        exitAt={dur - 14}
      />
      <Sfx name="riser" at={reel ? 0 : 60} volume={0.35} duration={dur} />
      {/* A calm pool of sand behind the words */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse ${L ? '62% 38%' : '90% 26%'} at 50% 50%, rgba(243,239,230,0.97) 0%, rgba(243,239,230,0.93) 55%, rgba(243,239,230,0) 100%)`,
          opacity: scrim,
        }}
      />
      <div style={{position: 'absolute', left: 0, right: 0, top: height / 2 - (L ? 110 : 230), display: 'flex', justifyContent: 'center'}}>
        <div style={{width: L ? 1360 : 900, textAlign: 'center'}}>
          {reel ? (
            <KineticText
              text={'Most site\nupdates get lost\nin the chat.'}
              start={8}
              stagger={3}
              duration={18}
              highlight={{lost: day.clay}}
              style={{fontFamily: FONT.display, fontWeight: 600, fontSize: titleSize, lineHeight: 1.08, letterSpacing: -1.6, color: day.ink}}
            />
          ) : (
            <>
              <div style={{position: 'absolute', left: (width - (L ? 1360 : 900)) / 2, width: L ? 1360 : 900}}>
                <KineticText
                  text={'A home is built on a\nthousand small updates.'}
                  start={14}
                  stagger={3}
                  duration={18}
                  exitAt={118}
                  style={{fontFamily: FONT.display, fontWeight: 600, fontSize: titleSize, lineHeight: 1.08, letterSpacing: -1.6, color: day.ink}}
                />
              </div>
              <div style={{position: 'absolute', left: (width - (L ? 1360 : 900)) / 2, width: L ? 1360 : 900}}>
                <KineticText
                  text={'Most of them get\nlost in the chat.'}
                  start={128}
                  stagger={3}
                  duration={18}
                  highlight={{lost: day.clay}}
                  style={{fontFamily: FONT.display, fontWeight: 600, fontSize: titleSize, lineHeight: 1.08, letterSpacing: -1.6, color: day.ink}}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </SandStage>
  );
}

/* ---------------------------------------------------------------- reveal */

export function RevealA({dur, fmt}: SceneProps) {
  const frame = useCurrentFrame();
  const {width} = useVideoConfig();
  const L = useLayout() === 'landscape';
  const reel = fmt === 'reel';
  const speed = reel ? 1.5 : 1;
  const markFrom = reel ? 6 : 16;
  const markSize = L ? 210 : 250;
  const built = markFrom + MARK_BUILD.total / speed;
  const datum = prog(frame, 0, reel ? 16 : 26, EASE);
  const out = prog(frame, dur - 12, 12, EXIT);
  // The mark's level stroke sits on the datum line: y of the level in the mark = 78/100.
  const markTop = L ? 250 : 520;
  const lineY = markTop + markSize * 0.78;
  return (
    <SandStage grid={0.55} gridReveal={prog(frame, 0, 40, EASE)}>
      <Sfx name="tick" at={2} volume={0.35} />
      <Sfx name="chime" at={built - 6} volume={0.6} />
      <div style={{opacity: 1 - out}}>
        <LevelDatum x={0} y={lineY} length={width} progress={datum} color={day.lineControl} label="±0.00" size={L ? 1.2 : 1.5} labelStyle={{opacity: 0.9}} />
        <div style={{position: 'absolute', left: (width - markSize) / 2, top: markTop}}>
          <BenchmarkMark size={markSize} buildFrom={markFrom} speed={speed} />
        </div>
        <div style={{position: 'absolute', left: 0, right: 0, top: lineY + (L ? 50 : 70), display: 'flex', justifyContent: 'center'}}>
          <Wordmark size={L ? 150 : 190} color={day.ink} hindiColor={day.clay} start={Math.round(built - 18)} align="center" />
        </div>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: lineY + (L ? 300 : 380),
            textAlign: 'center',
            fontFamily: FONT.text,
            fontSize: L ? 40 : 48,
            color: day.inkMuted,
            opacity: prog(frame, built + 4, 16, EASE),
            transform: `translateY(${(1 - prog(frame, built + 4, 16, EASE)) * 14}px)`,
            padding: '0 60px',
          }}
        >
          {reel ? 'Neev keeps one honest record of the build.' : 'One honest record of the build.'}
        </div>
      </div>
    </SandStage>
  );
}

/* ------------------------------------------------------------- phone rig */

function usePhoneRig() {
  const L = useLayout() === 'landscape';
  return L
    ? {phone: {x: 1196, y: 44, scale: 1.13}, caption: {left: 150, top: 300, width: 860}, titleSize: 92, bodySize: 35}
    : {phone: {x: 233, y: 690, scale: 1.48}, caption: {left: 80, top: 262, width: 920}, titleSize: 84, bodySize: 38};
}

/* ------------------------------------------------------------------ site */

export function SiteA({dur, fmt}: SceneProps) {
  const frame = useCurrentFrame();
  const rig = usePhoneRig();
  const reel = fmt === 'reel';
  const marks = reel ? {pressAt: 22, releaseAt: 80, entryAt: 128} : {pressAt: 56, releaseAt: 146, entryAt: 226};
  const quote = prog(frame, marks.releaseAt + 8, 16, EASE) * (1 - prog(frame, marks.entryAt + 36, 14, EXIT));
  const swapAt = marks.entryAt + 50;
  const out = dur - 12;
  return (
    <SandStage>
      <Sfx name="press" at={marks.pressAt} volume={0.5} />
      <Sfx name="send" at={marks.releaseAt} volume={0.5} />
      <Sfx name="ping" at={marks.entryAt + 6} volume={0.45} />
      <Sfx name="tick" at={marks.entryAt + 40} volume={0.3} />
      <PhoneShot
        {...rig.phone}
        enterAt={4}
        exitAt={out}
        time="6:52"
        focus={
          reel
            ? [
                {f: 0, z: 1},
                {f: 84, z: 1},
                {f: 104, z: 1.12, fy: 470},
                {f: 126, z: 1.12, fy: 470},
                {f: 146, z: 1.08, fy: 320},
              ]
            : [
                {f: 0, z: 1},
                {f: 152, z: 1},
                {f: 180, z: 1.3, fy: 470},
                {f: 218, z: 1.3, fy: 470},
                {f: 244, z: 1, fy: 422},
                {f: 282, z: 1.28, fy: 320},
                {f: 390, z: 1.28, fy: 320},
              ]
        }
      >
        <SiteCaptureScreen marks={marks} />
      </PhoneShot>
      <div style={{position: 'absolute', ...rig.caption}}>
        <CaptionBlock
          eyebrow="For the site team · 6:52 am"
          title={reel ? 'Speak in Hindi\nor English.' : 'Speak. Snap.\nDone.'}
          body={reel ? 'Neev writes it down.' : 'Hold to talk, in Hindi or English. Neev writes it down.'}
          start={6}
          exitAt={reel ? out : swapAt}
          titleSize={rig.titleSize}
          bodySize={rig.bodySize}
          colors={COLORS}
        />
        {!reel ? (
          <>
            <div
              style={{
                marginTop: 44,
                paddingLeft: 24,
                borderLeft: `4px solid ${day.clay}`,
                opacity: quote,
                transform: `translateY(${(1 - quote) * 14}px)`,
                width: 700,
              }}
            >
              <div style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 20, letterSpacing: 2.4, color: day.clayText, textTransform: 'uppercase'}}>
                What Ramesh said
              </div>
              <div style={{fontFamily: FONT.text, fontStyle: 'italic', fontSize: 32, lineHeight: 1.4, color: day.ink, marginTop: 8}}>
                “{SITE_TRANSCRIPT_EN}”
              </div>
            </div>
            <div style={{position: 'absolute', left: 0, top: 0, width: rig.caption.width}}>
              <CaptionBlock
                eyebrow="Every entry keeps its proof"
                title={'The voice note,\nthe photos,\nthe time.'}
                body="One tap away, for everyone who needs it."
                start={swapAt + 10}
                exitAt={out}
                titleSize={rig.titleSize}
                bodySize={rig.bodySize}
                colors={COLORS}
              />
            </div>
          </>
        ) : null}
      </div>
    </SandStage>
  );
}

/* --------------------------------------------------------------- builder */

export function BuilderA({dur, fmt}: SceneProps) {
  const frame = useCurrentFrame();
  const rig = usePhoneRig();
  const reel = fmt === 'reel';
  const marks = reel ? {evidenceAt: 44, compareAt: 58, holdAt: 128} : {evidenceAt: 120, compareAt: 140, holdAt: 290};
  const note = prog(frame, marks.holdAt + 34, 16, EASE);
  const out = dur - 12;
  return (
    <SandStage>
      <Sfx name="tick" at={marks.evidenceAt} volume={0.35} />
      <Sfx name="whoosh" at={marks.compareAt} volume={0.3} />
      <Sfx name="press" at={marks.holdAt} volume={0.5} />
      <Sfx name="ping" at={marks.holdAt + 12} volume={0.45} />
      <PhoneShot
        {...rig.phone}
        enterAt={4}
        exitAt={out}
        time="11:40"
        focus={
          reel
            ? [
                {f: 0, z: 1},
                {f: 54, z: 1},
                {f: 78, z: 1.16, fy: 470},
                {f: 112, z: 1.16, fy: 470},
                {f: 132, z: 1.04, fy: 560},
              ]
            : [
                {f: 0, z: 1},
                {f: 128, z: 1},
                {f: 164, z: 1.36, fy: 470},
                {f: 262, z: 1.36, fy: 470},
                {f: 288, z: 1.16, fy: 600},
                {f: 470, z: 1.16, fy: 600},
              ]
        }
      >
        <OwnerBriefScreen marks={marks} />
      </PhoneShot>
      <div style={{position: 'absolute', ...rig.caption}}>
        <CaptionBlock
          eyebrow="For the builder · 11:40 am"
          title={reel ? 'What doesn’t add up\ncomes first.' : 'Exceptions first.\nProof on tap.'}
          body={reel ? undefined : 'The invoice says 120 bags. The site logged 100. Neev puts that on top, with both pieces of proof.'}
          start={6}
          exitAt={out}
          titleSize={rig.titleSize}
          bodySize={rig.bodySize}
          colors={COLORS}
          highlight={{'120': day.clay, '100.': day.clay}}
        />
        {!reel ? (
          <div
            style={{
              marginTop: 40,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              opacity: note * (1 - prog(frame, out, 12, EXIT)),
              transform: `translateY(${(1 - note) * 10}px)`,
              fontFamily: FONT.text,
              fontSize: 28,
              color: day.inkMuted,
            }}
          >
            <Icon name="shield" size={28} color={day.brand} />
            Tracking only. Neev never moves money.
          </div>
        ) : null}
      </div>
    </SandStage>
  );
}

/* ---------------------------------------------------------------- family */

export function FamilyA({dur, fmt}: SceneProps) {
  const rig = usePhoneRig();
  const reel = fmt === 'reel';
  const marks = reel ? {heroAt: 14, toggleAt: 96} : {heroAt: 36, toggleAt: 196};
  const swapAt = marks.toggleAt + 18;
  const out = dur - 12;
  return (
    <SandStage>
      <Sfx name="chime" at={marks.heroAt + 10} volume={0.3} />
      <Sfx name="tick" at={marks.toggleAt} volume={0.45} />
      <PhoneShot
        {...rig.phone}
        enterAt={4}
        exitAt={out}
        time="7:30"
        focus={
          reel
            ? [
                {f: 0, z: 1},
                {f: 20, z: 1},
                {f: 50, z: 1.1, fy: 300},
                {f: 90, z: 1.1, fy: 300},
                {f: 100, z: 1, fy: 300},
                {f: 120, z: 1.12, fy: 300},
              ]
            : [
                {f: 0, z: 1},
                {f: 38, z: 1},
                {f: 74, z: 1.3, fy: 290},
                {f: 172, z: 1.3, fy: 290},
                {f: 192, z: 1, fy: 330},
                {f: 230, z: 1.32, fy: 300},
                {f: 392, z: 1.32, fy: 300},
              ]
        }
      >
        <HomeownerHomeScreen marks={marks} />
      </PhoneShot>
      <div style={{position: 'absolute', ...rig.caption}}>
        <CaptionBlock
          eyebrow={reel ? 'For the family' : 'For the family · 7:30 pm, Dubai'}
          title={'Calm, clear\nand true.'}
          body={reel ? undefined : 'Nothing needs them today, and Neev can show why.'}
          start={6}
          exitAt={swapAt - 14}
          titleSize={rig.titleSize}
          bodySize={rig.bodySize}
          colors={COLORS}
        />
        <div style={{position: 'absolute', left: 0, top: 0, width: rig.caption.width}}>
          <CaptionBlock
            eyebrow={reel ? 'सब ठीक है।' : 'सब ठीक है। · You’re okay.'}
            title={'Same words.\nThis time,\nwith proof.'}
            body={reel ? undefined : 'In Hindi or English, from top to bottom.'}
            start={swapAt}
            exitAt={out}
            titleSize={rig.titleSize}
            bodySize={rig.bodySize}
            colors={{...COLORS, eyebrow: day.brandStrong}}
            highlight={{'proof.': day.brand}}
          />
        </div>
      </div>
    </SandStage>
  );
}

/* ---------------------------------------------------------------- truths */

const TRUTHS: Array<{icon: IconName; text: string}> = [
  {icon: 'check-circle', text: 'Nothing on screen is invented.'},
  {icon: 'paperclip', text: 'Every claim is one tap from its proof.'},
  {icon: 'globe', text: 'Hindi or English, top to bottom.'},
];

export function TruthsA({dur}: SceneProps) {
  const frame = useCurrentFrame();
  const L = useLayout() === 'landscape';
  const step = Math.round(dur / 3);
  const out = prog(frame, dur - 14, 14, EXIT);
  return (
    <SandStage grid={0.35}>
      {TRUTHS.map((_, i) => (
        <Sfx key={i} name="tick" at={8 + i * step} volume={0.35} />
      ))}
      <div
        style={{
          position: 'absolute',
          left: L ? 260 : 80,
          top: L ? 270 : 560,
          display: 'flex',
          flexDirection: 'column',
          gap: L ? 56 : 80,
          opacity: 1 - out,
        }}
      >
        {TRUTHS.map((truth, i) => {
          const at = 8 + i * step;
          const p = prog(frame, at, 18, SETTLE);
          const dim = i < 2 ? 1 - 0.5 * prog(frame, at + step, 16, EASE) : 1;
          return (
            <div key={truth.text} style={{display: 'flex', alignItems: 'center', gap: 32, opacity: Math.min(1, p * 1.4) * dim}}>
              <span
                style={{
                  width: L ? 84 : 96,
                  height: L ? 84 : 96,
                  borderRadius: 50,
                  background: day.brandSoft,
                  color: day.brandStrong,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: `scale(${0.6 + 0.4 * p})`,
                  flexShrink: 0,
                }}
              >
                <Icon name={truth.icon} size={L ? 40 : 46} />
              </span>
              <KineticText
                text={truth.text}
                start={at + 2}
                stagger={2}
                duration={16}
                style={{fontFamily: FONT.display, fontWeight: 600, fontSize: L ? 70 : 64, lineHeight: 1.12, letterSpacing: -1, color: day.ink, maxWidth: L ? 1300 : 800}}
              />
            </div>
          );
        })}
      </div>
    </SandStage>
  );
}

/* ------------------------------------------------------------------- end */

export function EndA({dur, fmt}: SceneProps) {
  const frame = useCurrentFrame();
  const L = useLayout() === 'landscape';
  const reel = fmt === 'reel';
  const markSize = L ? 170 : 220;
  const built = 6 + MARK_BUILD.total;
  const tag = prog(frame, built + 4, 18, EASE);
  const sub = prog(frame, built + 16, 18, EASE);
  const cta = prog(frame, built + 32, 18, EASE);
  const fadeOut = reel ? 0 : prog(frame, dur - 18, 18, EASE);
  return (
    <SandStage grid={0.4} gridReveal={prog(frame, 0, 50, EASE)}>
      <Sfx name="chime" at={built - 8} volume={0.55} />
      <AbsoluteFill style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, opacity: 1 - fadeOut, paddingBottom: L ? 40 : 160}}>
        <BenchmarkMark size={markSize} buildFrom={6} />
        <div style={{marginTop: L ? 18 : 30}}>
          <Wordmark size={L ? 140 : 180} color={day.ink} hindiColor={day.clay} start={built - 16} align="center" />
        </div>
        <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: L ? 48 : 58, color: day.ink, marginTop: L ? 34 : 50, opacity: tag, transform: `translateY(${(1 - tag) * 14}px)`, textAlign: 'center', padding: '0 60px'}}>
          One honest record of the build.
        </div>
        <div style={{fontFamily: FONT.text, fontSize: L ? 32 : 40, color: day.inkMuted, marginTop: 10, opacity: sub, transform: `translateY(${(1 - sub) * 12}px)`}}>
          For the site team and the family.
        </div>
        <div
          style={{
            marginTop: L ? 44 : 64,
            opacity: cta,
            transform: `translateY(${(1 - cta) * 12}px)`,
            border: `2px solid ${day.brand}`,
            color: day.brandStrong,
            borderRadius: 999,
            padding: L ? '12px 30px' : '16px 36px',
            fontFamily: FONT.text,
            fontWeight: 600,
            fontSize: L ? 26 : 32,
          }}
        >
          Coming soon to iPhone and Android
        </div>
      </AbsoluteFill>
    </SandStage>
  );
}

export const SCENES_A = {hook: HookA, noise: NoiseA, reveal: RevealA, site: SiteA, builder: BuilderA, family: FamilyA, truths: TruthsA, end: EndA};

