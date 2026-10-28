import './brand/fonts';

import {Composition, Still} from 'remotion';

import {HomeScreensTest} from './dev/HomeScreensTest';
import {ScreensTest} from './dev/ScreensTest';
import {ComponentSheet} from './extras/ComponentSheet';
import {CoverA, CoverB, CoverC, ThumbA, ThumbB, ThumbC} from './extras/Covers';
import {LogoSting, type LogoStingProps} from './extras/LogoSting';
import {Film, type FilmProps} from './films/Film';
import {DIMENSIONS, totalFrames} from './films/timing';
import {Smoke} from './dev/Smoke';

export function RemotionRoot() {
  return (
    <>
      <Composition id="Smoke" component={Smoke} durationInFrames={90} fps={30} width={1920} height={1080} />
      <Composition id="ScreensTest" component={ScreensTest} durationInFrames={240} fps={30} width={1620} height={1080} />
      <Composition id="HomeScreensTest" component={HomeScreensTest} durationInFrames={240} fps={30} width={2310} height={950} />
      <Composition id="LogoSting-Day" component={LogoSting} durationInFrames={90} fps={30} width={1920} height={1080} defaultProps={{tone: 'day'} satisfies LogoStingProps} />
      <Composition id="LogoSting-Night" component={LogoSting} durationInFrames={90} fps={30} width={1920} height={1080} defaultProps={{tone: 'night'} satisfies LogoStingProps} />
      <Still id="Thumb-A" component={ThumbA} width={1280} height={720} />
      <Still id="Thumb-B" component={ThumbB} width={1280} height={720} />
      <Still id="Cover-A" component={CoverA} width={1080} height={1920} />
      <Still id="Cover-B" component={CoverB} width={1080} height={1920} />
      <Still id="Thumb-C" component={ThumbC} width={1280} height={720} />
      <Still id="Cover-C" component={CoverC} width={1080} height={1920} />
      <Still id="Library" component={ComponentSheet} width={2200} height={1160} />
      {(['a', 'b', 'c'] as const).flatMap((variant) =>
        (['youtube', 'reel'] as const).map((format) => (
          <Composition
            key={`${variant}-${format}`}
            id={`Neev${variant.toUpperCase()}-${format === 'youtube' ? 'YouTube' : 'Reel'}`}
            component={Film}
            durationInFrames={totalFrames(variant, format)}
            fps={30}
            {...DIMENSIONS[format]}
            defaultProps={{variant, format, audio: false, safeGuide: false} satisfies FilmProps}
          />
        )),
      )}
    </>
  );
}
