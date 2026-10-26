/**
 * The three Neev families plus the Feather icon font, loaded from public/fonts.
 * Eczar and Hind both carry Devanagari, so Hindi never falls back to a system
 * face. Importing this module is enough: Remotion waits for every face.
 */
import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

const faces: Array<[family: string, file: string, weight: string]> = [
  ['Eczar', 'Eczar-Medium.ttf', '500'],
  ['Eczar', 'Eczar-SemiBold.ttf', '600'],
  ['Eczar', 'Eczar-Bold.ttf', '700'],
  ['Hind', 'Hind-Regular.ttf', '400'],
  ['Hind', 'Hind-SemiBold.ttf', '600'],
  ['Hind', 'Hind-Bold.ttf', '700'],
  ['IBM Plex Mono', 'IBMPlexMono-Regular.ttf', '400'],
  ['IBM Plex Mono', 'IBMPlexMono-Medium.ttf', '500'],
  ['Feather', 'Feather.ttf', '400'],
];

for (const [family, file, weight] of faces) {
  loadFont({family, url: staticFile(`fonts/${file}`), weight});
}

export const FONT = {
  /** Headings only, 17px and up. */
  display: '"Eczar", "Hind", Georgia, serif',
  /** Text and UI. */
  text: '"Hind", system-ui, sans-serif',
  /** Money, counts, codes and timestamps. */
  data: '"IBM Plex Mono", ui-monospace, monospace',
  icon: 'Feather',
};
