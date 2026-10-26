/**
 * A film = its cut sheet's sections played in series, plus its score.
 * The same scenes lay themselves out for 16:9 (YouTube) or 9:16 (Reels).
 */
import type {ComponentType} from 'react';
import {AbsoluteFill, Html5Audio, Series, staticFile} from 'remotion';

import {SCENES_A} from './a/scenes';
import {SCENES_B} from './b/scenes';
import {AudioOn, SafeZoneGuide} from './shared/layout';
import {sections, type Format, type Variant} from './timing';

export type FilmProps = {
  variant: Variant;
  format: Format;
  /** Play the score and sound cues. */
  audio: boolean;
  /** Draw the Reels safe zone over the picture (preview only). */
  safeGuide: boolean;
};

type SceneComponent = ComponentType<{dur: number; fmt: Format}>;

const SCENES: Record<Variant, Record<string, SceneComponent>> = {
  a: SCENES_A,
  b: SCENES_B,
};

export function Film({variant, format, audio, safeGuide}: FilmProps) {
  const secs = sections(variant, format);
  return (
    <AudioOn.Provider value={audio}>
      <AbsoluteFill>
        <Series>
          {secs.map((s) => {
            const Scene = SCENES[variant][s.id];
            return (
              <Series.Sequence key={s.id} durationInFrames={s.duration} name={s.id}>
                <Scene dur={s.duration} fmt={format} />
              </Series.Sequence>
            );
          })}
        </Series>
        {audio ? <Html5Audio src={staticFile(`audio/music/${variant}-${format}.wav`)} volume={0.9} /> : null}
        {safeGuide ? <SafeZoneGuide /> : null}
      </AbsoluteFill>
    </AudioOn.Provider>
  );
}
