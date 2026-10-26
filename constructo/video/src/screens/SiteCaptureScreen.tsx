/**
 * Site team: the engineer holds to talk on site, and Neev turns the voice note
 * into a site record with its proof. Choreographed by four frame marks.
 */
import {useCurrentFrame} from 'remotion';

import {FONT} from '../brand/fonts';
import {clamp01, EASE, GLIDE, prog, SETTLE} from '../brand/motion';
import {useTheme} from '../brand/theme';
import {EntryCard} from '../components/ui/cards';
import {Icon} from '../components/ui/Icon';
import {Card, Eyebrow, StatusPill} from '../components/ui/primitives';
import {CaptureButton, SITE_TABS, TabBar} from '../components/ui/widgets';
import {graphemes} from '../components/motion/text';

export const SITE_TRANSCRIPT = 'आज 14 लोग आए। दूसरी मंज़िल की शटरिंग शुरू हो गई। सीमेंट के 100 बैग आए हैं।';
export const SITE_TRANSCRIPT_EN = 'Fourteen workers today. Second-floor shuttering has started. 100 bags of cement arrived.';

export type SiteCaptureMarks = {
  /** Thumb lands on the capture spark; the talk sheet rises. */
  pressAt: number;
  /** Released: the voice note is sent and transcribed. */
  releaseAt: number;
  /** The structured site record arrives. */
  entryAt: number;
};

function Waveform({frame, active, bars = 34, color}: {frame: number; active: number; bars?: number; color: string}) {
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 3.2, height: 54}}>
      {Array.from({length: bars}, (_, i) => {
        const v = Math.abs(Math.sin(frame * 0.33 + i * 0.7) * Math.sin(frame * 0.11 + i * 0.23));
        const h = 6 + active * 44 * (0.25 + 0.75 * v);
        return <div key={i} style={{width: 4, height: h, borderRadius: 2, background: color, opacity: 0.5 + 0.5 * active}} />;
      })}
    </div>
  );
}

export function SiteCaptureScreen({marks}: {marks: SiteCaptureMarks}) {
  const frame = useCurrentFrame();
  const t = useTheme();
  const {pressAt, releaseAt, entryAt} = marks;

  const sheet = prog(frame, pressAt, 14, SETTLE) * (1 - prog(frame, entryAt, 14, GLIDE));
  const recording = prog(frame, pressAt + 6, 8, EASE) * (1 - prog(frame, releaseAt, 6, EASE));
  const seconds = Math.min(9, Math.max(0, Math.floor(((frame - pressAt - 6) / (releaseAt - pressAt - 6)) * 9.99)));
  const sent = prog(frame, releaseAt, 12, SETTLE);
  const typing = clamp01((frame - releaseAt - 8) / Math.max(1, entryAt - releaseAt - 20));
  const g = graphemes(SITE_TRANSCRIPT);
  const typed = Math.round(g.length * typing);
  const entry = prog(frame, entryAt, 18, SETTLE);
  const rows = clamp01((frame - entryAt - 10) / 30) * 3.999;

  return (
    <div style={{position: 'absolute', inset: 0, background: t.surface}}>
      {/* Home: today's work */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: '64px 20px 0',
          opacity: (1 - 0.35 * sheet) * (1 - 0.25 * entry),
        }}
      >
        <Eyebrow>Verma Duplex · 6:52 am</Eyebrow>
        <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 30, lineHeight: '38px', color: t.ink, marginTop: 4}}>
          Good morning, Ramesh.
        </div>
        <div style={{fontFamily: FONT.text, fontSize: 16, color: t.inkMuted, marginTop: 2}}>3 things on site today</div>
        <Card style={{marginTop: 16 + 338 * entry, padding: '6px 0'}}>
          {[
            ['Shuttering for the 2nd-floor slab', 'Starts today'],
            ['Receive the cement delivery', 'Due this morning'],
            ['Waterproofing water test', 'Master bath'],
          ].map(([title, sub], i) => (
            <div key={title} style={{display: 'flex', gap: 14, alignItems: 'center', padding: '12px 16px', borderTop: i ? `1px solid ${t.line}` : 'none'}}>
              <span style={{width: 24, height: 24, borderRadius: 12, border: `2px solid ${t.lineControl}`}} />
              <span style={{display: 'flex', flexDirection: 'column'}}>
                <span style={{fontFamily: FONT.text, fontSize: 16.5, color: t.ink, lineHeight: '23px'}}>{title}</span>
                <span style={{fontFamily: FONT.text, fontSize: 14, color: t.inkMuted}}>{sub}</span>
              </span>
            </div>
          ))}
        </Card>
        <Card style={{marginTop: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12}}>
          <Icon name="message-circle" size={20} color={t.brand} />
          <span style={{fontFamily: FONT.text, fontSize: 16, color: t.ink, flex: 1}}>Ask from the owner</span>
          <StatusPill tone="warn" label="1 open" size="sm" />
        </Card>
      </div>

      <TabBar
        tabs={SITE_TABS}
        active={0}
        capture={2}
        captureNode={<CaptureButton glyph="mic" recording={0} />}
      />

      {/* Hold-to-talk sheet */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 600,
          transform: `translateY(${(1 - sheet) * 640}px)`,
          background: t.surfaceRaised,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          boxShadow: '0 -10px 40px rgba(42,37,25,0.18)',
          padding: '14px 22px 0',
          zIndex: 12,
        }}
      >
        <div style={{width: 44, height: 5, borderRadius: 3, background: t.line, margin: '0 auto 18px'}} />
        <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 24, color: t.ink, textAlign: 'center'}}>
          {sent > 0.5 ? 'Sent to the site log' : 'Hold to talk'}
        </div>
        <div style={{fontFamily: FONT.text, fontSize: 15.5, color: t.inkMuted, textAlign: 'center', marginTop: 2}}>
          {sent > 0.5 ? 'Neev is writing it down' : 'Speak in Hindi or English'}
        </div>

        {/* Voice note + live transcript once sent */}
        <div
          style={{
            marginTop: 18,
            opacity: sent,
            transform: `translateY(${(1 - sent) * 30}px)`,
            background: t.surfaceInset,
            border: `1px solid ${t.line}`,
            borderRadius: 16,
            padding: '12px 14px',
            minHeight: 128,
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
            <span style={{width: 34, height: 34, borderRadius: 17, background: t.marigold, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <Icon name="mic" size={17} color={t.onMarigold} />
            </span>
            <span style={{fontFamily: FONT.text, fontWeight: 600, fontSize: 15, color: t.ink}}>Voice note</span>
            <span style={{fontFamily: FONT.data, fontSize: 14, color: t.inkMuted, marginLeft: 'auto'}}>0:09</span>
          </div>
          <div style={{fontFamily: FONT.text, fontSize: 18, lineHeight: '29px', color: t.ink, marginTop: 8}}>
            {g.slice(0, typed).join('')}
            {/* The untyped rest holds the layout still. */}
            <span style={{opacity: 0}}>{g.slice(typed).join('')}</span>
          </div>
        </div>

        {/* The talk button with its live waveform */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 70,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 18,
            opacity: 1 - sent,
          }}
        >
          <Waveform frame={frame} active={recording} color={t.marigoldEdge} />
          <span style={{fontFamily: FONT.data, fontSize: 22, color: t.ink}}>0:0{seconds}</span>
          <CaptureButton size={96} glyph="mic" recording={recording} pulse={(frame / 26) % 1} />
          <span style={{fontFamily: FONT.text, fontSize: 15, color: t.inkMuted}}>Release to send</span>
        </div>
      </div>

      {/* The structured record */}
      <div
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          top: 150,
          opacity: entry,
          transform: `translateY(${(1 - entry) * 220}px)`,
          zIndex: 14,
        }}
      >
        <EntryCard
          eyebrow="Site update · 6:52 am"
          title="Verma Duplex · 2nd floor"
          rowsShown={rows}
          statusIn={prog(frame, entryAt + 40, 10, SETTLE)}
          rows={[
            {label: 'Workers', value: '14 on site'},
            {label: 'Work', value: 'Shuttering started for the 2nd-floor slab'},
            {label: 'Material', value: 'Cement · 100 bags received'},
          ]}
          evidence={[
            {icon: 'mic', label: 'Voice note 0:09'},
            {icon: 'image', label: '2 photos'},
          ]}
        />
      </div>
    </div>
  );
}
