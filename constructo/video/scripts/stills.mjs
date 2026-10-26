// Render many stills from one bundle (much faster than `remotion still` per frame).
// usage: node scripts/stills.mjs <CompositionId> <frame> [<frame> ...]
//        node scripts/stills.mjs <CompositionId> --every <n>      (a contact sheet's worth)
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {mkdirSync} from 'node:fs';
import path from 'node:path';

const [id, ...rest] = process.argv.slice(2);
if (!id) {
  console.error('usage: node scripts/stills.mjs <CompositionId> <frame...> | --every <n>');
  process.exit(1);
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'out', 'stills');
mkdirSync(outDir, {recursive: true});

const serveUrl = await bundle({entryPoint: path.join(root, 'src', 'index.ts')});
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE ?? null;
// e.g. INPUT_PROPS='{"safeGuide":true}' to draw the Reels safe zone.
const inputProps = process.env.INPUT_PROPS ? JSON.parse(process.env.INPUT_PROPS) : {};
const composition = await selectComposition({serveUrl, id, inputProps, browserExecutable});

let frames = rest.map(Number);
if (rest[0] === '--every') {
  const n = Number(rest[1]);
  frames = [];
  for (let f = Math.floor(n / 2); f < composition.durationInFrames; f += n) frames.push(f);
}
for (const frame of frames) {
  const suffix = process.env.INPUT_PROPS ? '-props' : '';
  const output = path.join(outDir, `${id}-${String(frame).padStart(5, '0')}${suffix}.png`);
  await renderStill({composition, serveUrl, output, frame, inputProps, browserExecutable, overwrite: true});
  console.log(output);
}
