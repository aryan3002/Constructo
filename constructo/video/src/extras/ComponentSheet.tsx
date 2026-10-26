/**
 * A one-page index of the film component library — render it as a still to
 * see every building block at a glance (out/library.png).
 */
import type {ReactNode} from 'react';
import {AbsoluteFill} from 'remotion';

import {FONT} from '../brand/fonts';
import {ThemeProvider} from '../brand/theme';
import {brand, day} from '../brand/tokens';
import {BenchmarkMark} from '../components/brand/BenchmarkMark';
import {Brick, LevelDatum, SurveyGrid, Wordmark} from '../components/brand/motifs';
import {Bubble, MissedCall, VoiceNote} from '../components/ui/chat';
import {DecisionCard, EntryCard, HOME_HERO_EN, HomeHero} from '../components/ui/cards';
import {EvidenceChip, StatusPill} from '../components/ui/primitives';
import {SiteIllustration} from '../components/ui/SiteIllustration';
import {CaptureButton, LanguageToggle, Toast} from '../components/ui/widgets';

function Cell({label, children, w, h}: {label: string; children: ReactNode; w: number; h: number}) {
  return (
    <div style={{width: w, height: h, display: 'flex', flexDirection: 'column', gap: 12}}>
      <div style={{fontFamily: FONT.data, fontSize: 15, color: day.inkMuted}}>{label}</div>
      <div style={{flex: 1, position: 'relative', borderRadius: 18, background: day.surfaceInset, border: `1px solid ${day.line}`, padding: 20, overflow: 'hidden'}}>
        {children}
      </div>
    </div>
  );
}

const SWATCHES: Array<[string, string]> = [
  ['surface', day.surface],
  ['ink', day.ink],
  ['brand', day.brand],
  ['clay', day.clay],
  ['marigold', day.marigold],
  ['ok', day.ok],
  ['warn', day.warn],
  ['risk', day.risk],
  ['inkTile', brand.inkTile],
];

export function ComponentSheet() {
  return (
    <ThemeProvider theme={day}>
      <AbsoluteFill style={{background: day.surface, padding: 56, display: 'flex', flexDirection: 'column', gap: 28}}>
        <div style={{display: 'flex', alignItems: 'baseline', gap: 24}}>
          <span style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 56, color: day.ink}}>Neev film kit</span>
          <span style={{fontFamily: FONT.text, fontSize: 24, color: day.inkMuted}}>constructo/video/src/components — brand, motion and app UI for every future film</span>
        </div>
        <div style={{display: 'flex', flexWrap: 'wrap', gap: 28}}>
          <Cell label="brand/BenchmarkMark · Wordmark" w={420} h={300}>
            <div style={{display: 'flex', alignItems: 'center', gap: 24, height: '100%'}}>
              <BenchmarkMark size={130} />
              <Wordmark size={90} color={day.ink} hindiColor={day.clay} />
            </div>
          </Cell>
          <Cell label="brand/motifs · SurveyGrid LevelDatum Brick" w={560} h={300}>
            <SurveyGrid width={560} height={300} pitch={30} dot={1.8} color={day.lineControl} opacity={0.6} />
            <LevelDatum x={0} y={120} length={560} color={day.ink} label="±0.00" />
            <div style={{position: 'absolute', left: 20, bottom: 24, display: 'flex', gap: 8}}>
              <Brick width={130} height={46} color={brand.clay} label="Invoice" fontSize={14} />
              <Brick width={130} height={46} color={day.brand} label="Photo" fontSize={14} />
              <Brick width={130} height={46} color={brand.marigold} label="Voice" labelColor="#1b1916" fontSize={14} />
            </div>
          </Cell>
          <Cell label="tokens · day palette" w={360} h={300}>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10}}>
              {SWATCHES.map(([name, c]) => (
                <div key={name} style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                  <div style={{height: 52, borderRadius: 10, background: c, border: `1px solid ${day.line}`}} />
                  <span style={{fontFamily: FONT.data, fontSize: 12, color: day.inkMuted}}>{name}</span>
                </div>
              ))}
            </div>
          </Cell>
          <Cell label="type · Eczar Hind Plex Mono" w={392} h={300}>
            <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 44, color: day.ink, lineHeight: 1.1}}>You’re okay.</div>
            <div style={{fontFamily: FONT.display, fontWeight: 600, fontSize: 40, color: day.ink, lineHeight: 1.3}}>सब ठीक है।</div>
            <div style={{fontFamily: FONT.text, fontSize: 20, color: day.inkMuted, marginTop: 6}}>Hind for text and UI · हिंदी</div>
            <div style={{fontFamily: FONT.data, fontSize: 30, color: day.ink, marginTop: 8}}>₹72,000 · 6:52</div>
          </Cell>
        </div>
        <div style={{display: 'flex', flexWrap: 'wrap', gap: 28}}>
          <Cell label="ui/cards · DecisionCard" w={440} h={560}>
            <div style={{transform: 'scale(1.0)', transformOrigin: 'top left', width: 396}}>
              <DecisionCard
                kind="Payment check"
                flag="Doesn't match"
                title="Cement invoice · Shree Balaji Traders"
                amount={72000}
                meta="Verma Duplex · 2nd-floor slab"
                evidence={[
                  {icon: 'file-text', label: 'Invoice'},
                  {icon: 'mic', label: 'Site log · 6:52 am'},
                ]}
                compare={1}
                compareRows={[
                  {label: 'Billed', value: '120 bags'},
                  {label: 'Logged on site', value: '100 bags'},
                ]}
                difference={{label: 'Difference', value: '20 bags · ₹12,000'}}
              />
            </div>
          </Cell>
          <Cell label="ui/cards · EntryCard" w={440} h={560}>
            <div style={{width: 396}}>
              <EntryCard
                eyebrow="Site update · 6:52 am"
                title="Verma Duplex · 2nd floor"
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
          </Cell>
          <Cell label="ui/cards · HomeHero + widgets" w={440} h={560}>
            <div style={{width: 396}}>
              <HomeHero copy={HOME_HERO_EN} progress={0.62} />
              <div style={{display: 'flex', alignItems: 'center', gap: 16, marginTop: 22}}>
                <CaptureButton glyph="mic" />
                <LanguageToggle position={1} />
              </div>
              <div style={{marginTop: 18}}>
                <Toast tone="warn" text="Payment on hold. Logged with its proof." />
              </div>
            </div>
          </Cell>
          <Cell label="ui/chat · Bubble VoiceNote MissedCall" w={380} h={560}>
            <div style={{display: 'flex', flexDirection: 'column', gap: 10, background: '#efeae2', margin: -20, padding: 20, height: 'calc(100% + 40px)'}}>
              <Bubble side="out" time="8:47 pm">
                काम कैसा चल रहा है?
              </Bubble>
              <Bubble side="in" time="8:48 pm" sender="Ramesh · Site">
                सब बढ़िया है, सर।
              </Bubble>
              <VoiceNote duration="0:43" time="9:20 am" played={0.4} width={240} />
              <MissedCall label="Missed voice call" time="11:15 am" />
              <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6}}>
                <StatusPill tone="ok" label="Recorded" size="sm" />
                <StatusPill tone="warn" label="On hold" size="sm" />
                <StatusPill tone="risk" label="Doesn't match" size="sm" />
                <EvidenceChip icon="image" label="2 photos" />
              </div>
            </div>
          </Cell>
          <Cell label="ui/SiteIllustration · 4 scenes" w={260} h={560}>
            <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
              {(['shuttering', 'brickwork', 'cement', 'rebar'] as const).map((s) => (
                <div key={s} style={{height: 112, borderRadius: 12, overflow: 'hidden'}}>
                  <SiteIllustration scene={s} />
                </div>
              ))}
            </div>
          </Cell>
        </div>
      </AbsoluteFill>
    </ThemeProvider>
  );
}
