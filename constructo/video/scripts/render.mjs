// Render the Neev films (and their stills) from one bundle.
//   node scripts/render.mjs                  → every film
//   node scripts/render.mjs NeevA-YouTube    → just that one
// Masters land in out/films/<id>.mp4 (H.264 + AAC, 30 fps). Then run
// scripts/finish.sh to normalise loudness to -14 LUFS for YouTube/Instagram.
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'out', 'films');
mkdirSync(outDir, {recursive: true});

const FILMS = ['NeevA-YouTube', 'NeevA-Reel', 'NeevB-YouTube', 'NeevB-Reel'];
const ids = process.argv.slice(2).length ? process.argv.slice(2) : FILMS;

const serveUrl = await bundle({entryPoint: path.join(root, 'src', 'index.ts')});
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE ?? null;

for (const id of ids) {
  const inputProps = {audio: true, safeGuide: false};
  const composition = await selectComposition({serveUrl, id, inputProps, browserExecutable});
  const output = path.join(outDir, `${id}.mp4`);
  const started = Date.now();
  let last = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: output,
    inputProps,
    browserExecutable,
    imageFormat: 'jpeg',
    jpegQuality: 95,
    crf: 14,
    x264Preset: 'slow',
    pixelFormat: 'yuv420p',
    audioBitrate: '320k',
    concurrency: Math.max(1, os.cpus().length),
    overwrite: true,
    onProgress: ({progress}) => {
      const pct = Math.floor(progress * 10);
      if (pct !== last) {
        last = pct;
        process.stdout.write(`${id} ${pct * 10}%\n`);
      }
    },
  });
  console.log(`${id} → ${output} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
}
