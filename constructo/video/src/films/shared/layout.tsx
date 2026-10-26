/**
 * Shared film plumbing: which way up we are, the Reels safe zone, stages
 * (sand for the calm film, ink for the bold one) and sound cues.
 */
import {createContext, useContext, type ReactNode} from 'react';
import {AbsoluteFill, Html5Audio, Sequence, staticFile, useVideoConfig} from 'remotion';

import {brand, day} from '../../brand/tokens';
import {SurveyGrid} from '../../components/brand/motifs';

export type Layout = 'landscape' | 'portrait';

export function useLayout(): Layout {
  const {width, height} = useVideoConfig();
  return width >= height ? 'landscape' : 'portrait';
}

/**
 * Instagram Reels: keep words and faces out of the top 250px (header), the
 * bottom 420px (caption, audio, buttons) and the right 140px of the lower half.
 */
export const REEL_SAFE = {top: 250, bottom: 1500, left: 72, right: 1008};

export function SafeZoneGuide() {
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 250, background: 'rgba(255,0,0,0.18)'}} />
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 420, background: 'rgba(255,0,0,0.18)'}} />
      <div style={{position: 'absolute', right: 0, top: 960, width: 140, bottom: 420, background: 'rgba(255,0,0,0.12)'}} />
    </AbsoluteFill>
  );
}

export function SandStage({children, grid = 0, gridReveal = 1}: {children?: ReactNode; grid?: number; gridReveal?: number}) {
  const {width, height} = useVideoConfig();
  return (
    <AbsoluteFill style={{background: day.surface, overflow: 'hidden'}}>
      {grid > 0 ? <SurveyGrid width={width} height={height} pitch={56} dot={2.2} color={day.line} opacity={grid} reveal={gridReveal} /> : null}
      {children}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(42,37,25,0.07) 100%)',
        }}
      />
    </AbsoluteFill>
  );
}

export function InkStage({children, grid = 0, gridReveal = 1, drift = 0}: {children?: ReactNode; grid?: number; gridReveal?: number; drift?: number}) {
  const {width, height} = useVideoConfig();
  return (
    <AbsoluteFill style={{background: brand.inkTile, overflow: 'hidden'}}>
      {grid > 0 ? (
        <SurveyGrid width={width} height={height} pitch={60} dot={2.2} color="#4a443a" opacity={grid} reveal={gridReveal} offset={{x: 0, y: -drift}} />
      ) : null}
      {children}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.38) 100%)',
        }}
      />
    </AbsoluteFill>
  );
}

export type SfxName =
  | 'tick'
  | 'pop'
  | 'send'
  | 'whoosh'
  | 'thud'
  | 'ping'
  | 'press'
  | 'chime'
  | 'hit'
  | 'riser'
  | 'type'
  | 'swell';

/** Off for silent stills and previews before the sound files exist. */
export const AudioOn = createContext(true);

/** A one-shot sound from public/audio/sfx at frame `at` of the parent sequence. */
export function Sfx({name, at, volume = 0.6, duration = 120}: {name: SfxName; at: number; volume?: number; duration?: number}) {
  const on = useContext(AudioOn);
  if (!on || at < 0) return null;
  return (
    <Sequence from={Math.round(at)} durationInFrames={duration} layout="none" name={`sfx:${name}`}>
      <Html5Audio src={staticFile(`audio/sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );
}
