# Neev films

The Neev launch films and the motion kit they are built from. Everything is code
(Remotion + React): the picture, the app screens, and the score and sound
effects (generated in Python). There is no stock footage and no licensed audio,
so you can edit, re-cut or reuse any of it.

## The films

There are three films, each cut for YouTube (16:9) and Reels (9:16). C is the
intro: it keeps A's look, borrows B's bricks, and gives the homeowner side of
the app its full due.

### C · "सब ठीक है?" (the Neev intro)

Anita lives in Dubai; her parents' home is going up in Pune. Every evening the
site says "सब ठीक है, सर।" (All good, sir.). But is it? The chatter of a build
goes dark and is laid again as bricks, each one a kind of record (voice note,
site photo, invoice, weekly letter…), and the marigold point lands: Neev. The site
team speaks, the builder sees what doesn't add up, and then the family gets
the whole picture: a calm Home, every photo dated and placed, a weekly letter
they can listen to, answers from the record (and never a guess about money or
safety), their own choices with the cost and the wait spelled out, and Maa
invited in, reading the same truth in Hindi. Same words. This time, with proof.

- Score: D major at 100 bpm. A's plucked strings with B's drums, a build that cuts dead on "lost", toms while the bricks are laid, and a groove that changes colour with each part of the app.
- YouTube: 1:40 (`NeevC-YouTube`). Reel: 0:46 (`NeevC-Reel`).
- Voiceover: optional, made with Google Text-to-Speech (see **Voice** below). Without it, the words on screen carry the story.

### A and B

| | A · "All good, sir?" | B · "Build on the truth" |
|---|---|---|
| Feel | Calm, documentary, on sand (the app's Day palette) | Bold, kinetic, on ink, cut to the beat |
| Hook | A family asks how the work is going and hears "सब बढ़िया है, सर।" (All good, sir.). But is it? | "120 bags billed. 100 delivered. ₹12,000 paid for nothing." |
| Story | One day on one build: the site team speaks a voice note, the builder catches the invoice that doesn't match, the family gets "सब ठीक है।" (You're okay.). Same words, this time with proof. | The chatter collapses and is laid again as bricks: one honest record, then three courses (site team, builder, family) and the mark |
| Score | Warm D major, 90 bpm: plucked strings, pad, shaker | E minor, 120 bpm: dhol-style toms, sub bass, a drop on the bricks |
| YouTube | 1:17 (`NeevA-YouTube`) | 1:10 (`NeevB-YouTube`) |
| Reel | 0:35 (`NeevA-Reel`) | 0:34 (`NeevB-Reel`) |

Both tell the same true story from the product: a 6:52 am voice note in Hindi
becomes a site record (14 workers, shuttering started, 100 bags of cement). At
11:40 the owner sees a cement invoice for 120 bags flagged against that log, and
puts the payment on hold (Neev records it; it never moves money). At 7:30 pm in
Dubai the family's Home says "You're okay." because nothing needs them. The
owner's invoice check stays internal. The family switches the app to Hindi.
Names are fictional; the supplier is made up on purpose.

## Run it

```sh
cd constructo/video
npm install
npm run audio             # generate the score and sound effects (needs uv, or pip install numpy scipy)
npm run studio            # preview, scrub and tweak every film and component
```

The music WAVs aren't committed (they're ~40 MB and regenerate identically),
so run `npm run audio` once after cloning.

Render the films, stills and the logo sting:

```sh
node scripts/render.mjs                    # all four films → out/films/*.mp4
node scripts/render.mjs NeevA-Reel         # just one
scripts/finish.sh                          # loudness → -14 LUFS, -1 dBTP → out/final/
node scripts/stills.mjs Thumb-A 0          # any frame of any composition → out/stills/
npx remotion render LogoSting-Night out/neev-sting-night.mov \
  --codec=prores --prores-profile=4444 --pixel-format=yuva444p10le --image-format=png
```

In a container with Chrome already installed, set
`REMOTION_BROWSER_EXECUTABLE=/path/to/chrome-headless-shell` first.

### Sound

```sh
uv run --with numpy --with scipy python scripts/audio/sfx.py     # → public/audio/sfx/*.wav
uv run --with numpy --with scipy python scripts/audio/score.py   # → public/audio/music/<variant>-<format>.wav
```

The score is written against `src/films/cuts.json`, the same bar grid the
picture uses, so any change to a cut sheet re-times the music too. To swap in a
licensed track instead, replace `public/audio/music/<variant>-<format>.wav` with
a file of the same length. The sound cues stay in sync because they are placed
by frame.

### Voice (film C)

Film C's voiceover is written in `src/films/c/vo.json`: a narrator in Indian
English, plus the opening exchange in Hindi, heard as if on a call. It is
made with ElevenLabs (key in `ELEVENLABS_API_KEY`, `api.elevenlabs.io` allowed)
or, with `--provider google`, Google Cloud Text-to-Speech (`GOOGLE_TTS_API_KEY`).
ElevenLabs' free plan isn't licensed for commercial use, so publish from a paid plan.

```sh
npm run vo -- audition       # library voices, numbered → out/vo/audition/en-IN.mp3, hi-IN.mp3 (previews cost no credits)
npm run vo -- make --narrator eleven:<owner>/<id> --owner eleven:… --site eleven:…
VO=1 node scripts/render.mjs NeevC-YouTube NeevC-Reel
scripts/finish.sh out/films/NeevC-*.mp4
```

`make` lays every line on the cut sheet (`public/audio/vo/c-<format>.wav`),
ducks the score 9 dB under speech (`c-<format>-ducked.wav`), writes captions
(`out/final/NeevC-<Format>.srt`), and prints a timing table that flags any line
that runs into the next. The chosen voices are saved in `vo.json`. To use a
recorded voice instead, save it as `public/audio/vo/c-<format>.wav` (48 kHz,
lined up with the film from 0:00) and run `npm run vo -- duck`.

## Compositions

| Id | What |
|---|---|
| `NeevA-…`, `NeevB-…`, `NeevC-YouTube`, `NeevC-Reel` | The films. Props: `audio`, `vo` (film C's voiceover), `safeGuide` (draws the Reels safe zone) |
| `LogoSting-Day`, `LogoSting-Night` | 3 s mark build + name; transparent background |
| `Thumb-A`, `Thumb-B`, `Thumb-C` | YouTube thumbnails, 1280×720 |
| `Cover-A`, `Cover-B`, `Cover-C` | Reel covers, 1080×1920; words sit inside the 3:4 grid crop |
| `Library` | One-page index of the component kit |
| `ScreensTest`, `HomeScreensTest` | The app screens side by side, for scrubbing |

## The kit (`src/`)

- **`brand/`**: `tokens.ts` (Day and Night palettes from the design system),
  `fonts.ts` (Eczar, Hind and IBM Plex Mono, all with Devanagari where it's
  needed, plus Feather icons), `motion.ts` (the app's ease, `SETTLE`, `GLIDE`,
  `prog`, `window`, `beatGrid`), `theme.tsx`.
- **`components/brand/`**:
  - `BenchmarkMark`: the mark built in reading order (level → legs → point), exactly as the app's splash
  - `Wordmark`
  - `SurveyGrid`: the setting-out grid
  - `LevelDatum`: the section-drawing ▽ ±0.00
  - `Brick` and `BrickWall`: stretcher-bond courses that settle in, with `landingFrames` for sound cues
  - `CityMap`: two cities with local clocks and people, joined by an arc that updates travel along
- **`components/motion/`**:
  - `KineticText`: word-by-word reveals through a mask
  - `TypeOn`: types by grapheme, so Hindi conjuncts never break
  - `Roller`: a number slot that rolls 120 → 100 → ₹12,000
  - `Counter`
  - `Camera`
- **`components/ui/`**: the app, recreated at its real point sizes.
  - `PhoneFrame`
  - `primitives` (Card, StatusPill, Button, EvidenceChip, Eyebrow, Money)
  - `widgets` (TimeBar, Toast, CaptureButton, TabBar, LanguageToggle)
  - `cards` (EntryCard, DecisionCard, HomeHero)
  - `chat` (Bubble, VoiceNote, PhotoMessage, MissedCall, TypingDots)
  - `SiteIllustration`: shuttering, brickwork, cement and rebar, drawn in the palette and used wherever the app shows a site photo
  - `Notification`: a lock-screen notification from Neev
- **`screens/`**: the three choreographed app moments. Each takes frame marks
  for its interactions.
  - `SiteCaptureScreen`: hold to talk, then the transcript, then the site record
  - `OwnerBriefScreen`: evidence, then the comparison, then hold payment
  - `HomeownerHomeScreen`: "You're okay.", then the switch to Hindi
  - `homeowner/`: the rest of the homeowner app, as used in film C
    - `PhotosScreen`: every photo dated, placed and tagged
    - `UpdatesScreen`: milestones and the weekly letter, with Listen
    - `AskScreen`: questions answered from the record; money and safety go to the builder
    - `SelectionScreen`: two tiles, the cost and the wait, then Approve
    - `HouseholdSheet`: invite a family member
- **`films/`**:
  - `cuts.json` and `timing.ts`: sections in bars
  - `shared/`: stages, `CaptionBlock`, `PhoneShot` (push in on any point of the screen), `ChatColumns`/`ChatBurst`, `Sfx` and the Reels safe zone
  - `a/`, `b/` and `c/`: each film's scenes; `c/vo.json` is film C's voiceover script

To make a new film, add a cut sheet to `cuts.json`, write scenes that take
`{dur, fmt}` and lay themselves out with `useLayout()`, and register it in
`Root.tsx`.

## Uploading

- **Loudness**: `scripts/finish.sh` brings each film to -14 LUFS integrated and
  -1 dBTP, which is where YouTube and Instagram play back.
- **Reels safe zone**: the films keep words out of the top 250 px, the bottom
  420 px and the lower right edge. Check with `safeGuide: true` in the Studio.
- **Instagram audio**: the score is original. If you'd rather use trending
  audio, lower the original audio in Instagram's editor, but keep a little of it
  so the sound cues still land.
- **Covers**: upload `Cover-A`/`B`/`C` as the Reel cover, and `Thumb-A`/`B`/`C`
  as the YouTube thumbnail.
- **Before you publish**: the end card says "Coming soon to iPhone and
  Android". Change it in `films/a/scenes.tsx` (`EndA`), `films/b/scenes.tsx`
  (`EndB`) and `films/c/scenes.tsx` (`EndC`) once you have a store link or a
  website address.

Titles, descriptions, YouTube chapters and captions are in `UPLOAD.md`.

## Licences

- Remotion is free for individuals and companies of up to three people; larger
  teams need a company licence (remotion.dev/license).
- Eczar, Hind and IBM Plex Mono are under the SIL Open Font License.
- Feather icons are MIT.
- All music, sound, illustrations and copy here are original to this project.
