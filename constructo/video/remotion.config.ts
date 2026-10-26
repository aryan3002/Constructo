import {Config} from '@remotion/cli/config';

// Flat colour and type compress best from lossless frames.
Config.setVideoImageFormat('png');
Config.setOverwriteOutput(true);
// Use an already-installed Chrome Headless Shell when one is provided (CI,
// containers); otherwise Remotion downloads its own on first render.
if (process.env.REMOTION_BROWSER_EXECUTABLE) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER_EXECUTABLE);
}
